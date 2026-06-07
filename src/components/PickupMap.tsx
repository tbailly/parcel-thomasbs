import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Navigation, X } from "lucide-react";
import type { AppConfig, HomeAddress, OpeningHours, PickupPoint, Provider } from "@/lib/pickup-points.functions";
import { getProviderLogo } from "@/lib/provider-logos";

type Props = {
  providers: Provider[];
  points: PickupPoint[];
  config: AppConfig;
  homes: HomeAddress[];
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

// Popup rendering moved to a React bottom sheet (see component below).

const PIN_SIZE = 48;
const CLUSTER_SIZE = 56;
const DEFAULT_DOT_COLOR = "#374151"; // gris profond

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

let pinUidCounter = 0;
function makeIcon(provider: Provider): L.DivIcon {
  const logo = getProviderLogo(provider);
  const uid = `holo-${provider.id}-${++pinUidCounter}`;
  const html = buildHoloDiamond(provider, logo, uid);
  return L.divIcon({
    className: "pudo-pin",
    html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25))">${html}</div>`,
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE / 2],
    popupAnchor: [0, -PIN_SIZE / 2 + 2],
  });
}

function buildClusterDiamond(count: number, providerColors: string[], uid: string): string {
  // Dots: one per provider present (any count), positioned under the count number.
  const dotR = 2.6;
  const gap = 7;
  const total = providerColors.length;
  const startX = 28 - ((total - 1) * gap) / 2;
  const dots = providerColors
    .map((c, i) => `<circle cx="${startX + i * gap}" cy="42" r="${dotR}" fill="${c}" stroke="#ffffff" stroke-width="0.7"/>`)
    .join("");

  return `
    <svg width="${CLUSTER_SIZE}" height="${CLUSTER_SIZE}" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <defs>
        <linearGradient id="cl-l-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="1" stop-color="${DEFAULT_DOT_COLOR}" stop-opacity="0.14"/>
        </linearGradient>
        <linearGradient id="cl-r-${uid}" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e5e7eb"/>
          <stop offset="1" stop-color="${DEFAULT_DOT_COLOR}" stop-opacity="0.22"/>
        </linearGradient>
        <filter id="cl-f-${uid}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g filter="url(#cl-f-${uid})">
        <path d="M28 4 L52 28 L28 52 L4 28 Z" fill="${DEFAULT_DOT_COLOR}" opacity="0.55"/>
      </g>
      <path d="M28 4 L52 28 L28 52 L4 28 Z" fill="${DEFAULT_DOT_COLOR}" fill-opacity="0.85"/>
      <path d="M28 4 L52 28 L28 52 L4 28 Z" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round" stroke-opacity="0.85"/>
      <text x="28" y="32" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="700" fill="#ffffff" stroke="rgba(0,0,0,0.35)" stroke-width="2.5" paint-order="stroke">${count}</text>
      ${dots}
      <path d="M28 2 L30 4 L26 4 Z M54 28 L52 30 L52 26 Z M28 54 L26 52 L30 52 Z M2 28 L4 26 L4 30 Z" fill="${DEFAULT_DOT_COLOR}" opacity="0.85"/>
    </svg>`;
}

const HOME_COLOR = "#16A34A";
const HOME_SIZE = 44;

function buildHomeDiamond(uid: string): string {
  const c = HOME_COLOR;
  return `
    <svg width="${HOME_SIZE}" height="${HOME_SIZE}" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible">
      <defs>
        <linearGradient id="hm-l-${uid}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
          <stop offset="1" stop-color="${c}" stop-opacity="0.85"/>
        </linearGradient>
        <linearGradient id="hm-r-${uid}" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
          <stop offset="1" stop-color="${c}"/>
        </linearGradient>
        <filter id="hm-f-${uid}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <g filter="url(#hm-f-${uid})">
        <path d="M22 4 L40 22 L22 40 L4 22 Z" fill="${c}" opacity="0.45"/>
      </g>
      <path d="M22 4 L22 40 L4 22 Z" fill="url(#hm-l-${uid})"/>
      <path d="M22 4 L40 22 L22 40 Z" fill="url(#hm-r-${uid})"/>
      <path d="M22 4 L40 22 L22 40 L4 22 Z" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linejoin="round" stroke-opacity="0.9"/>
      <path d="M22 4 L40 22 L22 40 L4 22 Z" fill="none" stroke="${c}" stroke-width="0.8" stroke-linejoin="round" opacity="0.6"/>
      <g transform="translate(13 13)" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 8 L9 2 L16 8 L16 16 L2 16 Z"/>
        <path d="M7 16 L7 11 L11 11 L11 16"/>
      </g>
      <path d="M22 2 L24 4 L20 4 Z M42 22 L40 24 L40 20 Z M22 42 L20 40 L24 40 Z M2 22 L4 20 L4 24 Z" fill="${c}" opacity="0.85"/>
    </svg>`;
}

let homeUidCounter = 0;
function makeHomeIcon(): L.DivIcon {
  const uid = `home-${++homeUidCounter}`;
  return L.divIcon({
    className: "pudo-home",
    html: `<div style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28))">${buildHomeDiamond(uid)}</div>`,
    iconSize: [HOME_SIZE, HOME_SIZE],
    iconAnchor: [HOME_SIZE / 2, HOME_SIZE / 2],
    popupAnchor: [0, -HOME_SIZE / 2 + 2],
  });
}



let clusterUidCounter = 0;

export function PickupMap({ providers, points, config, homes }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const homesLayerRef = useRef<L.LayerGroup | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(providers.map((p) => [p.id, true])),
  );
  const [selected, setSelected] = useState<PickupPoint | null>(null);

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

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 45,
      iconCreateFunction: (clusterLayer) => {
        const childMarkers = clusterLayer.getAllChildMarkers();
        const seen = new Map<string, string>(); // provider_id -> color, preserve insertion order
        for (const m of childMarkers) {
          const pid = (m.options as { providerId?: string }).providerId;
          const color = (m.options as { providerColor?: string }).providerColor;
          if (pid && color && !seen.has(pid)) seen.set(pid, color);
        }
        const colors = Array.from(seen.values());
        const uid = `c-${++clusterUidCounter}`;
        const html = buildClusterDiamond(childMarkers.length, colors, uid);
        return L.divIcon({
          className: "pudo-cluster",
          html: `<div style="filter:drop-shadow(0 2px 5px rgba(0,0,0,0.28))">${html}</div>`,
          iconSize: [CLUSTER_SIZE, CLUSTER_SIZE],
          iconAnchor: [CLUSTER_SIZE / 2, CLUSTER_SIZE / 2],
        });
      },
    });
    map.addLayer(cluster);

    // Homes layer (not clustered, always visible above tiles)
    const homesLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    clusterRef.current = cluster;
    homesLayerRef.current = homesLayer;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      homesLayerRef.current = null;
    };
  }, [config.center_lat, config.center_lng, config.default_zoom]);

  // Sync home pins
  useEffect(() => {
    const layer = homesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const home of homes) {
      L.marker([home.lat, home.lng], { icon: makeHomeIcon(), zIndexOffset: 1000 })
        .bindTooltip(home.name, { direction: "top", offset: [0, -HOME_SIZE / 2 + 4] })
        .addTo(layer);
    }
  }, [homes]);

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
      const marker = L.marker([point.lat, point.lng], {
        icon: makeIcon(provider),
        // custom props read by cluster iconCreateFunction
        providerId: provider.id,
        providerColor: provider.color,
      } as L.MarkerOptions & { providerId: string; providerColor: string });
      marker.on("click", () => setSelected(point));
      markers.push(marker);
    }
    cluster.addLayers(markers);
  }, [points, enabled, providerById]);



  return (
    <div className="relative h-screen w-screen">
      <div ref={containerRef} className="absolute inset-0" aria-label="Carte des points relais" />

      {/* Provider toggles */}
      <div className="absolute right-3 top-3 z-[400] flex items-center gap-2 rounded-full bg-white/85 px-2.5 py-2 shadow-md backdrop-blur-sm">
        {providers.map((p) => {
          const on = enabled[p.id] ?? true;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setEnabled((prev) => ({ ...prev, [p.id]: !on }))}
              className="relative flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200"
              style={{
                backgroundColor: on ? `${p.color}22` : "transparent",
                boxShadow: on ? `0 0 0 1.5px ${p.color}66, 0 0 8px ${p.color}44` : "inset 0 0 0 1.5px #d1d5db",
                opacity: on ? 1 : 0.45,
              }}
              aria-pressed={on}
              title={p.name}
            >
              <img
                src={getProviderLogo(p)}
                alt={p.name}
                width={18}
                height={18}
                className="rounded-full object-cover"
                style={{ filter: on ? "none" : "grayscale(0.6)" }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
