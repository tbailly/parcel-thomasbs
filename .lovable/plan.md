
## Objectif

1. Charger TOUTES les `home_addresses` (plus uniquement la 1re) et scraper Mondial Relay une fois par code postal.
2. Sur chaque page MR, cliquer 5 fois sur « Afficher plus de résultats » via Firecrawl `actions` avant l'extraction JSON, pour ramener ~50-80 points au lieu de ~15.
3. Fusionner tous les points de tous les CP dans **une seule** ligne `queries` (= un run), en dédoublonnant.

## 1. `scrapeMondialRelay` (src/lib/mondial-relay.functions.ts)

### Chargement des adresses
- Remplacer `.limit(1).maybeSingle()` par un `select` sans limite, ordonné `position asc, created_at asc`.
- Si la liste est vide → ligne `queries` `status='error'`, `error='no home address configured'`, stop. (comportement actuel conservé.)

### Une seule ligne `queries` par run
- Créer 1 ligne `queries` au début (status `success` provisoire, `home_address_id = NULL`, `postal_code = NULL` car multi-CP, `started_at = now`).
- Récupérer `queryId`.
- Stocker la liste des CP scrapés dans `error` ? Non — plutôt laisser `postal_code` à `NULL` et lister les CP dans le diagnostic de retour uniquement. Pas de changement de schéma.

### Boucle sur les adresses
Pour chaque `home`:
1. Construire l'URL `?codePostal=${home.postal_code}&pays=${home.country}`.
2. Appel Firecrawl `scrape` avec :
   - `actions`: 5 fois `{ type: 'click', selector: '<sélecteur du bouton Afficher plus>' }` entrecoupés de `{ type: 'wait', milliseconds: 1500 }`. À défaut de sélecteur connu, on utilise `{ type: 'click', selector: 'button:has-text("Afficher plus")' }` ou un sélecteur CSS proche (à confirmer au runtime via le diagnostic).
   - `waitFor: 3000` avant les actions, prompt JSON inchangé.
3. Parser, mapper avec `query_id = queryId`.

### Dédoublonnage
- Clé de dédoublonnage : `external_id` quand non vide, sinon `${round(lat,5)}|${round(lng,5)}`.
- Map JS `Map<string, MappedPoint>` partagée entre les CP — premier vu gagne.
- Compteurs : `rawPointCount` (somme brute tous CP), `insertedCount` (après dédoublonnage et insert).

### Insert + mise à jour de queries
- Un seul `insert(mapped[], { count: 'exact' })` à la fin.
- Update `queries` avec `raw_count`, `inserted_count`, `status`, `error` (concat des erreurs Firecrawl par CP si besoin), `finished_at`.

### Diagnostic enrichi
Retour : `queryId`, `addresses: [{ name, postal_code, rawCount, error? }]`, `totalRaw`, `totalUnique`, `insertedCount`, `sampleExtracted` (3 premiers), `dbError`.

## 2. Hors scope

- Pas de changement de schéma DB.
- Pas de purge.
- Pas de CRUD adresses en UI (tu ajoutes la 2e à la main via SQL comme la 1re).
- `src/lib/pickup-points.functions.ts` et `src/routes/index.tsx` inchangés.

## Points à valider

- **Sélecteur du bouton « Afficher plus »** : je ne le connais pas avec certitude. Deux approches possibles :
  - (a) Tenter un sélecteur générique `button:has-text("Afficher plus de résultats")` (syntaxe Playwright, supportée par Firecrawl).
  - (b) Si ça ne marche pas, fallback `scroll` (Firecrawl `actions` supporte aussi `{ type: 'scroll', direction: 'down' }`) qui peut déclencher un load infinite.
  Je pars sur (a) en premier, et on ajustera selon le diagnostic du 1er run.
- Si 5 clics échouent silencieusement, on aura quand même les ~15 points de base — pas de régression.

## Risque

- Temps d'exécution : ~5 clics × 1.5 s × N adresses = ~7.5 s par CP en plus du scrape de base. Pour 2 CP, run total ~25-40 s. Acceptable côté server fn.
