## Objectif

1. Une adresse « maison » minimale (nom, lat, lng, code postal) sert de centre pour Mondial Relay — **seul le code postal est envoyé** à MR.
2. Chaque scrape crée une ligne dans une nouvelle table `queries` et insère **tous** les points retournés dans `pickup_points` avec un `query_id`. Pas de filtre rayon, pas de delete.
3. L'affichage ne montre que les points de la **dernière query par provider**.

## 1. Migration Supabase

### Table `home_addresses`
- `id` uuid PK (`gen_random_uuid()`)
- `name` text NOT NULL
- `postal_code` text NOT NULL (seule info envoyée à MR)
- `country` text NOT NULL DEFAULT `'FR'`
- `lat` numeric NOT NULL
- `lng` numeric NOT NULL
- `position` integer NOT NULL DEFAULT `0` (la « 1re » = `order by position, created_at limit 1`)
- `created_at`, `updated_at`
- RLS ON, policy `home_addresses_public_read` (SELECT, `USING true`).
- GRANT SELECT à `anon`/`authenticated`, ALL à `service_role`.

### Table `queries`
- `id` uuid PK (`gen_random_uuid()`)
- `provider_id` text NOT NULL (`'mondial_relay'`, `'vinted_go'`, …)
- `home_address_id` uuid NULL (référence informative vers `home_addresses.id`, pas de FK stricte pour rester souple)
- `postal_code` text NULL (snapshot du CP utilisé)
- `status` text NOT NULL DEFAULT `'success'` (`'success' | 'error'`)
- `raw_count` integer NOT NULL DEFAULT `0`
- `inserted_count` integer NOT NULL DEFAULT `0`
- `error` text NULL
- `started_at`, `finished_at` timestamptz
- `created_at` timestamptz DEFAULT now()
- Index `(provider_id, finished_at desc)`.
- RLS ON, policy `queries_public_read` (SELECT, `USING true`).
- GRANT SELECT à `anon`/`authenticated`, ALL à `service_role`.

### Modification `pickup_points`
- Ajouter `query_id` uuid NULL (rempli pour les nouveaux scrapes ; les lignes existantes restent à NULL et seront purgées au prochain run).
- Index `(provider_id, query_id)`.

### Vue `latest_pickup_points`
Vue SQL qui ne renvoie que les points de la **dernière query réussie** pour chaque provider :

```sql
CREATE OR REPLACE VIEW public.latest_pickup_points AS
WITH last_q AS (
  SELECT DISTINCT ON (provider_id) id, provider_id
  FROM public.queries
  WHERE status = 'success'
  ORDER BY provider_id, finished_at DESC
)
SELECT p.*
FROM public.pickup_points p
JOIN last_q ON p.query_id = last_q.id;
```

- GRANT SELECT à `anon`/`authenticated` sur la vue.
- (La vue hérite de la RLS de `pickup_points` ; on garde sa policy `public_read` actuelle.)

Pas de seed : tu inséreras la 1re adresse maison à la main, par ex. :
```sql
INSERT INTO home_addresses (name, postal_code, country, lat, lng, position)
VALUES ('Maison', '75001', 'FR', 48.8566, 2.3522, 0);
```

## 2. `scrapeMondialRelay` (src/lib/mondial-relay.functions.ts)

1. Retirer `postalCode`/`country` du validateur d'entrée (vide accepté).
2. Charger l'adresse maison (`home_addresses` order by position/created_at limit 1). Si absente : insérer une `queries` avec `status='error'`, `error='no home address'`, retourner diagnostic et stop.
3. **Insérer d'abord** la ligne `queries` (`status='success'` provisoire, `started_at = now`, `raw_count=0`, `inserted_count=0`) et récupérer son `id` → `queryId`.
4. Appeler Firecrawl avec `?codePostal=<postal_code>&pays=<country>` (seul le CP est transmis), prompt actuel inchangé (« extrais TOUS les points »).
5. **Aucun filtre par distance**. On garde tout ce que MR a renvoyé.
6. Mapper chaque point en `MappedPoint` + `query_id: queryId`.
7. **Append-only** : `insert(mapped)` dans `pickup_points`. Plus de `delete().eq('provider_id', …)`.
8. Mettre à jour la ligne `queries` : `raw_count`, `inserted_count`, `finished_at`, `status` (`'error'` + `error` si Firecrawl/DB a échoué).
9. Diagnostic enrichi : `queryId`, `centerName`, `centerPostalCode`, `rawPointCount`, `insertedCount`, plus les champs existants.

## 3. Lecture (src/lib/pickup-points.functions.ts)

- Remplacer `from("pickup_points").select(...)` par `from("latest_pickup_points").select(...)`.
- Reste identique (providers, app_config inchangés).
- Type `PickupPoint` reçoit un champ optionnel `query_id` (utile pour debug, pas nécessaire à l'UI).

## 4. UI (src/routes/index.tsx)

- Bouton : `scrape({ data: {} })` (plus de `75001` codé en dur).
- Libellé : « Importer Mondial Relay (adresse maison) ».
- Aucun autre changement (le diagnostic s'affiche déjà en JSON).

## Nettoyage futur (hors scope de ce run)

- Pas de purge automatique. Les anciennes lignes `pickup_points` (query_id de runs précédents) s'accumulent et restent invisibles grâce à la vue. On ajoutera plus tard une fonction de purge type « supprimer les points dont le `query_id` n'est pas dans les N dernières queries par provider ».
- Les lignes `pickup_points` actuelles (avec `query_id = NULL`) ne seront plus jamais affichées dès le 1er nouveau run — on peut les laisser ou les supprimer manuellement.

## Hors scope

- CRUD home_addresses en UI.
- Filtre rayon (abandonné).
- Purge automatique.
- Multi-providers (la structure est prête, mais on n'ajoute que MR pour l'instant).
