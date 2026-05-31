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

export const scrapeMondialRelay = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async () => {
    const startedAt = new Date().toISOString();

    // 1. Charger l'adresse maison
    const { data: home, error: homeErr } = await supabaseAdmin
      .from("home_addresses")
      .select("id, name, postal_code, country, lat, lng")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (homeErr || !home) {
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
        rawPointCount: 0,
        insertedCount: 0,
      };
    }

    // 2. Créer la ligne queries
    const { data: qRow, error: qErr } = await supabaseAdmin
      .from("queries")
      .insert({
        provider_id: PROVIDER_ID,
        home_address_id: home.id,
        postal_code: home.postal_code,
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
        rawPointCount: 0,
        insertedCount: 0,
      };
    }
    const queryId = qRow.id as string;

    const url = `https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/?codePostal=${home.postal_code}&pays=${home.country}`;

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

    let status = 0;
    let firecrawlError: string | null = null;
    let extracted: unknown = null;
    let htmlBytes = 0;

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      firecrawlError = "FIRECRAWL_API_KEY is not configured";
    } else {
      try {
        const firecrawl = new Firecrawl({ apiKey });
        const result = await firecrawl.scrape(url, {
          formats: [
            {
              type: "json",
              prompt:
                "Extract EVERY Mondial Relay pickup point (point relais / parcelshop) visible on this page (there should be several around the given postal code). For each, return: external_id (relay code/id if visible, else null), name (shop name), address (street line), postal_code (5 digits), city, lat (latitude decimal), lng (longitude decimal), opening_hours_text (raw hours text as shown), notes (extras like 'PIS', 'Locker', closures). Return them ALL, do not truncate or summarize.",
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
          waitFor: 5000,
          location: { country: "FR", languages: ["fr-FR", "fr"] },
        });
        const r = result as {
          json?: unknown;
          html?: string;
          metadata?: { statusCode?: number };
          data?: {
            json?: unknown;
            html?: string;
            metadata?: { statusCode?: number };
          };
        };
        extracted = r.json ?? r.data?.json ?? null;
        htmlBytes = (r.html ?? r.data?.html ?? "").length;
        status =
          r.metadata?.statusCode ??
          r.data?.metadata?.statusCode ??
          (extracted ? 200 : 0);
      } catch (err) {
        firecrawlError = err instanceof Error ? err.message : String(err);
      }
    }

    const mapped: MappedPoint[] = [];
    let parseError: string | null = null;
    let rawPointCount = 0;
    if (extracted) {
      try {
        const parsed = PointJsonSchema.parse(extracted);
        rawPointCount = parsed.points.length;
        for (let i = 0; i < parsed.points.length; i++) {
          const p = parsed.points[i];
          if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
          mapped.push({
            provider_id: PROVIDER_ID,
            external_id: p.external_id?.trim() || `mr-${home.postal_code}-${queryId.slice(0, 8)}-${i}`,
            name: p.name,
            address: p.address,
            postal_code: p.postal_code,
            city: p.city,
            lat: p.lat,
            lng: p.lng,
            opening_hours: {},
            notes:
              [p.notes, p.opening_hours_text].filter(Boolean).join(" · ") ||
              null,
            query_id: queryId,
          });
        }
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
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

    const finishedAt = new Date().toISOString();
    const hadError = Boolean(firecrawlError || parseError || dbError);
    await supabaseAdmin
      .from("queries")
      .update({
        status: hadError ? "error" : "success",
        raw_count: rawPointCount,
        inserted_count: inserted,
        error: hadError
          ? [firecrawlError, parseError, dbError].filter(Boolean).join(" | ")
          : null,
        finished_at: finishedAt,
      })
      .eq("id", queryId);

    return {
      startedAt,
      finishedAt,
      queryId,
      centerName: home.name,
      centerPostalCode: home.postal_code,
      requestedUrl: url,
      httpStatus: status,
      firecrawlError,
      htmlBytes,
      parseError,
      rawPointCount,
      insertedCount: inserted,
      sampleExtracted: mapped.slice(0, 3),
      extractedPreview: JSON.stringify(extracted).slice(0, 600),
      dbError,
    };
  });
