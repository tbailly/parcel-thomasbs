
# Plan — Carte des points relais multi-providers

## Périmètre
- App publique (pas d'auth) affichant une carte Leaflet centrée sur une adresse stockée en DB.
- 4 providers : Mondial Relay, Vinted Go, Chronopost, Shop2Shop by Chronopost.
- Couverture : départements 75, 92, 93 uniquement.
- Phase 1 (ce plan) : données fake en DB + carte fonctionnelle.
- Phase 2 (plus tard) : connecter les vraies APIs via pg_cron. Les seeds fake seront supprimés (DELETE WHERE name LIKE 'Fake - %') avant insertion des vraies données.

## Architecture data

### Tables (Lovable Cloud / Postgres)

**`providers`**
- `id` (text PK) : `mondial_relay`, `vinted_go`, `chronopost`, `shop2shop`
- `name` (text)
- `logo_url` (text) — chemin vers `/src/assets/logos/<provider>.png`
- `color` (text) — couleur d'accent pour le pin

**`pickup_points`**
- `id` (uuid PK)
- `provider_id` (text FK → providers)
- `external_id` (text, nullable) — id du point chez le provider
- `name` (text) — préfixé `Fake - ` pour les seeds
- `address` (text), `postal_code` (text), `city` (text)
- `lat` (numeric), `lng` (numeric)
- `opening_hours` (jsonb) — `{ mon: [{open, close}], tue: [...], ... }` plusieurs créneaux/jour possibles
- `notes` (text) — champ libre (fermetures exceptionnelles, dispo, etc.)
- `updated_at` (timestamptz)
- Index sur `(lat, lng)` et `provider_id`
- RLS : SELECT ouvert à `anon`, écriture réservée `service_role`

**`app_config`** (singleton)
- `id` (int PK, check id=1)
- `center_address` (text), `center_lat` (numeric), `center_lng` (numeric)
- `default_zoom_km` (numeric, default 1)
- RLS : SELECT `anon`, UPDATE `service_role`

### Seed
- ~5–8 points fake par provider, répartis dans 75/92/93, avec horaires variés et notes d'exemple ("Fermé exceptionnellement le 14/07", "Casier souvent plein", etc.).
- Tous préfixés `Fake - ` dans `name` pour permettre un DELETE ciblé en Phase 2.
- Centre par défaut : place de la République, Paris.

## Backend (TanStack Start)

- **Server function** `getPickupPoints` (public, via `supabaseAdmin`) → renvoie tous les points + config de centrage. Appelée depuis le loader de la route `/`.
- **Server route** `src/routes/api/public/refresh-pudos.ts` (POST) — stub pour Phase 2, protégée par un secret header. Renvoie `{ status: "not_implemented" }`. Sera branchée à pg_cron plus tard.

## Frontend

### Stack carte
- `leaflet` + `react-leaflet` + `leaflet.markercluster` (+ `@types/leaflet`)
- Tuiles OpenStreetMap (aucune clé)

### Route `/` — carte plein écran
- Carte centrée sur `app_config.center_lat/lng`, zoom 15 (~1km de rayon visible).
- Marqueurs personnalisés : icône = logo du provider (DivIcon avec `<img>`), bordure colorée.
- Clustering via `MarkerClusterGroup` (regroupe quand pins trop proches au zoom courant).
- Popup au clic : nom, adresse, horaires du jour mis en évidence + 7 jours déroulables, notes.
- Légende en overlay : liste des providers avec leur logo + toggle on/off pour filtrer.

### Logos
- Logos stylisés générés et placés dans `src/assets/logos/` (évite tout problème de droits sur les logos officiels en Phase 1).

## Hors scope (Phase 2)
- Connecteurs Mondial Relay / Chronopost / Vinted Go.
- pg_cron de refresh effectif.
- Recherche par adresse, itinéraires, favoris.

## Étapes d'implémentation
1. Activer Lovable Cloud.
2. Migration : tables + RLS + GRANTs + seed (providers + config + ~25 points fake).
3. Ajouter dépendances Leaflet + cluster.
4. Server function `getPickupPoints`.
5. Stub server route `refresh-pudos`.
6. Générer les logos dans `src/assets/logos/`.
7. Route `/` avec carte, markers custom, clustering, popups, légende/filtres.
8. Vérif visuelle sur viewport mobile.
