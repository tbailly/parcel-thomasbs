import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const DAY_MAP: Record<string, "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"> = {
  lundi: "mon",
  mardi: "tue",
  mercredi: "wed",
  jeudi: "thu",
  vendredi: "fri",
  samedi: "sat",
  dimanche: "sun",
};

type OpeningSlot = { open: string; close: string };
type OpeningHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", OpeningSlot[]>>;

type ParsedPoint = {
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
 * Extract relay points from the Mondial Relay widget HTML.
 * The widget renders each point as a <div class="PR-Item"> with data attributes
 * (data-pr-id, data-lat, data-lng) and inner blocks for name / address / hours.
 * If the HTML doesn't contain that structure (e.g. Cloudflare interstitial),
 * the parser returns an empty array.
 */
function parseWidgetHtml(html: string): ParsedPoint[] {
  const points: ParsedPoint[] = [];
  const itemRegex = /<div[^>]*class="[^"]*PR-Item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[0];
    const id = /data-pr-id="([^"]+)"/.exec(block)?.[1];
    const lat = parseFloat(/data-lat="([^"]+)"/.exec(block)?.[1] ?? "");
    const lng = parseFloat(/data-lng="([^"]+)"/.exec(block)?.[1] ?? "");
    const name = /<p class="[^"]*pr-name[^"]*">([^<]+)<\/p>/i.exec(block)?.[1]?.trim();
    const addr = /<p class="[^"]*pr-adr[^"]*">([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? "";
    if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const addrText = addr.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const cpMatch = /(\b\d{5}\b)\s+([A-ZÀ-Ÿ][^,]+)/.exec(addrText);
    points.push({
      external_id: id,
      name,
      address: cpMatch ? addrText.replace(cpMatch[0], "").trim().replace(/,$/, "") : addrText,
      postal_code: cpMatch?.[1] ?? "",
      city: cpMatch?.[2]?.trim() ?? "",
      lat,
      lng,
      opening_hours: parseHoursBlock(block),
      notes: null,
    });
  }
  return points;
}

function parseHoursBlock(block: string): OpeningHours {
  const hours: OpeningHours = {};
  const dayRegex = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[^0-9]*((?:\d{1,2}[h:]\d{0,2}\s*-\s*\d{1,2}[h:]\d{0,2}\s*,?\s*)+)/gi;
  let m: RegExpExecArray | null;
  while ((m = dayRegex.exec(block)) !== null) {
    const key = DAY_MAP[m[1].toLowerCase()];
    const slots: OpeningSlot[] = [];
    const slotRe = /(\d{1,2})[h:](\d{0,2})\s*-\s*(\d{1,2})[h:](\d{0,2})/g;
    let s: RegExpExecArray | null;
    while ((s = slotRe.exec(m[2])) !== null) {
      slots.push({
        open: `${s[1].padStart(2, "0")}:${(s[2] || "00").padStart(2, "0")}`,
        close: `${s[3].padStart(2, "0")}:${(s[4] || "00").padStart(2, "0")}`,
      });
    }
    if (slots.length) hours[key] = slots;
  }
  return hours;
}

export const scrapeMondialRelay = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        postalCode: z.string().regex(/^\d{5}$/).default("93400"),
        nbResults: z.number().int().min(1).max(50).default(15),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const url = `https://widget.mondialrelay.com/parcelshop-picker/v4_0/?Target=&Brand=BDTEST&Country=FR&PostCode=${data.postalCode}&Weight=&ColLivMod=24R&NbResults=${data.nbResults}`;
    const startedAt = new Date().toISOString();

    let status = 0;
    let html = "";
    let fetchError: string | null = null;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fr-FR,fr;q=0.9",
          Referer: "https://www.mondialrelay.fr/",
        },
      });
      status = res.status;
      html = await res.text();
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }

    const parsed = html ? parseWidgetHtml(html) : [];
    const cloudflareBlocked =
      html.includes("Just a moment") || html.includes("challenges.cloudflare.com");

    let inserted = 0;
    let dbError: string | null = null;
    if (parsed.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from("pickup_points")
        .delete()
        .eq("provider_id", "mondial_relay");
      if (delErr) dbError = `delete: ${delErr.message}`;
      else {
        const rows = parsed.map((p) => ({
          provider_id: "mondial_relay",
          external_id: p.external_id,
          name: p.name,
          address: p.address,
          postal_code: p.postal_code,
          city: p.city,
          lat: p.lat,
          lng: p.lng,
          opening_hours: p.opening_hours,
          notes: p.notes,
        }));
        const { error: insErr, count } = await supabaseAdmin
          .from("pickup_points")
          .insert(rows, { count: "exact" });
        if (insErr) dbError = `insert: ${insErr.message}`;
        else inserted = count ?? rows.length;
      }
    }

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedUrl: url,
      httpStatus: status,
      fetchError,
      cloudflareBlocked,
      htmlBytes: html.length,
      htmlPreview: html.slice(0, 600),
      parsedCount: parsed.length,
      inserted,
      dbError,
      points: parsed,
    };
  });
