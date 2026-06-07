
# Plan : Vinted Go complet — liste + horaires en arrière-plan lent

## Contraintes & choix d'archi

- Cloudflare Workers : limite de temps d'exécution par requête (~30s CPU + waitUntil court). **Impossible de garder un job de 2h vivant dans une seule fn.**
- Solution propre : **pg_cron** lance une petite tâche toutes les N minutes ; chaque tâche traite un **petit batch** (ex. 3–5 points) avec jitter aléatoire entre chaque appel.
- Avantages : reprise auto si crash, débit contrôlé, observable via la table `queries` + nouvelle table `enrichments`.

Pour ne pas se faire ban : User-Agent réaliste, pause aléatoire 2–5s entre les appels HTTP, batch petit, 1 seul cron qui tourne en série (pas de parallélisme).

## Phase 1 — Liste avec tiling (toutes les bbox d'un coup, c'est cheap)

Promote `scrapeVintedGoDebug` en version "production" :

1. **Génération des bboxes** : à partir de `home_addresses`, construire une bbox carrée autour de chaque adresse (côté = ~3km, configurable). Si plusieurs adresses se chevauchent → union triviale en grille. Concrètement, on découpe la zone d'intérêt en tuiles ~3km × 3km (au-delà, Vinted tronque la réponse).
2. **Pour chaque tuile** : fetch GET RSC séquentiel avec pause aléatoire 1–3s. Dédup par `id` Vinted.
3. **Upsert** dans `pickup_points` (au lieu d'`insert`) sur la clé `(provider_id, external_id)` pour permettre la mise à jour des horaires plus tard sans dupliquer.
   - Schema : ajouter une **contrainte unique** `(provider_id, external_id)` si elle n'existe pas, et une colonne `hours_fetched_at timestamptz NULL` pour traquer l'enrichissement.
4. **Statut** dans `queries` comme aujourd'hui.

UI : bouton "Rafraîchir la liste Vinted Go" sur `/refresh-vinted` qui lance cette phase (synchrone — la liste prend ~30s pour 20 tuiles).

## Phase 2 — Enrichissement des horaires (cron lent)

### Stratégie d'appel par point

D'abord essayer **GET RSC** avec `selected_point=<id>` (même mécanique que la liste, plus stable car pas de `Next-Action` hash). La page de détail rend les `business_hours` dans le payload RSC — on parse pareil.

Si ça ne contient pas les horaires → fallback **POST Server Action** (header `Next-Action` stocké en config DB pour pouvoir le mettre à jour quand Vinted redéploie).

### Endpoint public cron

Nouveau fichier `src/routes/api/public/hooks/enrich-vinted-go.ts` :

- Auth : `apikey` header = anon key (pattern standard pg_cron).
- Logique :
  1. Sélectionner jusqu'à **5 points** Vinted Go avec `hours_fetched_at IS NULL` (ou `< NOW() - 30 days` plus tard pour re-fetch), ordre `created_at ASC`.
  2. Pour chaque point : pause aléatoire 2–5s, fetch GET RSC, parser `business_hours`, mapper vers le format `OpeningHours` du projet (`mon`/`tue`/...), update `pickup_points.opening_hours` + `hours_fetched_at = now()`.
  3. Si erreur sur un point : logger dans une nouvelle table `enrichments(id, point_id, provider_id, status, error, created_at)` et passer au suivant ; ne pas bloquer le batch.
  4. Retourner `{processed, succeeded, failed, remaining}`.

### Cron

`pg_cron` toutes les **2 minutes** appelle cet endpoint. 5 points × 30 tics/h = 150 points/h, soit ~1000 points en ~7h. Si l'utilisateur veut plus rapide, on monte le batch (mais on garde la cadence 2 min pour le jitter inter-batch).

### UI sur `/refresh-vinted`

- Bouton "Rafraîchir la liste".
- Stats live (via server fn read-only) : nombre total de points Vinted Go, nombre enrichis, nombre en attente, dernier enrichissement réussi, dernier échec.
- Bouton "Enrichir 5 points maintenant" (déclenche manuellement le même handler que le cron) pour tester.
- Bouton "Pause cron" / "Reprendre cron" : `cron.unschedule` / `cron.schedule` via une server fn admin.

## Schéma DB (changements)

Migration unique :
- `ALTER TABLE pickup_points ADD COLUMN hours_fetched_at timestamptz NULL`.
- `CREATE UNIQUE INDEX pickup_points_provider_extid_uq ON pickup_points(provider_id, external_id)` (avec gestion des doublons existants : supprimer d'abord les dupes si besoin).
- `CREATE TABLE public.enrichments` (id uuid pk, point_id uuid, provider_id text, status text, error text, created_at timestamptz default now()) + GRANTs + RLS public-read.
- Activer `pg_cron` + `pg_net` si pas déjà fait.

Le cron sera planifié via le tool `supabase--insert` (pas une migration, car contient l'anon key).

## Préoccupations ban / robustesse

- Ordre séquentiel strict, jamais parallèle.
- Pause aléatoire 2–5s entre chaque requête (liste **et** détail).
- Petit batch (5) par tic.
- User-Agent Firefox stable + headers `RSC: 1` + `Accept-Language: fr` comme dans le HAR.
- Si on prend un 429/403 : logger l'erreur, marquer `hours_fetched_at` non, **ne pas retry tout de suite** (le prochain tic réessaiera dans 2 min, ce qui donne un back-off naturel).
- Pas d'IP rotation (overkill pour ce volume).

## Hors scope explicite

- Pas de re-scrape périodique de la liste pour le moment (on lance manuellement). À ajouter plus tard si besoin.
- Pas de logique pour les fermetures temporaires (`closure_periods`).
- Pas de purge des anciens points qui auraient disparu de Vinted (on les laisse en base, à voir plus tard).
- Pas de touche à Mondial Relay / `/refresh`.

## Fichiers touchés

- migration SQL (colonne + index unique + table `enrichments` + extensions)
- `src/lib/vinted-go.functions.ts` : ajouter `refreshVintedGoList` (tiling + upsert), `getVintedGoStats`, `enrichVintedGoBatch` (logique partagée avec le cron)
- `src/routes/api/public/hooks/enrich-vinted-go.ts` : nouveau, appelle `enrichVintedGoBatch`
- `src/routes/refresh-vinted.tsx` : refonte UI avec stats + boutons
- Insertion via `supabase--insert` du `cron.schedule(...)` (`*/2 * * * *`)
