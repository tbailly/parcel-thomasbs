# Plan — Régler "Extension in Public"

## Diagnostic

Une seule extension est installée dans `public` : **`pg_net`** (les autres sont déjà dans `extensions`, `vault` ou `pg_catalog`). C'est cette extension qui déclenche le warning du linter Supabase.

Aucun code applicatif n'utilise actuellement `pg_net` (aucune référence à `net.http_*` dans `src/` ni dans les migrations existantes). Le déplacement est donc sans risque pour le runtime.

## Pourquoi c'est un problème

Mettre des extensions dans `public` pollue le namespace applicatif : conflits possibles de noms de fonctions/types, et exposition involontaire via le Data API. La recommandation Supabase est de les isoler dans un schéma dédié `extensions` (déjà présent dans le projet et déjà utilisé pour `pgcrypto`, `uuid-ossp`, `pg_stat_statements`).

## Action

Une seule migration SQL :

```sql
ALTER EXTENSION pg_net SET SCHEMA extensions;
```

C'est tout. Pas de changement de code applicatif puisque `pg_net` n'est pas appelé.

## Vérification après migration

- Le linter Supabase ne doit plus remonter `SUPA_extension_in_public`.
- `SELECT extname, extnamespace::regnamespace FROM pg_extension;` doit montrer `pg_net | extensions`.

## Risques

Aucun identifié : pas d'appel `net.http_*` dans le code ni dans les triggers/fonctions DB (la liste `db-functions` et `db-triggers` est vide). Si plus tard tu utilises `pg_net`, il faudra préfixer par `extensions.http_post(...)` ou ajouter `extensions` au `search_path`.
