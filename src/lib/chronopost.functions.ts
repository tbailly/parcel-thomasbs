import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { OpeningHours, OpeningSlot } from "@/lib/pickup-points.functions";

const PROVIDER_ID = "chronopost";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0";

const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "fr,fr-FR;q=0.9,en;q=0.7",
  "X-Requested-With": "XMLHttpRequest",
  Referer: "https://www.chronopost.fr/expeditionAvancee/ounoustrouver.html",
};

// 1 = Lundi … 7 = Dimanche
const DAY_MAP: Record<number, keyof OpeningHours> = {
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
  7: "sun",
};

const TYPE_LABEL: Record<string, string> = {
  P: "Consigne / Point relais",
  B: "Bureau de poste",
  A: "Agence Chronopost",
};

type RawPoint = {
  identifier?: string;
  type?: string;
  name?: string;
  address?: string;
  zipcode?: string;
  city?: string;
  latitude?: string | number;
  longitude?: string | number;
  listopeninghours?: { day: number; openinghours: string | null }[];
  // Champs optionnels potentiellement utilisés pour filtrer les points obsolètes
  holidaysList?: { dayStart?: string; dayEnd?: string }[];
  closingPeriodList?: { dayStart?: string; dayEnd?: string }[];
  listclosing?: { dayStart?: string; dayEnd?: string }[];
  enabled?: boolean;
  disabled?: boolean;
  active?: boolean;
  inService?: boolean;
  code?: string;
  status?: string;
  [key: string]: unknown;
};

type RawResp = {
  errorCode?: number;
  extraErrorMessage?: string;
  olgiPointList?: RawPoint[];
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (a: number, b: number) => sleep(a + Math.random() * (b - a));

function parseOpeningHours(raw: { day: number; openinghours: string | null }[] | undefined): OpeningHours {
  const out: OpeningHours = {};
  if (!raw) return out;
  for (const slot of raw) {
    const key = DAY_MAP[slot.day];
    if (!key) continue;
    const text = (slot.openinghours ?? "").trim();
    if (!text || /ferm/i.test(text)) continue;
    // "08:00-12:00 12:00-22:00" → 2 créneaux
    const slots: OpeningSlot[] = [];
    for (const part of text.split(/\s+/)) {
      const m = part.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      if (m) slots.push({ open: m[1], close: m[2] });
    }
    if (slots.length > 0) out[key] = slots;
  }
  return out;
}

// Extrait le 1er objet JSON valide d'une chaîne (Firecrawl peut renvoyer le JSON
// wrappé dans du HTML ou markdown selon le format demandé).
function extractJsonObject(text: string): unknown | null {
  const t = text.trim();
  // tentative directe
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  // recherche du 1er { ... } équilibré
  const start = t.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

async function fetchOnePoint(lat: number, lng: number, zipcode: string): Promise<{
  points: RawPoint[];
  status: number;
  error: string | null;
}> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { points: [], status: 0, error: "FIRECRAWL_API_KEY missing" };
  }
  const ts = Date.now();
  const targetUrl =
    `https://www.chronopost.fr/expeditionAvancee/stubpointsearch.json` +
    `?lat=${encodeURIComponent(lat.toFixed(7))}` +
    `&lon=${encodeURIComponent(lng.toFixed(7))}` +
    `&r=${Math.floor(Math.random() * 900 + 100)}` +
    `&z=${encodeURIComponent(zipcode)}` +
    `&c=&a=&p=FR&lang=null&_=${ts}`;

  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["rawHtml"],
        onlyMainContent: false,
        headers: HEADERS,
      }),
    });
    const fcBody = await res.text();
    if (res.status !== 200) {
      return { points: [], status: res.status, error: `firecrawl ${res.status} ${fcBody.slice(0, 200)}` };
    }
    let fcJson: { success?: boolean; data?: { rawHtml?: string; markdown?: string; metadata?: { statusCode?: number } }; error?: string };
    try {
      fcJson = JSON.parse(fcBody);
    } catch (err) {
      return { points: [], status: res.status, error: `firecrawl parse: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!fcJson.success || !fcJson.data) {
      return { points: [], status: res.status, error: `firecrawl: ${fcJson.error ?? "no data"}` };
    }
    const upstreamStatus = fcJson.data.metadata?.statusCode ?? 0;
    const raw = fcJson.data.rawHtml ?? fcJson.data.markdown ?? "";
    const parsed = extractJsonObject(raw) as RawResp | null;
    if (!parsed) {
      return { points: [], status: upstreamStatus, error: `no json in response (${raw.slice(0, 120)})` };
    }
    if (parsed.errorCode && parsed.errorCode !== 0) {
      return {
        points: [],
        status: upstreamStatus,
        error: `errorCode=${parsed.errorCode} ${parsed.extraErrorMessage ?? ""}`.slice(0, 200),
      };
    }
    return { points: parsed.olgiPointList ?? [], status: upstreamStatus, error: null };
  } catch (err) {
    return { points: [], status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export const refreshChronopost = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const startedAt = new Date().toISOString();

    const { data: qRow } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: PROVIDER_ID,
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();
    const queryId = (qRow?.id as string | undefined) ?? null;

    const finalize = async (patch: Record<string, unknown>) => {
      if (!queryId) return;
      await supabaseAdmin
        .from("queries")
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq("id", queryId);
    };

    const { data: homes, error: homesErr } = await supabaseAdmin
      .from("home_addresses")
      .select("lat, lng, postal_code, name")
      .order("position", { ascending: true });

    if (homesErr || !homes || homes.length === 0) {
      const msg = homesErr?.message ?? "no home_addresses configured";
      await finalize({ status: "error", error: msg });
      return { queryId, rawCount: 0, insertedCount: 0, error: msg, reports: [] };
    }

    const dedup = new Map<string, RawPoint>();
    const reports: string[] = [];
    const skipped = { closed: 0, noHours: 0, badType: 0, badCoords: 0, dateClosed: 0 };
    let sampleKeys: string[] | null = null;
    for (let i = 0; i < homes.length; i++) {
      if (i > 0) await jitter(1000, 3000);
      const h = homes[i];
      const { points, status, error } = await fetchOnePoint(
        Number(h.lat),
        Number(h.lng),
        h.postal_code,
      );
      reports.push(
        `${h.postal_code}(${h.name}): http=${status} raw=${points.length}${error ? ` err=${error.slice(0, 80)}` : ""}`,
      );
      if (!sampleKeys && points.length > 0) {
        sampleKeys = Object.keys(points[0]).sort();
      }
      for (const p of points) {
        const id = (p.identifier ?? "").trim();
        if (!id) continue;
        if (!dedup.has(id)) dedup.set(id, p);
      }
    }

    // Helpers de filtrage
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const isClosedToday = (periods?: { dayStart?: string; dayEnd?: string }[]) => {
      if (!periods || periods.length === 0) return false;
      return periods.some((p) => {
        const s = (p.dayStart ?? "").replace(/-/g, "").slice(0, 8);
        const e = (p.dayEnd ?? "").replace(/-/g, "").slice(0, 8);
        if (!s && !e) return false;
        if (s && todayStr < s) return false;
        if (e && todayStr > e) return false;
        return true;
      });
    };

    const mapped = Array.from(dedup.values())
      .map((p) => {
        // 1. Coordonnées
        const lat = typeof p.latitude === "string" ? Number(p.latitude) : (p.latitude ?? NaN);
        const lng = typeof p.longitude === "string" ? Number(p.longitude) : (p.longitude ?? NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
          skipped.badCoords++;
          return null;
        }
        // 2. Flags d'inactivité explicites
        if (p.enabled === false || p.disabled === true || p.active === false || p.inService === false) {
          skipped.closed++;
          return null;
        }
        // 3. Type connu uniquement (P=consigne/relais, B=bureau de poste, A=agence)
        const type = (p.type ?? "").toUpperCase();
        if (!TYPE_LABEL[type]) {
          skipped.badType++;
          return null;
        }
        // 4. Horaires : au moins un jour ouvert dans la semaine
        const opening = parseOpeningHours(p.listopeninghours);
        if (Object.keys(opening).length === 0) {
          skipped.noHours++;
          return null;
        }
        // 5. Fermeture exceptionnelle couvrant aujourd'hui (vacances, travaux)
        if (
          isClosedToday(p.holidaysList) ||
          isClosedToday(p.closingPeriodList) ||
          isClosedToday(p.listclosing)
        ) {
          skipped.dateClosed++;
          return null;
        }
        return {
          provider_id: PROVIDER_ID,
          external_id: `cp-${p.identifier}`,
          name: p.name ?? "Point Chronopost",
          address: p.address ?? "",
          postal_code: p.zipcode ?? "",
          city: p.city ?? "",
          lat,
          lng,
          opening_hours: parseOpeningHours(p.listopeninghours),
          notes: typeLabel,
          hours_fetched_at: new Date().toISOString(),
          query_id: queryId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    let upserted = 0;
    let dbError: string | null = null;
    if (mapped.length > 0) {
      const { error: upErr, count } = await supabaseAdmin
        .from("pickup_points")
        .upsert(mapped, { onConflict: "provider_id,external_id", count: "exact" });
      if (upErr) dbError = `upsert: ${upErr.message}`;
      else upserted = count ?? mapped.length;
    }

    await finalize({
      status: dbError ? "error" : "success",
      raw_count: dedup.size,
      inserted_count: upserted,
      error: [reports.join(" | "), dbError].filter(Boolean).join(" || ") || null,
    });

    return {
      queryId,
      rawCount: dedup.size,
      insertedCount: upserted,
      error: dbError,
      reports,
    };
  });

export const getChronopostStats = createServerFn({ method: "GET" }).handler(async () => {
  const [{ count: total }, { data: lastQueries }] = await Promise.all([
    supabaseAdmin
      .from("pickup_points")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", PROVIDER_ID),
    supabaseAdmin
      .from("queries")
      .select("id, status, started_at, finished_at, raw_count, inserted_count, error")
      .eq("provider_id", PROVIDER_ID)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  return {
    total: total ?? 0,
    queries: lastQueries ?? [],
  };
});
