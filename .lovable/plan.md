# Mondial Relay — diagnostic actuel et plan de correction

## Ce qui bouge dans les derniers logs

### 1. Le server function s'exécute bien, mais la source Mondial Relay reste bloquée
- La requête `POST /_serverFn/...scrapeMondialRelay...` répond **200 côté app**.
- Le diagnostic renvoyé par la fonction montre toutefois :
  - `httpStatus: 401`
  - `firecrawlError: null`
  - `bodyBytes: 2081`
  - `bodyPreview: <html xmlns="http://www.w3.org/1999/xhtml">...`
  - `rawCount: 0`
  - `mappedCount: 0`
  - `inserted: 0`
- Conclusion : **le code applicatif ne plante pas**, mais Firecrawl reçoit encore une **page de blocage HTML/XML** à la place du JSON Mondial Relay.

### 2. L'ajout des headers navigateur n'a pas suffi
- Les headers `User-Agent`, `Accept`, `Accept-Language` et `Referer` sont bien présents dans `src/lib/mondial-relay.functions.ts`.
- Malgré ça, la réponse reste `401` avec un body HTML.
- Conclusion : **le blocage n'est pas un problème de parsing ni de credentials**, mais très probablement un filtrage anti-bot/WAF toujours actif sur l'endpoint `/api/parcelshop`.

### 3. Les points visibles sur la carte restent des données de démo
- Les requêtes `getMapData` renvoient encore des entrées `Fake - ...`.
- C'est cohérent avec `inserted: 0` sur l'import Mondial Relay : rien de nouveau n'est inséré, donc la carte continue d'afficher le dataset existant.

### 4. Il y a aussi un problème séparé côté carte SSR
- Les logs Vite montrent `ReferenceError: window is not defined` provenant de `leaflet` dans `src/components/PickupMap.tsx`.
- Cause probable : `leaflet` est importé au niveau module alors que le rendu serveur essaie aussi de charger le composant.
- Ce bug n'explique pas le `401` Mondial Relay, mais il faut le corriger pour fiabiliser la page.

### 5. Le bruit `ClientScrapeButton.tsx` est historique
- Les logs Vite montrent aussi une ancienne erreur d'import sur `ClientScrapeButton.tsx` supprimé.
- Le fichier `src/routes/index.tsx` ne l'importe plus, donc **ce n'est plus le blocage principal**.

## Plan de correction

### Étape 1 — Abandonner l'appel direct à `/api/parcelshop`
Ne plus considérer l'endpoint JSON Mondial Relay comme source primaire, car il reste bloqué même via Firecrawl avec headers navigateur.

### Étape 2 — Basculer vers la page publique Mondial Relay
Remplacer la stratégie de scraping par un scrape de la page publique :

`https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/?codePostal=75001&pays=FR`

Approche :
- utiliser Firecrawl sur cette URL publique ;
- récupérer `rawHtml` et/ou `html` avec `waitFor` ;
- parser le DOM rendu pour extraire les cartes/listes de points relais ;
- mapper ce résultat vers le format `pickup_points` existant.

### Étape 3 — Renforcer le diagnostic du scrape
Faire évoluer le retour de `scrapeMondialRelay` pour distinguer clairement :
- `sourceType: "api" | "public-page"`
- `httpStatus`
- `contentType` détecté
- `blocked: boolean`
- `selectorHits` ou nombre de cartes HTML trouvées
- `sampleExtracted` avant insertion DB

Objectif : savoir immédiatement si on a reçu du HTML utile ou encore une page de blocage.

### Étape 4 — Corriger le bug Leaflet côté SSR
Rendre `PickupMap` strictement client-only :
- soit en déplaçant les imports `leaflet` dans un chargement côté client ;
- soit en isolant la carte dans un module client qui ne s'exécute pas au rendu serveur.

Objectif : supprimer les `window is not defined` et éviter que le debug scrape soit pollué par un deuxième problème.

### Étape 5 — Valider avec un vrai cycle de test
Après correction :
1. cliquer sur le bouton d'import ;
2. vérifier que le diagnostic montre soit des cartes HTML trouvées, soit des points extraits ;
3. vérifier `mappedCount > 0` et `inserted > 0` ;
4. recharger les données carte ;
5. confirmer que les points Mondial Relay réels remplacent les entrées `Fake - ...`.

## Hors scope immédiat
- généralisation à tous les codes postaux ;
- ajout d'autres sources transporteurs ;
- refonte UI de la carte.

## Décision recommandée
Le prochain correctif doit viser **le scraping de la page publique Mondial Relay**, pas l'endpoint `/api/parcelshop`, puis **corriger Leaflet en SSR** pour stabiliser l'écran.
