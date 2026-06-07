
# Plan : récupération Vinted Go (expérimental)

## Observations sur l'API Vinted Go (depuis les HAR)

- **Liste des points** : `GET https://vintedgo.com/fr/carrier-locations?region=europe&country=fr&bounds=<urlencoded JSON>&_rsc=<hash>` avec header `RSC: 1` et `Accept: text/x-component`. Réponse `text/x-component` (format RSC Next.js) contenant un payload du type :
  ```
  "points":[{"id":10,"point_type":"locker","name":"Franprix","country_code":"FR","address":"...","city":"...","postal_code":"...","lat":..,"lng":..,"active":true,"operational_status":{...}}, ...]
  ```
  Pas d'`opening_hours` dans cette liste.

- **Détail d'un point** : `POST` Server Action (header `Next-Action`, body `["80"]`). Réponse contient `business_hours: [{day:"monday", open:"08:30", close:"21:45"}, ...]`. Server Actions = fragile (hash qui change à chaque déploiement), on évitera pour la v1.

- **Contrainte clé** : `bounds` est une petite bbox (~quelques km²). Il faut **tiler** pour couvrir une zone.

## Stratégie : appel HTTP direct (pas Firecrawl)

L'endpoint liste est public, JSON-parsable via regex, et bien moins coûteux/lent que Firecrawl. On garde Firecrawl en plan B si jamais Vinted bloque (cf. section "Fallback" ci-dessous).

## Encapsulation expérimentale

Tout le code Vinted vit dans des fichiers dédiés, indépendants de `mondial-relay.functions.ts` et de la route `/refresh`. Aucune modif du flux existant.

- `src/lib/vinted-go.functions.ts` — server functions Vinted (toutes nouvelles, isolées).
- `src/routes/refresh-vinted.tsx` — page bac-à-sable dédiée, accessible via `/refresh-vinted`. Pas de lien depuis `/refresh` pour éviter toute interférence.

## v1 — fonctionnement

### 1. `scrapeVintedGoDebug` (server fn, POST)
Lance un scrape sur **une seule bbox** (Paris centre, ~0.04° × 0.06°, codée en dur dans la fn pour cette première tentative). Objectifs :

1. Créer une ligne dans `queries` (provider_id `vinted_go`, status `running`).
2. Fetcher l'URL RSC avec :
   - headers : `RSC: 1`, `Accept: text/x-component`, `User-Agent` Firefox réaliste, `Accept-Language: fr`.
   - Essayer **sans** `_rsc=` d'abord (souvent optionnel). Si HTTP non-200, retry avec `_rsc=1`.
3. Parser le body texte : trouver `"points":[` puis extraire jusqu'au `]` correspondant via un petit compteur de crochets, puis `JSON.parse`.
4. Mapper vers le schéma `pickup_points` : `external_id = "vg-${id}"`, `name`, `address`, `postal_code`, `city`, `lat`, `lng`, `opening_hours = {}` (vide pour la v1), `notes = operational_status.status` si != "Normal".
5. Insérer en base avec `query_id` et `provider_id = "vinted_go"`.
6. Mettre à jour `queries` (status, raw_count, inserted_count, error = body si parsing échoue, en tronquant).
7. Retourner `{ queryId, httpStatus, rawCount, insertedCount, sample: first 3, error }` pour debug live dans l'UI.

### 2. UI bac-à-sable `/refresh-vinted`
Une seule grosse carte avec :
- Description courte de la stratégie.
- Bouton "Lancer scrape Paris centre (bbox unique)" → appelle `scrapeVintedGoDebug`.
- Affichage brut du résultat (JSON) sous le bouton.

## Préreq DB

Vérifier qu'une ligne `providers` avec `id = 'vinted_go'` existe. Si non, migration courte pour l'insérer (nom, couleur placeholder, logo `vinted-go.svg` déjà présent dans `src/assets/providers/`). Je vérifierai au début de la phase build et n'ajouterai la migration que si nécessaire.

## Fallback (hors scope v1, juste noté)

Si Vinted répond 403/anti-bot sur l'endpoint RSC :
- Plan B : Firecrawl scrape de la même URL `carrier-locations?...&bounds=...` en demandant `formats: ['rawHtml']`, puis re-parse identique.
- Plan C : Firecrawl avec `formats: [{type:'json', prompt:'...'}]`.

On n'écrit rien de tout ça en v1.

## Hors scope v1 explicitement

- Pas de tiling multi-bbox (on testera après que la bbox unique marche).
- Pas de récupération des `business_hours` (le détail nécessite Server Action — on s'en occupera en v2 seulement si la v1 fonctionne).
- Aucune modification de `/refresh`, `mondial-relay.functions.ts`, `PickupMap.tsx`, ni du schéma DB sauf insertion du provider si manquant.

## Fichiers touchés

- créer `src/lib/vinted-go.functions.ts`
- créer `src/routes/refresh-vinted.tsx`
- (peut-être) une migration courte pour insérer le provider `vinted_go`
