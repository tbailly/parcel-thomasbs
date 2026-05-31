import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type OpeningSlot = { open: string; close: string };
export type OpeningHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", OpeningSlot[]>>;

export type Provider = {
  id: string;
  name: string;
  logo_url: string;
  color: string;
};

export type PickupPoint = {
  id: string;
  provider_id: string;
  name: string;
  address: string;
  postal_code: string;
  city: string;
  lat: number;
  lng: number;
  opening_hours: OpeningHours;
  notes: string | null;
};

export type AppConfig = {
  center_address: string;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
};

export const getMapData = createServerFn({ method: "GET" }).handler(async () => {
  const [providersRes, pointsRes, configRes] = await Promise.all([
    supabaseAdmin.from("providers").select("id, name, logo_url, color"),
    supabaseAdmin
      .from("latest_pickup_points")
      .select("id, provider_id, name, address, postal_code, city, lat, lng, opening_hours, notes"),
    supabaseAdmin
      .from("app_config")
      .select("center_address, center_lat, center_lng, default_zoom")
      .eq("id", 1)
      .single(),
  ]);

  if (providersRes.error) throw new Error(providersRes.error.message);
  if (pointsRes.error) throw new Error(pointsRes.error.message);
  if (configRes.error) throw new Error(configRes.error.message);

  const providers = (providersRes.data ?? []) as Provider[];
  const points = ((pointsRes.data ?? []) as unknown as PickupPoint[]).map((p) => ({
    ...p,
    lat: Number(p.lat),
    lng: Number(p.lng),
  }));
  const config = {
    ...configRes.data,
    center_lat: Number(configRes.data.center_lat),
    center_lng: Number(configRes.data.center_lng),
  } as AppConfig;

  return { providers, points, config };
});
