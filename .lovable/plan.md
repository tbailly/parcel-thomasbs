## Contexte

- La cascade FK est bien en place : `pickup_points.query_id → queries(id) ON DELETE CASCADE` et `enrichments.point_id → pickup_points(id) ON DELETE CASCADE`. La suppression d'une query supprime bien ses points.
- Si tu n'as pas vu de cascade, c'est que les 173 points orphelins (chronopost: 5, shop2shop: 6, mondial_relay: 162) ont `query_id = NULL` — ils ont été insérés avant qu'on tracke la `query_id` et ne sont rattachés à aucune query, donc rien à cascader.
- `latest_pickup_points` est une vue qui filtre les points de la dernière query "success" par provider. C'est notre définition d'"actifs".

## 1. Dashboard — affichage

**Cartes provider** (`getDashboardOverview` + UI) :

- Remplacer `total_points` (compte brut sur `pickup_points`) par un compte sur `latest_pickup_points` filtré par provider → `active_points`.
- Supprimer la ligne "Statut" et le champ `last_query_status` du DTO/UI.
- Garder : date du dernier refresh, points du dernier refresh, total points actifs.

**Table des queries** (`getProviderQueries` + UI) :

- Retirer les colonnes "Raw" et "Insérés".
- Ajouter une colonne "Sans horaires" = nombre de points de la query dont `opening_hours = '{}'::jsonb` (ou hours_fetched_at NULL — on retient `opening_hours` vide car c'est ce que l'UI montre).
- Garder : Date, Statut, CP, Points actuels (rattachés à cette query), Sans horaires, Erreur, Supprimer.
- Calcul : étendre le `GROUP BY query_id` actuel pour ramener aussi le count avec `opening_hours = '{}'`.

**Sous-table des points d'une query** :

- Colonne "Horaires" : pastille verte (`opening_hours_json !== "{}"`) ou rouge sinon — remplace la date `hours_fetched_at`. Utiliser un point coloré + icône check/x lucide.

## 2. Mécanique — cleanup

Nouveau server fn `cleanupOrphans()` dans `src/lib/dashboard.functions.ts` :

- Supprime les `pickup_points` où `query_id IS NULL` OU dont le `query_id` ne référence plus aucune query (defensive, même si la FK l'empêche).
- Les enrichments associés tombent en cascade. Supprime aussi les enrichments avec `point_id IS NULL` ou pointant dans le vide.
- Renvoie `{ deleted_points, deleted_enrichments }`.

**UI** : bouton "Nettoyer les orphelins" dans le header du dashboard, avec `AlertDialog` de confirmation et toast résultat. Invalide `dashboard-overview` et les listes de queries.

**Exécution one-shot** : lancer un `DELETE FROM pickup_points WHERE query_id IS NULL` via outil migration/insert pour purger immédiatement les 173 points actuels (les enrichments tombent en cascade).

## Détails techniques

- `getDashboardOverview` : remplacer le `head:true count exact` sur `pickup_points` par un count sur `latest_pickup_points` filtré `provider_id`. Retirer `last_query_status`.
- `getProviderQueries` : faire deux passes sur `pickup_points` par les `query_id` listés — une pour le count total, une pour le count `opening_hours = '{}'`. Comme PostgREST ne fait pas `jsonb='{}'` facilement, faire une `select query_id, opening_hours` et agréger côté JS (volume limité aux ~500 dernières queries × ~50 points moyens, OK pour KISS).
- `dashboard.tsx` : retirer la colonne Raw/Insérés, ajouter "Sans horaires", remplacer la cellule horaires du sous-tableau par un badge vert/rouge, retirer la ligne statut des cartes, ajouter le bouton cleanup.

## Hors scope

- Pas de changement à `latest_pickup_points`, `PickupMap`, `/refresh`, `/refresh-vinted`, `/api/public/hooks/enrich-vinted-go`.
- Pas de pagination/virtualisation.
- Pas d'auth sur `/dashboard` ni sur le cleanup (suit le pattern actuel).