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

type PinVariant = "holo" | "neon" | "glass";

const PIN_SIZE = 48;

function buildHoloDiamond(provider: Provider, logo: string, uid: string): string {
  const c = provider.color;
  return `
    <svg width="${PIN_SIZE}" height="${PIN_SIZE}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <defs>
        <linearGradient id="hg-l-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="1" stop-color="${c}" stop-opacity="0.18"/>
        </linearGradient>
        <linearGradient id="hg-r-${uid}" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e5e7eb"/>
          <stop offset="1" stop-color="${c}" stop-opacity="0.25"/>
        </linearGradient>
        <filter id="hf-${uid}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="hc-${uid}"><circle cx="24" cy="24" r="9.5"/></clipPath>
      </defs>
      <g filter="url(#hf-${uid})">
        <path d="M24 4 L44 24 L24 44 L4 24 Z" fill="${c}" opacity="0.35"/>
      </g>
      <path d="M24 4 L24 44 L4 24 Z" fill="url(#hg-l-${uid})"/>
      <path d="M24 4 L44 24 L24 44 Z" fill="url(#hg-r-${uid})"/>
      <path d="M24 4 L44 24 L24 44 L4 24 Z" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="24" cy="24" r="10" fill="#fafafa" stroke="${c}" stroke-width="0.75" stroke-opacity="0.4"/>
      <image href="${logo}" x="14" y="14" width="20" height="20" clip-path="url(#hc-${uid})" preserveAspectRatio="xMidYMid slice"/>
      <path d="M24 2 L26 4 L22 4 Z M46 24 L44 26 L44 22 Z M24 46 L22 44 L26 44 Z M2 24 L4 22 L4 26 Z" fill="${c}" opacity="0.8"/>
    </svg>`;
}

function buildNeonCrystal(provider: Provider, logo: string, uid: string): string {
  const c = provider.color;
  return `
    <svg width="${PIN_SIZE}" height="${PIN_SIZE}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <defs>
        <filter id="nf-${uid}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.8" result="b1"/>
          <feMerge><feMergeNode in="b1"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="nc-${uid}"><circle cx="24" cy="24" r="8.5"/></clipPath>
      </defs>
      <path d="M24 5 L43 24 L24 43 L5 24 Z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" opacity="0.55" filter="url(#nf-${uid})"/>
      <path d="M24 5 L43 24 L24 43 L5 24 Z" fill="rgba(15,23,42,0.06)" stroke="${c}" stroke-width="1.75" stroke-linejoin="round"/>
      <circle cx="24" cy="24" r="9" fill="#0f172a" fill-opacity="0.88" stroke="${c}" stroke-width="0.75" stroke-opacity="0.7"/>
      <image href="${logo}" x="15.5" y="15.5" width="17" height="17" clip-path="url(#nc-${uid})" preserveAspectRatio="xMidYMid slice" style="filter:brightness(1.6) contrast(0.9)"/>
    </svg>`;
}

function buildGlassPrism(provider: Provider, logo: string, uid: string): string {
  const c = provider.color;
  return `
    <svg width="${PIN_SIZE}" height="${PIN_SIZE}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <defs>
        <linearGradient id="gg-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
          <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.45"/>
          <stop offset="1" stop-color="${c}" stop-opacity="0.25"/>
        </linearGradient>
        <linearGradient id="gs-${uid}" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
          <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
        <filter id="gf-${uid}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <clipPath id="gc-${uid}"><circle cx="24" cy="24" r="9"/></clipPath>
        <clipPath id="gd-${uid}"><path d="M24 5 L43 24 L24 43 L5 24 Z"/></clipPath>
      </defs>
      <path d="M24 5 L43 24 L24 43 L5 24 Z" fill="${c}" opacity="0.25" filter="url(#gf-${uid})"/>
      <path d="M24 5 L43 24 L24 43 L5 24 Z" fill="url(#gg-${uid})" stroke="#ffffff" stroke-width="1.25" stroke-linejoin="round"/>
      <g clip-path="url(#gd-${uid})">
        <path d="M24 5 L43 24 L24 24 Z" fill="url(#gs-${uid})"/>
      </g>
      <path d="M24 5 L43 24 L24 43 L5 24 Z" fill="none" stroke="${c}" stroke-width="0.9" stroke-linejoin="round" opacity="0.85"/>
      <circle cx="24" cy="24" r="9.5" fill="#ffffff" fill-opacity="0.7"/>
      <image href="${logo}" x="15" y="15" width="18" height="18" clip-path="url(#gc-${uid})" preserveAspectRatio="xMidYMid slice"/>
      <circle cx="36" cy="36" r="2.6" fill="${c}" stroke="#ffffff" stroke-width="0.9"/>
    </svg>`;
}

let pinUidCounter = 0;
function makeIcon(provider: Provider, variant: PinVariant): L.DivIcon {
  const logo = getProviderLogo(provider);
  const uid = `${variant}-${provider.id}-${++pinUidCounter}`;
  const html =
    variant === "holo"
      ? buildHoloDiamond(provider, logo, uid)
      : variant === "neon"
      ? buildNeonCrystal(provider, logo, uid)
      : buildGlassPrism(provider, logo, uid);
  return L.divIcon({
    className: "pudo-pin",
    html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25))">${html}</div>`,
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
    popupAnchor: [0, -PIN_SIZE / 2 + 2],
  });
}

export function PickupMap({ providers, points, config }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(providers.map((p) => [p.id, true])),
  );
  const [variant, setVariant] = useState<PinVariant>(() => {
    if (typeof window === "undefined") return "holo";
    return (localStorage.getItem("pin-variant") as PinVariant) || "holo";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("pin-variant", variant);
  }, [variant]);

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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
      className: "pudo-tiles-beige",
    }).addTo(map);

    // Center marker
    L.circleMarker([config.center_lat, config.center_lng], {
      radius: 6,
      color: "#1f2937",
      fillColor: "#1f2937",
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

    </div>
  );
}
