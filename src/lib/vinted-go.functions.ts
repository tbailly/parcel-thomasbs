import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OpeningHours } from "@/lib/pickup-points.functions";

const PROVIDER_ID = "vinted_go";

// Tile half-size in degrees. ~0.02° lat ≈ 2.2km, ~0.03° lng ≈ 2.2km at Paris latitude.
const TILE_HALF_LAT = 0.02;
const TILE_HALF_LNG = 0.03;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0";

const COMMON_HEADERS = {
  "User-Agent": UA,
  Accept: "*/*",
  "Accept-Language": "fr,fr-FR;q=0.9,en;q=0.7",
  RSC: "1",
  "Next-Url": "/fr/carrier-locations",
};

const DAY_MAP: Record<string, keyof OpeningHours> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
};

type RawPoint = {
  id: number;
  point_type?: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  lat: number;
  lng: number;
  active?: boolean;
  operational_status?: { status?: string | null } | null;
};

type RawBusinessHour = { day: string; open: string; close: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (minMs: number, maxMs: number) =>
  sleep(minMs + Math.random() * (maxMs - minMs));

// Extract a balanced JSON array starting at body.indexOf(marker) (marker includes the opening '[').
function extractBalancedArray(body: string, marker: string): { json: string | null; error: string | null } {
  const start = body.indexOf(marker);
  if (start === -1) return { json: null, error: `marker '${marker}' not found` };
  let i = start + marker.length - 1; // position of '['
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return { json: body.slice(start + marker.length - 1, i + 1), error: null };
    }
  }
  return { json: null, error: "unterminated array" };
}

function buildBoundsParam(bbox: { north: number; east: number; south: number; west: number }) {
  return encodeURIComponent(JSON.stringify(bbox));
}

async function fetchVintedList(bbox: {
  north: number; east: number; south: number; west: number;
}): Promise<{ points: RawPoint[]; status: number; error: string | null }> {
  const url = `https://vintedgo.com/fr/carrier-locations?region=europe&country=fr&bounds=${buildBoundsParam(bbox)}&_rsc=1`;
  try {
    const res = await fetch(url, { method: "GET", headers: COMMON_HEADERS });
    const body = await res.text();
    if (res.status !== 200) {
      return { points: [], status: res.status, error: `http ${res.status} ${body.slice(0, 200)}` };
    }
    const { json, error } = extractBalancedArray(body, '"points":[');
    if (!json) return { points: [], status: res.status, error: error ?? "parse failed" };
    try {
      const arr = JSON.parse(json) as RawPoint[];
      return { points: arr, status: res.status, error: null };
    } catch (err) {
      return { points: [], status: res.status, error: `json parse: ${err instanceof Error ? err.message : String(err)}` };
    }
  } catch (err) {
    return { points: [], status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// Next.js Server Action ID for "fetch carrier point detail". Hardcoded from a captured HAR;
// if Vinted redeploys with a new bundle this hash will change and we'll get a 404 / empty body.
// In that case, re-capture from devtools (POST to /fr/carrier-locations with header `Next-Action`).
const VINTED_POINT_ACTION_ID = "7fc9819dd7c70178c13da184ff30c7fc9996d057f4";
const VINTED_ROUTER_STATE_TREE =
  "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22locale%22%2C%22fr%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(vintedgo)%22%2C%7B%22children%22%3A%5B%22carrier-locations%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D";

async function fetchVintedPointHours(externalId: string): Promise<{
  hours: RawBusinessHour[] | null;
  status: number;
  error: string | null;
}> {
  // The point-detail endpoint is a Next.js Server Action (POST), not a GET RSC payload.
  // URL still needs region/country/bounds/selected_point in the querystring (mimicking the in-app navigation).
  const bbox = { north: 50, east: 6, south: 42, west: -5 };
  const url = `https://vintedgo.com/fr/carrier-locations?region=europe&country=fr&bounds=${buildBoundsParam(bbox)}&selected_point=${externalId}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Accept: "text/x-component",
        "Accept-Language": "fr,fr-FR;q=0.9,en;q=0.7",
        "Content-Type": "text/plain;charset=UTF-8",
        "Next-Action": VINTED_POINT_ACTION_ID,
        "Next-Router-State-Tree": VINTED_ROUTER_STATE_TREE,
        Referer: url,
      },
      body: JSON.stringify([String(externalId)]),
    });
    const body = await res.text();
    if (res.status !== 200) {
      return { hours: null, status: res.status, error: `http ${res.status} ${body.slice(0, 200)}` };
    }
    const { json, error } = extractBalancedArray(body, '"business_hours":[');
    if (!json) return { hours: null, status: res.status, error: error ?? "no business_hours marker" };
    try {
      const arr = JSON.parse(json) as RawBusinessHour[];
      return { hours: arr, status: res.status, error: null };
    } catch (err) {
      return { hours: null, status: res.status, error: `json parse: ${err instanceof Error ? err.message : String(err)}` };
    }
  } catch (err) {
    return { hours: null, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}


function rawHoursToOpeningHours(raw: RawBusinessHour[]): OpeningHours {
  const out: OpeningHours = {};
  for (const slot of raw) {
    const key = DAY_MAP[slot.day?.toLowerCase()];
    if (!key) continue;
    if (!slot.open || !slot.close) continue;
    const arr = (out[key] ??= []);
    arr.push({ open: slot.open, close: slot.close });
  }
  return out;
}

function buildTilesAroundHomes(
  homes: { lat: number; lng: number }[],
): { north: number; east: number; south: number; west: number }[] {
  const tiles: { north: number; east: number; south: number; west: number }[] = [];
  const seen = new Set<string>();
  for (const h of homes) {
    // 3x3 grid centered on each home address → covers ~6km square
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cLat = h.lat + dy * 2 * TILE_HALF_LAT;
        const cLng = h.lng + dx * 2 * TILE_HALF_LNG;
        const tile = {
          north: cLat + TILE_HALF_LAT,
          south: cLat - TILE_HALF_LAT,
          east: cLng + TILE_HALF_LNG,
          west: cLng - TILE_HALF_LNG,
        };
        const key = `${tile.north.toFixed(4)}|${tile.south.toFixed(4)}|${tile.east.toFixed(4)}|${tile.west.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

// =================== Server fns ===================

export const refreshVintedGoList = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const startedAt = new Date().toISOString();
    const { data: qRow } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: PROVIDER_ID,
        status: "running",
        postal_code: "list-tiles",
        started_at: startedAt,
      })
      .select("id")
      .single();
    const queryId = (qRow?.id as string | undefined) ?? null;

    const { data: homes, error: homesErr } = await supabaseAdmin
      .from("home_addresses")
      .select("lat, lng");
    if (homesErr || !homes || homes.length === 0) {
      const msg = homesErr?.message ?? "no home_addresses";
      if (queryId)
        await supabaseAdmin
          .from("queries")
          .update({ status: "error", error: msg, finished_at: new Date().toISOString() })
          .eq("id", queryId);
      return { queryId, tileCount: 0, rawCount: 0, upsertedCount: 0, error: msg };
    }

    const tiles = buildTilesAroundHomes(homes.map((h) => ({ lat: Number(h.lat), lng: Number(h.lng) })));

    const dedup = new Map<number, RawPoint>();
    const tileReports: string[] = [];
    for (let i = 0; i < tiles.length; i++) {
      if (i > 0) await jitter(1000, 3000);
      const { points, status, error } = await fetchVintedList(tiles[i]);
      tileReports.push(`t${i}:${status}:${points.length}${error ? `:${error.slice(0, 80)}` : ""}`);
      for (const p of points) {
        if (typeof p.id !== "number" || dedup.has(p.id)) continue;
        if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
        dedup.set(p.id, p);
      }
    }

    const mapped = Array.from(dedup.values()).map((p) => {
      const statusText = p.operational_status?.status ?? null;
      return {
        provider_id: PROVIDER_ID,
        external_id: `vg-${p.id}`,
        name: p.name,
        address: p.address,
        postal_code: p.postal_code,
        city: p.city,
        lat: p.lat,
        lng: p.lng,
        notes: statusText && statusText !== "Normal" ? statusText : null,
        query_id: queryId,
        // do NOT overwrite opening_hours / hours_fetched_at on existing rows
      };
    });

    let upserted = 0;
    let dbError: string | null = null;
    if (mapped.length > 0) {
      // Upsert on (provider_id, external_id). opening_hours stays at default '{}' for new rows;
      // existing rows keep their hours because we don't include the column.
      const { error: upErr, count } = await supabaseAdmin
        .from("pickup_points")
        .upsert(mapped, { onConflict: "provider_id,external_id", count: "exact" });
      if (upErr) dbError = `upsert: ${upErr.message}`;
      else upserted = count ?? mapped.length;
    }

    if (queryId) {
      await supabaseAdmin
        .from("queries")
        .update({
          status: dbError ? "error" : "success",
          raw_count: dedup.size,
          inserted_count: upserted,
          error: [tileReports.join(" | "), dbError].filter(Boolean).join(" || ") || null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", queryId);
    }

    return {
      queryId,
      tileCount: tiles.length,
      rawCount: dedup.size,
      upsertedCount: upserted,
      error: dbError,
    };
  });

// Shared enrichment logic. Returns counts; never throws on per-point errors.
export async function enrichVintedGoBatchImpl(
  batchSize: number,
  trigger: "cron" | "manual" = "manual",
): Promise<{
  jobId: string | null;
  processed: number;
  succeeded: number;
  failed: number;
  remaining: number;
  samples: { external_id: string; status: string; error?: string }[];
}> {
  const samples: { external_id: string; status: string; error?: string }[] = [];

  // Create job row
  const { data: jobRow } = await supabaseAdmin
    .from("enrichment_jobs")
    .insert({
      provider_id: PROVIDER_ID,
      trigger,
      status: "running",
      batch_size: batchSize,
    })
    .select("id")
    .single();
  const jobId = (jobRow?.id as string | undefined) ?? null;

  const finalize = async (patch: Record<string, unknown>) => {
    if (!jobId) return;
    await supabaseAdmin
      .from("enrichment_jobs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", jobId);
  };

  try {
    // Scope: only enrich points belonging to the latest successful Vinted query
    // that added more than one point.
    const { data: latestQuery, error: lqErr } = await supabaseAdmin
      .from("queries")
      .select("id")
      .eq("provider_id", PROVIDER_ID)
      .eq("status", "success")
      .gt("inserted_count", 1)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lqErr) {
      await finalize({ status: "error", error: `latest query: ${lqErr.message}` });
      return { jobId, processed: 0, succeeded: 0, failed: 0, remaining: 0, samples: [] };
    }
    if (!latestQuery) {
      await finalize({
        status: "success",
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining_after: 0,
        error: "no eligible query",
      });
      return { jobId, processed: 0, succeeded: 0, failed: 0, remaining: 0, samples: [] };
    }
    const scopedQueryId = latestQuery.id as string;

    const { data: rows, error: selErr } = await supabaseAdmin
      .from("pickup_points")
      .select("id, external_id")
      .eq("provider_id", PROVIDER_ID)
      .eq("query_id", scopedQueryId)
      .is("hours_fetched_at", null)
      .order("updated_at", { ascending: true })
      .limit(batchSize);

    if (selErr) {
      await finalize({ status: "error", error: `select: ${selErr.message}` });
      return {
        jobId,
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0,
        samples: [{ external_id: "-", status: "select-error", error: selErr.message }],
      };
    }


    const points = rows ?? [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < points.length; i++) {
      if (i > 0) await jitter(2000, 5000);
      const p = points[i];
      const extId = (p.external_id ?? "").replace(/^vg-/, "");
      if (!extId) {
        failed++;
        samples.push({ external_id: p.external_id ?? "-", status: "skip-no-ext-id" });
        await supabaseAdmin.from("enrichments").insert({
          point_id: p.id,
          provider_id: PROVIDER_ID,
          external_id: p.external_id,
          status: "error",
          error: "missing external_id",
        });
        continue;
      }
      const { hours, status, error } = await fetchVintedPointHours(extId);
      if (!hours) {
        failed++;
        samples.push({ external_id: p.external_id ?? "-", status: `err-${status}`, error: error ?? undefined });
        await supabaseAdmin.from("enrichments").insert({
          point_id: p.id,
          provider_id: PROVIDER_ID,
          external_id: p.external_id,
          status: "error",
          error: `${status}: ${error ?? "no hours"}`.slice(0, 500),
        });
        continue;
      }
      const oh = rawHoursToOpeningHours(hours);
      const { error: updErr } = await supabaseAdmin
        .from("pickup_points")
        .update({
          opening_hours: oh,
          hours_fetched_at: new Date().toISOString(),
        })
        .eq("id", p.id);
      if (updErr) {
        failed++;
        samples.push({ external_id: p.external_id ?? "-", status: "db-error", error: updErr.message });
        await supabaseAdmin.from("enrichments").insert({
          point_id: p.id,
          provider_id: PROVIDER_ID,
          external_id: p.external_id,
          status: "error",
          error: `update: ${updErr.message}`,
        });
      } else {
        succeeded++;
        samples.push({ external_id: p.external_id ?? "-", status: "ok" });
        await supabaseAdmin.from("enrichments").insert({
          point_id: p.id,
          provider_id: PROVIDER_ID,
          external_id: p.external_id,
          status: "ok",
          error: null,
        });
      }
    }

    const { count: remaining } = await supabaseAdmin
      .from("pickup_points")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", PROVIDER_ID)
      .eq("query_id", scopedQueryId)
      .is("hours_fetched_at", null);


    await finalize({
      status: "success",
      processed: points.length,
      succeeded,
      failed,
      remaining_after: remaining ?? 0,
    });

    return {
      jobId,
      processed: points.length,
      succeeded,
      failed,
      remaining: remaining ?? 0,
      samples,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finalize({ status: "error", error: msg.slice(0, 500) });
    throw err;
  }
}

export const enrichVintedGoBatch = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ batchSize: z.number().min(1).max(20).optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    return enrichVintedGoBatchImpl(data.batchSize ?? 5, "manual");
  });

export const getVintedGoEnrichmentJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("enrichment_jobs")
    .select("id, trigger, status, started_at, finished_at, batch_size, processed, succeeded, failed, remaining_after, error")
    .eq("provider_id", PROVIDER_ID)
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return { jobs: data ?? [] };
});

export const getVintedGoStats = createServerFn({ method: "GET" }).handler(async () => {
  const { data: latestQuery } = await supabaseAdmin
    .from("queries")
    .select("id")
    .eq("provider_id", PROVIDER_ID)
    .eq("status", "success")
    .gt("inserted_count", 1)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestQuery) {
    return {
      total: 0,
      enriched: 0,
      pending: 0,
      inProgress: false,
      lastOk: null,
      lastError: null,
    };
  }
  const scopedQueryId = latestQuery.id as string;

  const [totalRes, enrichedRes, lastOkRes, lastErrRes, runningRes] = await Promise.all([
    supabaseAdmin
      .from("pickup_points")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", PROVIDER_ID)
      .eq("query_id", scopedQueryId),
    supabaseAdmin
      .from("pickup_points")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", PROVIDER_ID)
      .eq("query_id", scopedQueryId)
      .not("hours_fetched_at", "is", null),
    supabaseAdmin
      .from("enrichments")
      .select("created_at, external_id")
      .eq("provider_id", PROVIDER_ID)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("enrichments")
      .select("created_at, external_id, error")
      .eq("provider_id", PROVIDER_ID)
      .eq("status", "error")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("enrichment_jobs")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", PROVIDER_ID)
      .eq("status", "running"),
  ]);

  const total = totalRes.count ?? 0;
  const enriched = enrichedRes.count ?? 0;
  const pending = total - enriched;
  return {
    total,
    enriched,
    pending,
    inProgress: (runningRes.count ?? 0) > 0 || pending > 0,
    lastOk: lastOkRes.data,
    lastError: lastErrRes.data,
  };
});

