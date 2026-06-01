import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import { backgroundTask } from "./cf-ctx";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type OpeningSlot = { open: string; close: string };
type OpeningHours = Partial<Record<DayKey, OpeningSlot[]>>;

type MappedPoint = {
  provider_id: string;
  external_id: string;
  name: string;
  address: string;
  postal_code: string;
  city: string;
  lat: number;
  lng: number;
  opening_hours: OpeningHours;
  notes: string | null;
  query_id: string;
};

type HomeRow = {
  id: string;
  name: string;
  postal_code: string;
  country: string;
};

const PROVIDER_ID = "mondial_relay";
const SHOW_MORE_CLICKS = 5;

const PointJsonSchema = z.object({
  points: z
    .array(
      z.object({
        external_id: z.string().nullable().optional(),
        name: z.string(),
        address: z.string(),
        postal_code: z.string(),
        city: z.string(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        opening_hours_text: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

type RawPoint = z.infer<typeof PointJsonSchema>["points"][number];

async function scrapeOnePostalCode(
  firecrawl: Firecrawl,
  postalCode: string,
  country: string,
  opts: { withActions?: boolean } = { withActions: true },
): Promise<{ points: RawPoint[]; error: string | null; httpStatus: number }> {
  const url = `https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/?codePostal=${postalCode}&pays=${country}`;

  // Tolerant click via executeJavascript: tries multiple selectors / button
  // texts, never throws if the button is missing (so a missing "show more"
  // button doesn't abort the whole scrape like a `click` action would).
  const clickShowMoreScript = `
    (function () {
      var texts = ['afficher plus', 'voir plus', 'plus de résultats', 'plus de resultats', 'show more'];
      var candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      var btn = candidates.find(function (el) {
        var t = (el.textContent || '').trim().toLowerCase();
        if (!t) return false;
        return texts.some(function (needle) { return t.indexOf(needle) !== -1; });
      });
      if (btn) {
        try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
        btn.click();
        return 'clicked: ' + (btn.textContent || '').trim().slice(0, 80);
      }
      return 'no-button';
    })();
  `;

  const actions: Array<Record<string, unknown>> = [
    { type: "wait", milliseconds: 3000 },
  ];
  if (opts.withActions) {
    for (let i = 0; i < SHOW_MORE_CLICKS; i++) {
      actions.push({ type: "executeJavascript", script: clickShowMoreScript });
      actions.push({ type: "wait", milliseconds: 1800 });
    }
  }

  try {
    const scrapeOptions: Record<string, unknown> = {
      formats: [
        {
          type: "json",
          prompt:
            "Extract EVERY Mondial Relay pickup point (point relais / parcelshop) visible on this page. For each, return: external_id (relay code/id if visible, else null), name (shop name), address (street line), postal_code (5 digits), city, lat (latitude decimal), lng (longitude decimal), opening_hours_text (raw hours text as shown), notes (extras like 'PIS', 'Locker', closures). Return them ALL, do not truncate.",
          schema: {
            type: "object",
            properties: {
              points: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    external_id: { type: ["string", "null"] },
                    name: { type: "string" },
                    address: { type: "string" },
                    postal_code: { type: "string" },
                    city: { type: "string" },
                    lat: { type: "number" },
                    lng: { type: "number" },
                    opening_hours_text: { type: ["string", "null"] },
                    notes: { type: ["string", "null"] },
                  },
                  required: ["name", "address", "postal_code", "city", "lat", "lng"],
                },
              },
            },
            required: ["points"],
          },
        },
      ],
      onlyMainContent: false,
      waitFor: 3000,
      location: { country: "FR", languages: ["fr-FR", "fr"] },
      timeout: 300000,
    };
    if (opts.withActions) {
      scrapeOptions.actions = actions;
    }
    const result = await firecrawl.scrape(url, scrapeOptions as never);

    const r = result as {
      json?: unknown;
      metadata?: { statusCode?: number };
      data?: { json?: unknown; metadata?: { statusCode?: number } };
    };
    const extracted = r.json ?? r.data?.json ?? null;
    const status =
      r.metadata?.statusCode ?? r.data?.metadata?.statusCode ?? (extracted ? 200 : 0);

    if (!extracted) {
      return { points: [], error: "no json extracted", httpStatus: status };
    }
    const parsed = PointJsonSchema.parse(extracted);
    return { points: parsed.points, error: null, httpStatus: status };
  } catch (err) {
    return {
      points: [],
      error: err instanceof Error ? err.message : String(err),
      httpStatus: 0,
    };
  }
}

async function runScrapeJob(queryId: string, homes: HomeRow[]) {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      await supabaseAdmin
        .from("queries")
        .update({
          status: "error",
          error: "FIRECRAWL_API_KEY is not configured",
          finished_at: new Date().toISOString(),
        })
        .eq("id", queryId);
      return;
    }

    const firecrawl = new Firecrawl({ apiKey });
    const dedup = new Map<string, MappedPoint>();
    const addressReports: string[] = [];
    let totalRaw = 0;

    for (const home of homes) {
      const { points, error } = await scrapeOnePostalCode(
        firecrawl,
        home.postal_code,
        home.country,
      );
      totalRaw += points.length;
      addressReports.push(
        `${home.postal_code}: raw=${points.length}${error ? ` err=${error}` : ""}`,
      );

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const lat = p.lat;
        const lng = p.lng;
        if (
          typeof lat !== "number" ||
          typeof lng !== "number" ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          (lat === 0 && lng === 0)
        )
          continue;
        const extId = p.external_id?.trim() || "";
        const key = extId
          ? `id:${extId}`
          : `geo:${lat.toFixed(5)}|${lng.toFixed(5)}`;
        if (dedup.has(key)) continue;
        dedup.set(key, {
          provider_id: PROVIDER_ID,
          external_id:
            extId || `mr-${home.postal_code}-${queryId.slice(0, 8)}-${i}`,
          name: p.name,
          address: p.address,
          postal_code: p.postal_code,
          city: p.city,
          lat,
          lng,
          opening_hours: {},
          notes:
            [p.notes, p.opening_hours_text].filter(Boolean).join(" · ") || null,
          query_id: queryId,
        });
      }
    }

    const mapped = Array.from(dedup.values());

    let inserted = 0;
    let dbError: string | null = null;
    if (mapped.length > 0) {
      const { error: insErr, count } = await supabaseAdmin
        .from("pickup_points")
        .insert(mapped, { count: "exact" });
      if (insErr) dbError = `insert: ${insErr.message}`;
      else inserted = count ?? mapped.length;
    }

    const hasScrapeErrors = addressReports.some((r) => r.includes("err="));
    const hadError =
      Boolean(dbError) || (mapped.length === 0 && hasScrapeErrors);
    await supabaseAdmin
      .from("queries")
      .update({
        status: hadError ? "error" : "success",
        raw_count: totalRaw,
        inserted_count: inserted,
        error:
          [addressReports.join(" | "), dbError].filter(Boolean).join(" || ") ||
          null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", queryId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("runScrapeJob crashed:", err);
    await supabaseAdmin
      .from("queries")
      .update({
        status: "error",
        error: `runScrapeJob crashed: ${msg}`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", queryId);
  }
}

export const scrapeMondialRelayDebug93400 = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const startedAt = new Date().toISOString();
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return {
        status: "error" as const,
        error: "FIRECRAWL_API_KEY is not configured",
      };
    }

    const { data: qRow } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: PROVIDER_ID,
        status: "running",
        postal_code: "93400",
        started_at: startedAt,
      })
      .select("id")
      .single();
    const queryId = (qRow?.id as string | undefined) ?? null;

    const firecrawl = new Firecrawl({ apiKey });
    const { points, error, httpStatus } = await scrapeOnePostalCode(
      firecrawl,
      "93400",
      "FR",
      { withActions: false },
    );

    let inserted = 0;
    let dbError: string | null = null;
    if (queryId && points.length > 0) {
      const mapped: MappedPoint[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        const extId = p.external_id?.trim() || "";
        const key = extId
          ? `id:${extId}`
          : `geo:${p.lat.toFixed(5)}|${p.lng.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mapped.push({
          provider_id: PROVIDER_ID,
          external_id: extId || `mr-93400-${queryId.slice(0, 8)}-${i}`,
          name: p.name,
          address: p.address,
          postal_code: p.postal_code,
          city: p.city,
          lat: p.lat,
          lng: p.lng,
          opening_hours: {},
          notes:
            [p.notes, p.opening_hours_text].filter(Boolean).join(" · ") || null,
          query_id: queryId,
        });
      }
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
          status: error || dbError ? "error" : "success",
          raw_count: points.length,
          inserted_count: inserted,
          error: [error, dbError].filter(Boolean).join(" || ") || null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", queryId);
    }

    return {
      queryId,
      mode: "simple-93400" as const,
      httpStatus,
      rawCount: points.length,
      insertedCount: inserted,
      error: error ?? dbError,
      sample: points.slice(0, 3),
    };
  });

export const scrapeMondialRelay = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const startedAt = new Date().toISOString();

    const { data: homes, error: homeErr } = await supabaseAdmin
      .from("home_addresses")
      .select("id, name, postal_code, country")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (homeErr || !homes || homes.length === 0) {
      const errorMessage = homeErr?.message ?? "no home address configured";
      const { data: qRow } = await supabaseAdmin
        .from("queries")
        .insert({
          provider_id: PROVIDER_ID,
          status: "error",
          error: errorMessage,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      return {
        queryId: qRow?.id ?? null,
        status: "error" as const,
        error: errorMessage,
        addresses: [],
      };
    }

    const { data: qRow, error: qErr } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: PROVIDER_ID,
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();

    if (qErr || !qRow) {
      return {
        queryId: null,
        status: "error" as const,
        error: `queries insert: ${qErr?.message ?? "unknown"}`,
        addresses: [],
      };
    }
    const queryId = qRow.id as string;

    // Fire and forget — keeps running after this response returns.
    backgroundTask(runScrapeJob(queryId, homes));

    return {
      queryId,
      status: "running" as const,
      message:
        "Job lancé en arrière-plan. Surveille la ligne `queries` correspondante : status passe à 'success' ou 'error' une fois terminé.",
      addresses: homes.map((h) => ({
        name: h.name,
        postal_code: h.postal_code,
      })),
    };
  });
