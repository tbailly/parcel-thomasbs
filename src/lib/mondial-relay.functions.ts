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
    let html = "";
    let rawHtml = "";
    let markdown = "";
    let contentType: string | null = null;
    let firecrawlError: string | null = null;

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      firecrawlError = "FIRECRAWL_API_KEY is not configured";
    } else {
      try {
        const firecrawl = new Firecrawl({ apiKey });
        const result = await firecrawl.scrape(url, {
          formats: ["html", "rawHtml", "markdown"],
          onlyMainContent: false,
          waitFor: 4000,
          location: { country: "FR", languages: ["fr-FR", "fr"] },
        });
        const r = result as {
          html?: string;
          rawHtml?: string;
          markdown?: string;
          metadata?: { statusCode?: number; contentType?: string };
          data?: {
            html?: string;
            rawHtml?: string;
            markdown?: string;
            metadata?: { statusCode?: number; contentType?: string };
          };
        };
        html = r.html ?? r.data?.html ?? "";
        rawHtml = r.rawHtml ?? r.data?.rawHtml ?? "";
        markdown = r.markdown ?? r.data?.markdown ?? "";
        status =
          r.metadata?.statusCode ??
          r.data?.metadata?.statusCode ??
          (html || rawHtml ? 200 : 0);
        contentType =
          r.metadata?.contentType ?? r.data?.metadata?.contentType ?? null;
      } catch (err) {
        firecrawlError = err instanceof Error ? err.message : String(err);
      }
    }

    const domSource = html || rawHtml;
    const blocked =
      status === 401 ||
      status === 403 ||
      /access denied|just a moment|attention required|datadome|captcha/i.test(
        domSource.slice(0, 4000),
      );

    // Heuristique de comptage : on essaie quelques sélecteurs/patterns connus
    // pour mesurer si le DOM contient des cartes points relais.
    const selectorHits: Record<string, number> = {
      "data-relayid": (domSource.match(/data-relayid=/gi) || []).length,
      "class~=relay-item": (domSource.match(/class="[^"]*relay-item/gi) || [])
        .length,
      "class~=parcelshop": (domSource.match(/class="[^"]*parcelshop/gi) || [])
        .length,
      "class~=point-relais": (domSource.match(/class="[^"]*point-relais/gi) ||
        []).length,
      "lat-attr": (domSource.match(/data-lat=/gi) || []).length,
    };

    // Extraction best-effort : on cherche les blocs avec data-lat / data-lng / data-relayid.
    // Si la page rendue ne les expose pas (SPA non hydratée par Firecrawl), on le verra
    // dans selectorHits = 0 partout et on saura qu'il faut une autre stratégie.
    const mapped: MappedPoint[] = [];
    const cardRegex =
      /<[^>]+data-relayid="([^"]+)"[^>]*data-lat="([^"]+)"[^>]*data-lng="([^"]+)"[^>]*>([\s\S]*?)<\/[a-z]+>/gi;
    let m: RegExpExecArray | null;
    while ((m = cardRegex.exec(domSource)) !== null) {
      const id = m[1];
      const lat = Number(m[2]);
      const lng = Number(m[3]);
      const inner = m[4];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const cpMatch = /\b(\d{5})\b/.exec(text);
      const postalCode = cpMatch ? cpMatch[1] : data.postalCode;
      mapped.push({
        provider_id: "mondial_relay",
        external_id: `mr-${id}`,
        name: text.slice(0, 80) || `Point ${id}`,
        address: text.slice(0, 200),
        postal_code: postalCode,
        city: "",
        lat,
        lng,
        opening_hours: {},
        notes: "Point Relais (scrape page publique)",
      });
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
      sourceType: "public-page" as const,
      requestedUrl: url,
      httpStatus: status,
      contentType,
      blocked,
      firecrawlError,
      htmlBytes: html.length,
      rawHtmlBytes: rawHtml.length,
      markdownBytes: markdown.length,
      htmlPreview: domSource.slice(0, 600),
      markdownPreview: markdown.slice(0, 600),
      selectorHits,
      mappedCount: mapped.length,
      sampleExtracted: mapped.slice(0, 3),
      inserted,
      dbError,
    };
  });
