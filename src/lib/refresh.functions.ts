import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "./admin-auth.functions";

export const getRefreshProviders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("providers")
      .select("id, name, color, refresh_url, refresh_script")
      .not("refresh_url", "is", null)
      .not("refresh_script", "is", null)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);

    return {
      providers: (data ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        color: p.color as string,
        refresh_url: p.refresh_url as string,
        refresh_script: p.refresh_script as string,
      })),
    };
  },
);

const PointSchema = z.object({
  external_id: z.string().min(1).max(255).nullable().optional(),
  name: z.string().min(1).max(500),
  address: z.string().min(1).max(1000),
  postal_code: z.string().min(1).max(20),
  city: z.string().min(1).max(255),
  lat: z.number(),
  lng: z.number(),
  opening_hours: z.any().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const ImportSchema = z.object({
  provider_id: z.string().min(1).max(100),
  points: z.array(PointSchema).min(1).max(5000),
});

export const importPickupPointsJson = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((input) => ImportSchema.parse(input))
  .handler(async ({ data }) => {
    const now = new Date().toISOString();

    const { data: query, error: qErr } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: data.provider_id,
        status: "success",
        started_at: now,
        finished_at: now,
        raw_count: data.points.length,
        inserted_count: data.points.length,
      })
      .select("id")
      .single();

    if (qErr || !query) throw new Error(qErr?.message ?? "Failed to create query");

    const rows = data.points.map((p) => ({
      provider_id: data.provider_id,
      query_id: query.id,
      external_id: p.external_id ?? null,
      name: p.name,
      address: p.address,
      postal_code: p.postal_code,
      city: p.city,
      lat: p.lat,
      lng: p.lng,
      opening_hours: p.opening_hours ?? {},
      notes: p.notes ?? null,
    }));

    const { error: pErr } = await supabaseAdmin.from("pickup_points").insert(rows);

    if (pErr) {
      await supabaseAdmin
        .from("queries")
        .update({ status: "error", error: pErr.message, inserted_count: 0 })
        .eq("id", query.id);
      throw new Error(pErr.message);
    }

    return { query_id: query.id, inserted: rows.length };
  });
