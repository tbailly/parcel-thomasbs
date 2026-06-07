import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "./admin-auth.functions";

export type ProviderOverview = {
  id: string;
  name: string;
  color: string;
  logo_url: string;
  active_points: number;
  last_query_at: string | null;
  last_query_inserted: number | null;
};

export const getDashboardOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ providers: ProviderOverview[] }> => {
    const { data: providers, error: pErr } = await supabaseAdmin
      .from("providers")
      .select("id, name, color, logo_url")
      .order("name", { ascending: true });
    if (pErr) throw new Error(pErr.message);

    const results = await Promise.all(
      (providers ?? []).map(async (p) => {
        const [activeRes, lastQRes] = await Promise.all([
          supabaseAdmin
            .from("latest_pickup_points")
            .select("id", { count: "exact", head: true })
            .eq("provider_id", p.id),
          supabaseAdmin
            .from("queries")
            .select("finished_at, started_at, inserted_count")
            .eq("provider_id", p.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const lq = lastQRes.data;
        return {
          id: p.id as string,
          name: p.name as string,
          color: p.color as string,
          logo_url: p.logo_url as string,
          active_points: activeRes.count ?? 0,
          last_query_at: (lq?.finished_at ?? lq?.started_at ?? null) as string | null,
          last_query_inserted: (lq?.inserted_count ?? null) as number | null,
        };
      }),
    );

    return { providers: results };
  },
);

export type ProviderQuery = {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  error: string | null;
  postal_code: string | null;
  current_point_count: number;
  missing_hours_count: number;
};

function isEmptyHours(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export const getProviderQueries = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ provider_id: z.string().min(1).max(100) }).parse(i))
  .handler(async ({ data }): Promise<{ queries: ProviderQuery[] }> => {
    const { data: qs, error } = await supabaseAdmin
      .from("queries")
      .select("id, status, started_at, finished_at, created_at, error, postal_code")
      .eq("provider_id", data.provider_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const ids = (qs ?? []).map((q) => q.id as string);
    const totals = new Map<string, number>();
    const missing = new Map<string, number>();
    if (ids.length > 0) {
      const { data: pts } = await supabaseAdmin
        .from("pickup_points")
        .select("query_id, opening_hours")
        .in("query_id", ids);
      for (const row of pts ?? []) {
        const k = (row.query_id as string | null) ?? "";
        if (!k) continue;
        totals.set(k, (totals.get(k) ?? 0) + 1);
        if (isEmptyHours(row.opening_hours)) {
          missing.set(k, (missing.get(k) ?? 0) + 1);
        }
      }
    }

    return {
      queries: (qs ?? []).map((q) => ({
        id: q.id as string,
        status: q.status as string,
        started_at: q.started_at as string | null,
        finished_at: q.finished_at as string | null,
        created_at: q.created_at as string,
        error: q.error as string | null,
        postal_code: q.postal_code as string | null,
        current_point_count: totals.get(q.id as string) ?? 0,
        missing_hours_count: missing.get(q.id as string) ?? 0,
      })),
    };
  });

export type QueryPoint = {
  id: string;
  external_id: string | null;
  name: string;
  address: string;
  postal_code: string;
  city: string;
  lat: number;
  lng: number;
  notes: string | null;
  hours_fetched_at: string | null;
  updated_at: string;
  opening_hours_json: string;
  has_hours: boolean;
};

export const getQueryPoints = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ query_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }): Promise<{ points: QueryPoint[] }> => {
    const { data: pts, error } = await supabaseAdmin
      .from("pickup_points")
      .select("id, external_id, name, address, postal_code, city, lat, lng, notes, hours_fetched_at, updated_at, opening_hours")
      .eq("query_id", data.query_id)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      points: (pts ?? []).map((p) => ({
        id: p.id as string,
        external_id: p.external_id as string | null,
        name: p.name as string,
        address: p.address as string,
        postal_code: p.postal_code as string,
        city: p.city as string,
        lat: Number(p.lat),
        lng: Number(p.lng),
        notes: p.notes as string | null,
        hours_fetched_at: p.hours_fetched_at as string | null,
        updated_at: p.updated_at as string,
        opening_hours_json: JSON.stringify(p.opening_hours ?? {}),
        has_hours: !isEmptyHours(p.opening_hours),
      })),
    };
  });

export const deleteQuery = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((i) => z.object({ query_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin.from("queries").delete().eq("id", data.query_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cleanupOrphans = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
  // Points sans query (la cascade FK couvre déjà les query_id pointant dans le vide)
  const { data: orphanPoints, error: e1 } = await supabaseAdmin
    .from("pickup_points")
    .delete()
    .is("query_id", null)
    .select("id");
  if (e1) throw new Error(e1.message);

  // Enrichments sans point (defensive — la FK cascade les supprime normalement)
  const { data: orphanEnr, error: e2 } = await supabaseAdmin
    .from("enrichments")
    .delete()
    .is("point_id", null)
    .select("id");
  if (e2) throw new Error(e2.message);

  return {
    deleted_points: orphanPoints?.length ?? 0,
    deleted_enrichments: orphanEnr?.length ?? 0,
  };
});
