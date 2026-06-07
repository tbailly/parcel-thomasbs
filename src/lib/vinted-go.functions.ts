import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PROVIDER_ID = "vinted_go";

// Hardcoded bbox: Paris centre (matches HAR example).
const BBOX = {
  north: 48.92822825792912,
  east: 2.356808363728762,
  south: 48.88935967461364,
  west: 2.2946669452717305,
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

function extractPointsArray(body: string): { points: RawPoint[]; error: string | null } {
  const marker = '"points":[';
  const start = body.indexOf(marker);
  if (start === -1) return { points: [], error: "marker 'points' not found in body" };
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
      if (depth === 0) {
        const slice = body.slice(start + marker.length - 1, i + 1);
        try {
          const arr = JSON.parse(slice) as RawPoint[];
          return { points: arr, error: null };
        } catch (err) {
          return {
            points: [],
            error: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
    }
  }
  return { points: [], error: "unterminated points array" };
}

async function fetchVintedRsc(bbox: typeof BBOX): Promise<{ body: string; status: number; error: string | null }> {
  const boundsJson = JSON.stringify(bbox);
  const boundsEnc = encodeURIComponent(boundsJson); // single-encoded
  const url = `https://vintedgo.com/fr/carrier-locations?region=europe&country=fr&bounds=${boundsEnc}&_rsc=1`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0",
        Accept: "*/*",
        "Accept-Language": "fr,fr-FR;q=0.9,en;q=0.7",
        RSC: "1",
        "Next-Router-State-Tree":
          "%5B%22%22%2C%7B%22children%22%3A%5B%5B%22locale%22%2C%22fr%22%2C%22d%22%5D%2C%7B%22children%22%3A%5B%22(vintedgo)%22%2C%7B%22children%22%3A%5B%22carrier-locations%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%5D",
        "Next-Url": "/fr/carrier-locations",
      },
    });
    const body = await res.text();
    return { body, status: res.status, error: null };
  } catch (err) {
    return { body: "", status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export const scrapeVintedGoDebug = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const startedAt = new Date().toISOString();
    const { data: qRow } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: PROVIDER_ID,
        status: "running",
        postal_code: "paris-centre-bbox",
        started_at: startedAt,
      })
      .select("id")
      .single();
    const queryId = (qRow?.id as string | undefined) ?? null;

    const { body, status, error: fetchErr } = await fetchVintedRsc(BBOX);

    if (fetchErr || status !== 200) {
      if (queryId) {
        await supabaseAdmin
          .from("queries")
          .update({
            status: "error",
            error: `fetch http=${status} err=${fetchErr ?? "non-200"} bodySnippet=${body.slice(0, 500)}`,
            finished_at: new Date().toISOString(),
          })
          .eq("id", queryId);
      }
      return { queryId, httpStatus: status, rawCount: 0, insertedCount: 0, error: fetchErr ?? `http ${status}`, sample: [] as RawPoint[] };
    }

    const { points, error: parseErr } = extractPointsArray(body);

    if (parseErr) {
      if (queryId) {
        await supabaseAdmin
          .from("queries")
          .update({
            status: "error",
            error: `parse: ${parseErr} bodyLen=${body.length} bodyHead=${body.slice(0, 800)}`,
            finished_at: new Date().toISOString(),
          })
          .eq("id", queryId);
      }
      return { queryId, httpStatus: status, rawCount: 0, insertedCount: 0, error: parseErr, sample: [] };
    }

    // Dedup by id.
    const seen = new Set<number>();
    const mapped = [];
    for (const p of points) {
      if (typeof p.id !== "number" || seen.has(p.id)) continue;
      if (typeof p.lat !== "number" || typeof p.lng !== "number") continue;
      seen.add(p.id);
      const statusText = p.operational_status?.status ?? null;
      mapped.push({
        provider_id: PROVIDER_ID,
        external_id: `vg-${p.id}`,
        name: p.name,
        address: p.address,
        postal_code: p.postal_code,
        city: p.city,
        lat: p.lat,
        lng: p.lng,
        opening_hours: {},
        notes: statusText && statusText !== "Normal" ? statusText : null,
        query_id: queryId,
      });
    }

    let inserted = 0;
    let dbError: string | null = null;
    if (mapped.length > 0) {
      const { error: insErr, count } = await supabaseAdmin
        .from("pickup_points")
        .insert(mapped, { count: "exact" });
      if (insErr) dbError = `insert: ${insErr.message}`;
      else inserted = count ?? mapped.length;
    }

    if (queryId) {
      await supabaseAdmin
        .from("queries")
        .update({
          status: dbError ? "error" : "success",
          raw_count: points.length,
          inserted_count: inserted,
          error: dbError,
          finished_at: new Date().toISOString(),
        })
        .eq("id", queryId);
    }

    return {
      queryId,
      httpStatus: status,
      rawCount: points.length,
      insertedCount: inserted,
      error: dbError,
      sample: points.slice(0, 3),
    };
  });
