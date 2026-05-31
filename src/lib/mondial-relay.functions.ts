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
};

/**
 * Étape 1+2 du plan : on abandonne l'endpoint JSON /api/parcelshop (toujours bloqué
 * par le WAF même via Firecrawl + headers navigateur) et on scrape la page publique
 * Mondial Relay. On récupère rawHtml/html avec waitFor et on extrait les points
 * depuis le DOM rendu. Le diagnostic retourné permet d'itérer sur les sélecteurs.
 */
export const scrapeMondialRelay = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        postalCode: z.string().regex(/^\d{5}$/).default("75001"),
        country: z.string().length(2).default("FR"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const url = `https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/?codePostal=${data.postalCode}&pays=${data.country}`;
    const startedAt = new Date().toISOString();

    let status = 0;
    let firecrawlError: string | null = null;
    let extracted: unknown = null;
    let htmlBytes = 0;

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
            provider_id: "mondial_relay",
            external_id: p.external_id?.trim() || `mr-${data.postalCode}-${i}`,
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
          });
        }
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
    }

    let inserted = 0;
    let dbError: string | null = null;
    if (mapped.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("pickup_points")
        .delete()
        .eq("provider_id", "mondial_relay");
      if (delErr) {
        dbError = `delete: ${delErr.message}`;
      } else {
        const { error: insErr, count } = await supabaseAdmin
          .from("pickup_points")
          .insert(mapped, { count: "exact" });
        if (insErr) dbError = `insert: ${insErr.message}`;
        else inserted = count ?? mapped.length;
      }
    }

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      sourceType: "public-page-json" as const,
      requestedUrl: url,
      httpStatus: status,
      firecrawlError,
      htmlBytes,
      parseError,
      rawPointCount,
      mappedCount: mapped.length,
      sampleExtracted: mapped.slice(0, 3),
      extractedPreview: JSON.stringify(extracted).slice(0, 600),
      inserted,
      dbError,
    };
  });
