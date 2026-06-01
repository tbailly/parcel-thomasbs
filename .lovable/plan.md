## Objectif

Sur `/refresh`, sous le bouton de chaque provider, ajouter une zone de texte où coller un JSON (array) de points relais. Au clic sur "Importer", créer une nouvelle `query` puis insérer un `pickup_point` par élément avec `query_id` et `provider_id`.

## Format JSON attendu

Array d'objets avec : `external_id`, `name`, `address`, `postal_code`, `city`, `lat`, `lng`, `opening_hours`, `notes`.

## Implémentation

### 1. Nouveau server function `src/lib/refresh.functions.ts`

Ajouter `importPickupPointsJson` (`POST`) :

- Input validé via Zod : `{ provider_id: string, points: Array<{external_id, name, address, postal_code, city, lat:number, lng:number, opening_hours:any, notes:string|null}> }`.
- Handler (via `supabaseAdmin`) :
  1. `insert` dans `queries` : `{ provider_id, status: 'success', started_at: now, finished_at: now, raw_count: points.length, inserted_count: points.length }` → récupérer `id`.
  2. `insert` dans `pickup_points` du batch mappé avec `query_id` + `provider_id`.
  3. En cas d'erreur insert points : update query avec `status='error'`, `error=...`.
- Retour : `{ query_id, inserted }`.

### 2. UI `src/routes/refresh.tsx`

Sous le bouton de chaque provider, ajouter dans le `<li>` :

- `<Textarea>` (shadcn) contrôlée via `useState` (map `providerId -> string`).
- Bouton "Importer JSON" qui :
  - parse le texte (try/catch → toast.error si invalide),
  - appelle `useServerFn(importPickupPointsJson)`,
  - toast success avec nb inséré + `query_id`,
  - vide la textarea.
- État `loading` par provider pour disable le bouton.

### 3. Hors scope

- Pas de modification du schéma DB (les colonnes existent déjà).
- Pas de dédup / upsert : insertion brute comme demandé.
- Pas d'auth (la page `/refresh` reste publique comme actuellement).