import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type OpeningSlot = { open: string; close: string };
type OpeningHours = Partial<Record<DayKey, OpeningSlot[]>>;

// JourSemaine MR : 0 = dimanche, 1 = lundi, …, 6 = samedi
const DAY_BY_INDEX: Record<number, DayKey> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

const HoraireSchema = z.object({
  JourSemaine: z.number().int().min(0).max(6),
  HeureOuvertureAM: z.string().optional(),
  HeureFermetureAM: z.string().optional(),
  HeureOuverturePM: z.string().optional(),
  HeureFermeturePM: z.string().optional(),
});

const CongeSchema = z.object({
  Debut: z.string(),
  Fin: z.string(),
});

const PointSchema = z.object({
  Numero: z.number(),
  Adresse: z.object({
    Libelle: z.string(),
    LibelleComplement: z.string().optional().default(""),
    AdresseLigne1: z.string(),
    AdresseLigne2: z.string().optional().default(""),
    CodePostal: z.string(),
    Ville: z.string(),
    Latitude: z.number(),
    Longitude: z.number(),
  }),
  Conges: z.array(CongeSchema).default([]),
  Horaires: z.array(HoraireSchema).default([]),
  EstPIS: z.boolean().optional().default(false),
  CodeNature: z.string().optional().default(""),
});

const ResponseSchema = z.array(PointSchema);

function trimHHmm(s: string | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function buildHours(horaires: z.infer<typeof HoraireSchema>[]): OpeningHours {
  const hours: OpeningHours = {};
  for (const h of horaires) {
    const key = DAY_BY_INDEX[h.JourSemaine];
    if (!key) continue;
    const slots: OpeningSlot[] = [];
    const amO = trimHHmm(h.HeureOuvertureAM);
    const amC = trimHHmm(h.HeureFermetureAM);
    const pmO = trimHHmm(h.HeureOuverturePM);
    const pmC = trimHHmm(h.HeureFermeturePM);
    if (amO && amC) slots.push({ open: amO, close: amC });
    if (pmO && pmC) slots.push({ open: pmO, close: pmC });
    if (slots.length) hours[key] = slots;
  }
  return hours;
}

function formatFrDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function buildNotes(p: z.infer<typeof PointSchema>): string | null {
  const parts: string[] = [];
  parts.push(p.CodeNature === "C" ? "Locker" : "Point Relais");
  const now = Date.now();
  const activeConges = p.Conges.filter((c) => {
    const fin = new Date(c.Fin).getTime();
    return Number.isFinite(fin) && fin >= now;
  });
  for (const c of activeConges) {
    parts.push(`Fermé du ${formatFrDate(c.Debut)} au ${formatFrDate(c.Fin)}`);
  }
  if (p.EstPIS) parts.push("PIS");
  return parts.join(" · ");
}

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
    const params = new URLSearchParams({
      country: data.country,
      postcode: data.postalCode,
      city: "",
      services: "",
      excludeSat: "false",
      naturesAllowed: "1,A,E,F,D,J,T,S,C",
    });
    const url = `https://www.mondialrelay.fr/api/parcelshop?${params.toString()}`;
    const startedAt = new Date().toISOString();

    let status = 0;
    let bodyText = "";
    let fetchError: string | null = null;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "fr-FR,fr;q=0.9",
          Referer:
            "https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/",
        },
      });
      status = res.status;
      bodyText = await res.text();
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }

    const cloudflareBlocked =
      bodyText.includes("Just a moment") ||
      bodyText.includes("challenges.cloudflare.com") ||
      bodyText.includes("Performing security verification");

    let rawCount = 0;
    let mapped: Array<{
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
    }> = [];
    let parseError: string | null = null;

    if (status === 200 && bodyText) {
      try {
        const json = JSON.parse(bodyText);
        const parsed = ResponseSchema.parse(json);
        rawCount = parsed.length;
        mapped = parsed.map((p) => {
          const line2 = p.Adresse.AdresseLigne2?.trim();
          const address = line2
            ? `${p.Adresse.AdresseLigne1} ${line2}`
            : p.Adresse.AdresseLigne1;
          return {
            provider_id: "mondial_relay",
            external_id: `mr-${p.Numero}`,
            name: p.Adresse.Libelle,
            address,
            postal_code: p.Adresse.CodePostal,
            city: p.Adresse.Ville,
            lat: p.Adresse.Latitude,
            lng: p.Adresse.Longitude,
            opening_hours: buildHours(p.Horaires),
            notes: buildNotes(p),
          };
        });
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
      requestedUrl: url,
      httpStatus: status,
      fetchError,
      cloudflareBlocked,
      bodyBytes: bodyText.length,
      bodyPreview: bodyText.slice(0, 400),
      parseError,
      rawCount,
      mappedCount: mapped.length,
      inserted,
      dbError,
      samplePoints: mapped.slice(0, 5),
    };
  });
