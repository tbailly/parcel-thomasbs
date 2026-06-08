# Parcel — Pickup Point Explorer

A personal map of every parcel pickup point around the addresses I actually use,
across the three carriers that matter in France: **Chronopost**, **Mondial
Relay**, and **Vinted Go**. One map, one set of opening hours, one click to open
Google Maps directions.

The public site at [parcel-thomasbs.lovable.app](https://parcel-thomasbs.lovable.app)
is read-only; an admin area behind a password lets me refresh data, inspect query
history, and run on-demand enrichment jobs.

---

## What it does

<h3>A unified map of every nearby pickup point</h3>
Each carrier has its own glyph and color. Clusters collapse at low zoom levels; filters in the top-right toggle carriers in and out. Tap any point and a sheet slides up with the address, today's opening hours, the rest of the week, additional notes, and shortcut buttons to open Google Maps or copy directions.

<table>
  <tr>
    <td width="33%" valign="bottom">
      <!-- <h3>A unified map of every nearby pickup point</h3>
      Each carrier has its own glyph and color (Vinted Go = teal "V", Mondial Relay = red, Chronopost = blue cube). Clusters collapse at low zoom levels; filters in the top-right toggle carriers in and out. -->
    </td>
    <td width="33%" valign="bottom">
      <!-- Zoom in and the individual points spread out: -->
    </td>
    <td width="33%" valign="bottom">
      <!-- <h3>Detailed point sheet with opening hours</h3>
      Tap any point and a sheet slides up with the address, today's opening hours, the rest of the week, the venue type, and shortcut buttons to open Google Maps or copy directions. -->
    </td>
  </tr>
  <tr>
    <td valign="top"><img src="docs/screenshots/01-map-clusters.png" width="100%"/></td>
    <td valign="top"><img src="docs/screenshots/02-map-overview.png" width="100%"/></td>
    <td valign="top"><img src="docs/screenshots/03-point-details.png" width="100%"/></td>
  </tr>
</table>

### Admin dashboard

Per-provider summary cards (count, last refresh time, refresh button), an
orphan cleanup utility, and the full history of every query/refresh run with
expandable per-point detail.

<table>
  <tr>
    <td width="16.5%"></td>
    <td width="33%"></td>
    <td width="33%"></td>
    <td width="16.5%"></td>
  </tr>
  <tr>
    <td></td>
    <td valign="top"><img src="docs/screenshots/04-dashboard.png" width="100%"/></td>
    <td valign="top"><img src="docs/screenshots/05-queries-history.png" width="100%"/></td>
    <td></td>
  </tr>
</table>

### Refresh pipelines, one per carrier

<table>
  <tr>
    <td valign="top"><img src="docs/screenshots/06-refresh-chronopost.png" width="100%"/></td>
    <td valign="top"><img src="docs/screenshots/07-refresh-mondialrelay.png" width="100%"/></td>
    <td valign="top"><img src="docs/screenshots/08-refresh-vintedgo.png" width="100%"/></td>
  </tr>
  <tr>
    <td width="33%" valign="bottom">
      <b>Chronopost</b> is fully automated server-side: a single click loops over each home address and scrapes the nearby relays.
    </td>
    <td width="33%" valign="bottom">
      <b>Mondial Relay</b> is a hybrid: their endpoint is CORS-locked, so the admin page copies a scraping script to the clipboard, opens the Mondial Relay site, and expects a JSON paste-back.
    </td>
    <td width="33%" valign="bottom">
      <b>Vinted Go</b> runs end-to-end on the server. A list refresh tiles the area around each home address; a background cron job then enriches each point with its opening hours, 5 points every 2 minutes, with a live progress bar.
    </td>
  </tr>
</table>

---

## How it's built

- **Frontend**: [TanStack Start](https://tanstack.com/start) (React 19, Vite 7),
  file-based routing, Tailwind v4 with semantic design tokens, shadcn/ui
  components. The map is [MapLibre GL](https://maplibre.org/) with
  [Supercluster](https://github.com/mapbox/supercluster) for clustering.
- **Backend**: [Lovable Cloud](https://lovable.dev) (managed Postgres + auth +
  storage). All server-side logic lives in TanStack Start
  `createServerFn` handlers; public API routes (cron webhook) live under
  `/api/public/`.
- **Hosting**: Cloudflare Workers via the TanStack Start adapter — the entire
  app, including server functions and SSR, runs at the edge.
- **Scraping**:
  - Chronopost: server-side fetches against their public store-locator JSON
    endpoint.
  - Mondial Relay: hybrid client-side script (DevTools paste) because their
    endpoint blocks server-to-server requests.
  - Vinted Go: server-side scrape of the Next.js RSC payload + a per-point
    Server Action to fetch business hours.
- **Background jobs**: `pg_cron` calls a public HTTP endpoint
  (`/api/public/hooks/enrich-vinted-go`) every 2 minutes with a bearer secret;
  the handler validates the secret with `crypto.timingSafeEqual`, parses the
  body with Zod, and processes a small batch.
- **Auth**: simple password-protected admin area with rate-limited login,
  constant-time password comparison, and a signed session cookie. Every admin
  server function is guarded by a `requireAdmin` middleware so endpoints can't
  be called directly.
- **Database design**: `providers`, `pickup_points`, `queries` (one row per
  refresh run), `enrichment_jobs`, `enrichments`, `home_addresses`. All tables
  use Row-Level Security; refresh URLs and scraping scripts live in a separate
  admin-only table.

---

## Local development

```bash
bun install
bun dev
```

The Lovable Cloud backend is provisioned automatically; secrets are managed
through the Lovable dashboard.
