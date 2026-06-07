## Objectif

Créer `/dashboard` : page d'administration unique consolidant l'état des providers et l'inspection des queries/points, avec suppression en cascade.

## 1. Migrations DB

**Cascades** (FK actuellement absentes) :
- `pickup_points.query_id` → `queries(id) ON DELETE CASCADE`
- `enrichments.point_id` → `pickup_points(id) ON DELETE CASCADE`
- Nettoyer au préalable les orphelins éventuels avant de poser les FK.

**Grants** : ajouter `DELETE` sur `queries` au rôle `service_role` (déjà OK car `supabaseAdmin` = service role, mais on s'assure des grants ON sequences/tables).

## 2. Server functions (`src/lib/dashboard.functions.ts`)

- `getDashboardOverview()` : pour chaque provider, dernière query (`max(finished_at)`) + `inserted_count` + `total points actuels`.
- `getProviderQueries({ provider_id })` : liste des queries triées DESC avec `nb points actuellement rattachés` (count via `pickup_points.query_id`).
- `getQueryPoints({ query_id })` : tous les points liés (pas de pagination, KISS).
- `deleteQuery({ query_id })` : `DELETE FROM queries WHERE id = ?` (la cascade s'occupe du reste).

Tout via `supabaseAdmin` (admin tool interne).

## 3. Route `/dashboard` (`src/routes/dashboard.tsx`)

Structure :
- **Header** : titre + liens rapides vers `/refresh` et `/refresh-vinted` (on garde ces pages telles quelles, le dashboard ne les remplace pas).
- **Section cartes providers** (grid responsive) : une `Card` par provider avec
  - Nom + pastille couleur + logo
  - Date du dernier refresh (`finished_at` formaté)
  - Nombre de points du dernier refresh (`inserted_count`)
  - Total de points actuels
- **Section tabs** : un `Tabs` (shadcn) avec une `TabsTrigger` par provider.
  - Dans chaque `TabsContent`, une `Table` des queries (date, status, raw_count, inserted_count, nb points actuels, erreur tronquée, bouton 🗑).
  - Chaque ligne est expandable (state local `expandedQueryId`) → fetch à la demande (`useQuery` keyé sur `query_id`) des points et affichage dans une sous-`Table` (id court, external_id, name, address, postal_code, city, lat/lng, hours_fetched_at).
  - Bouton supprimer → `AlertDialog` de confirmation → `deleteQuery` → invalide les queries.

Tout reste KISS : pas de virtualization, pas de pagination, refetch simple.

## 4. Hors scope

- Pas de changement à `PickupMap`, `/`, `/refresh`, `/refresh-vinted`.
- Pas de RLS modifiée (tout est lu via `supabaseAdmin` côté server-fn).
- Pas d'auth sur `/dashboard` (cohérent avec `/refresh` actuel).

## Détails techniques

- Tabs + Table + Card + AlertDialog déjà disponibles dans `components/ui`.
- Pour les counts par query, une seule requête `SELECT query_id, count(*) FROM pickup_points GROUP BY query_id` filtrée par provider est suffisante.
- Cascade FK : `ALTER TABLE` avec `DROP CONSTRAINT IF EXISTS` puis `ADD CONSTRAINT ... REFERENCES ... ON DELETE CASCADE`.
- Les points actuels « du dernier refresh » = ceux dont `query_id = last_query.id` (cohérent avec l'insertion). Pour Vinted Go (upsert), `query_id` est mis à jour à chaque refresh, donc le count reste correct.
