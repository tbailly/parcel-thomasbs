import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";

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
        lat: z.number(),
        lng: z.number(),
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
): Promise<{ points: RawPoint[]; error: string | null; httpStatus: number }> {
  const url = `https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/?codePostal=${postalCode}&pays=${country}`;

  const actions: Array<Record<string, unknown>> = [
    { type: "wait", milliseconds: 3000 },
  ];
  for (let i = 0; i < SHOW_MORE_CLICKS; i++) {
    actions.push({
      type: "click",
      selector: 'button:has-text("Afficher plus de résultats")',
    });
    actions.push({ type: "wait", milliseconds: 1500 });
  }

  try {
    const result = await firecrawl.scrape(url, {
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
      actions: actions as never,
      location: { country: "FR", languages: ["fr-FR", "fr"] },
    });

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

export const scrapeMondialRelay = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const startedAt = new Date().toISOString();

    // 1. Charger toutes les adresses maison
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
        startedAt,
        finishedAt: new Date().toISOString(),
        queryId: qRow?.id ?? null,
        error: errorMessage,
        totalRaw: 0,
        totalUnique: 0,
        insertedCount: 0,
      };
    }

    // 2. Une seule ligne queries pour ce run
    const { data: qRow, error: qErr } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: PROVIDER_ID,
        status: "success",
        started_at: startedAt,
      })
      .select("id")
      .single();

    if (qErr || !qRow) {
      return {
        startedAt,
        finishedAt: new Date().toISOString(),
        error: `queries insert: ${qErr?.message ?? "unknown"}`,
        totalRaw: 0,
        totalUnique: 0,
        insertedCount: 0,
      };
    }
    const queryId = qRow.id as string;

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      const errorMessage = "FIRECRAWL_API_KEY is not configured";
      await supabaseAdmin
        .from("queries")
        .update({
          status: "error",
          error: errorMessage,
          finished_at: new Date().toISOString(),
        })
        .eq("id", queryId);
      return {
        startedAt,
        finishedAt: new Date().toISOString(),
        queryId,
        error: errorMessage,
        totalRaw: 0,
        totalUnique: 0,
        insertedCount: 0,
      };
    }

    const firecrawl = new Firecrawl({ apiKey });

    // 3. Boucle séquentielle sur chaque CP avec dédoublonnage
    const dedup = new Map<string, MappedPoint>();
    const addressReports: Array<{
      name: string;
      postal_code: string;
      rawCount: number;
      httpStatus: number;
      error: string | null;
    }> = [];
    let totalRaw = 0;
    let firstSample: RawPoint[] = [];

    for (const home of homes) {
      const { points, error, httpStatus } = await scrapeOnePostalCode(
        firecrawl,
        home.postal_code,
        home.country,
      );
      totalRaw += points.length;
      if (firstSample.length === 0 && points.length > 0) {
        firstSample = points.slice(0, 3);
      }
      addressReports.push({
        name: home.name,
        postal_code: home.postal_code,
        rawCount: points.length,
        httpStatus,
        error,
      });

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        const extId = p.external_id?.trim() || "";
        const key = extId
          ? `id:${extId}`
          : `geo:${p.lat.toFixed(5)}|${p.lng.toFixed(5)}`;
        if (dedup.has(key)) continue;
        dedup.set(key, {
          provider_id: PROVIDER_ID,
          external_id:
            extId || `mr-${home.postal_code}-${queryId.slice(0, 8)}-${i}`,
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
    }

    const mapped = Array.from(dedup.values());

    // 4. Insert unique
    let inserted = 0;
    let dbError: string | null = null;
    if (mapped.length > 0) {
      const { error: insErr, count } = await supabaseAdmin
        .from("pickup_points")
        .insert(mapped, { count: "exact" });
      if (insErr) dbError = `insert: ${insErr.message}`;
      else inserted = count ?? mapped.length;
    }

    const finishedAt = new Date().toISOString();
    const scrapeErrors = addressReports
      .filter((r) => r.error)
      .map((r) => `${r.postal_code}: ${r.error}`)
      .join(" | ");
    const hadError = Boolean(dbError) || (mapped.length === 0 && scrapeErrors);
    await supabaseAdmin
      .from("queries")
      .update({
        status: hadError ? "error" : "success",
        raw_count: totalRaw,
        inserted_count: inserted,
        error:
          [scrapeErrors || null, dbError].filter(Boolean).join(" | ") || null,
        finished_at: finishedAt,
      })
      .eq("id", queryId);

    return {
      startedAt,
      finishedAt,
      queryId,
      addresses: addressReports,
      totalRaw,
      totalUnique: mapped.length,
      insertedCount: inserted,
      sampleExtracted: mapped.slice(0, 3),
      firstRawSample: firstSample,
      dbError,
    };
  });
