import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { AppConfig, OpeningHours, PickupPoint, Provider } from "@/lib/pickup-points.functions";
import { getProviderLogo } from "@/lib/provider-logos";

type Props = {
  providers: Provider[];
  points: PickupPoint[];
  config: AppConfig;
};

const DAYS: { key: keyof OpeningHours; label: string }[] = [
  { key: "mon", label: "Lundi" },
  { key: "tue", label: "Mardi" },
  { key: "wed", label: "Mercredi" },
  { key: "thu", label: "Jeudi" },
  { key: "fri", label: "Vendredi" },
  { key: "sat", label: "Samedi" },
  { key: "sun", label: "Dimanche" },
];

const DAY_KEYS: (keyof OpeningHours)[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function formatHours(hours: OpeningHours[keyof OpeningHours]): string {
  if (!hours || hours.length === 0) return "Fermé";
  return hours.map((s) => `${s.open} – ${s.close}`).join(", ");
}

function buildPopupHtml(point: PickupPoint, provider: Provider): string {
  const todayKey = DAY_KEYS[new Date().getDay()];
  const isFake = point.name.startsWith("Fake - ");
  const logo = getProviderLogo(provider);
  const rows = DAYS.map(({ key, label }) => {
    const isToday = key === todayKey;
    return `<tr${isToday ? ' style="font-weight:600;color:' + provider.color + '"' : ""}>
      <td style="padding:2px 8px 2px 0;white-space:nowrap">${label}${isToday ? " (auj.)" : ""}</td>
      <td style="padding:2px 0">${formatHours(point.opening_hours[key])}</td>
    </tr>`;
  }).join("");

  return `
    <div style="font-family:inherit;min-width:220px;max-width:280px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <img src="${logo}" width="22" height="22" alt="" style="border-radius:50%;object-fit:cover"/>
        <strong style="font-size:13px">${provider.name}</strong>
        ${isFake ? '<span style="margin-left:auto;font-size:10px;background:#fde68a;color:#92400e;padding:2px 6px;border-radius:4px">DEMO</span>' : ""}
      </div>
      <div style="font-size:14px;font-weight:600;margin-bottom:2px">${point.name.replace(/^Fake - /, "")}</div>
      <div style="font-size:12px;color:#555;margin-bottom:8px">${point.address}<br/>${point.postal_code} ${point.city}</div>
      <details>
        <summary style="cursor:pointer;font-size:12px;color:#333;margin-bottom:4px">Horaires</summary>
        <table style="font-size:12px;border-collapse:collapse;margin-top:4px">${rows}</table>
      </details>
      ${point.notes ? `<div style="margin-top:8px;padding:6px 8px;background:#f3f4f6;border-radius:6px;font-size:12px;color:#374151">${point.notes}</div>` : ""}
    </div>
  `;
}

function makeIcon(provider: Provider): L.DivIcon {
  const logo = getProviderLogo(provider);
  const color = provider.color;
  // Teardrop pin: circle on top + pointed tip at bottom. Tip = exact coordinate.
  const html = `
    <svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
      <defs>
        <clipPath id="cl-${provider.id}"><circle cx="20" cy="20" r="13"/></clipPath>
      </defs>
      <path d="M20 51.5 C 20 51.5 6 32 4 24 A 18 18 0 1 1 36 24 C 34 32 20 51.5 20 51.5 Z"
            fill="${color}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="20" cy="20" r="13" fill="#ffffff"/>
      <image href="${logo}" x="7" y="7" width="26" height="26" clip-path="url(#cl-${provider.id})" preserveAspectRatio="xMidYMid slice"/>
    </svg>`;
  return L.divIcon({
    className: "pudo-pin",
    html,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    popupAnchor: [0, -48],
  });
}

export function PickupMap({ providers, points, config }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(providers.map((p) => [p.id, true])),
  );

  const providerById = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p])),
    [providers],
  );

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [config.center_lat, config.center_lng],
      zoom: config.default_zoom,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Center marker
    L.circleMarker([config.center_lat, config.center_lng], {
      radius: 6,
      color: "#111",
      fillColor: "#111",
      fillOpacity: 0.9,
      weight: 2,
    })
      .bindTooltip(config.center_address, { direction: "top" })
      .addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 45,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, [config.center_lat, config.center_lng, config.center_address, config.default_zoom]);

  // Sync markers when filters change
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const markers: L.Marker[] = [];
    for (const point of points) {
      if (!enabled[point.provider_id]) continue;
      const provider = providerById[point.provider_id];
      if (!provider) continue;
      const marker = L.marker([point.lat, point.lng], { icon: makeIcon(provider) });
      marker.bindPopup(buildPopupHtml(point, provider), { maxWidth: 320 });
      markers.push(marker);
    }
    cluster.addLayers(markers);
  }, [points, enabled, providerById]);

  return (
    <div className="relative h-screen w-screen">
      <div ref={containerRef} className="absolute inset-0" aria-label="Carte des points relais" />

      {/* Legend / filter overlay */}
      <div className="absolute right-3 top-3 z-[400] max-w-[200px] rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Transporteurs
        </div>
        <ul className="space-y-1.5">
          {providers.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled[p.id] ?? true}
                  onChange={(e) => setEnabled((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                  className="h-4 w-4 accent-gray-900"
                />
                <img src={getProviderLogo(p)} alt="" width={20} height={20} className="rounded-full object-cover" />
                <span className="truncate" style={{ color: p.color }}>{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* Badge bas-gauche */}
      <div className="absolute bottom-3 left-3 z-[400] rounded-lg bg-white/95 px-3 py-1.5 text-xs text-gray-700 shadow-md backdrop-blur">
        Données de démo · 75 / 92 / 93
      </div>
    </div>
  );
}
