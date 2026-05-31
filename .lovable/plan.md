# Migration Mondial Relay → Firecrawl

## Objectif
Remplacer le `fetch` direct (bloqué par Cloudflare depuis le Worker) par un appel Firecrawl qui résout le challenge et retourne le JSON brut de l'endpoint `/api/parcelshop`. La logique de parsing / mapping / insertion DB reste identique.

## Étapes

### 1. Connecter Firecrawl
- Lancer `standard_connectors--connect` avec `connector_id: firecrawl` pour brancher le connecteur (plan gratuit Firecrawl = 500 scrapes/mois, largement suffisant).
- Vérifier que `FIRECRAWL_API_KEY` est bien dispo côté serveur via `fetch_secrets`.

### 2. Installer le SDK
- `bun add @mendable/firecrawl-js`

### 3. Réécrire `src/lib/mondial-relay.functions.ts`
Garder la même signature de server function (`scrapeMondialRelay`), même input (`postalCode`, `country`), même retour (diagnostic + sample). Seul le bloc `fetch(...)` est remplacé.

Remplacement :
```ts
import Firecrawl from "@mendable/firecrawl-js";

const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });
const result = await firecrawl.scrape(url, {
  formats: ["rawHtml"],   // l'endpoint renvoie du JSON pur, on récupère le body brut
  onlyMainContent: false,
});
// Firecrawl renvoie le contenu dans result.rawHtml (ou result.html)
// Pour un endpoint JSON, le body est directement dans rawHtml en string
bodyText = result.rawHtml ?? result.html ?? "";
status = result.metadata?.statusCode ?? 200;
```

Conserver :
- `ResponseSchema` Zod et toute la logique `buildHours` / `buildNotes` / mapping
- Le DELETE + INSERT en DB sur `provider_id = "mondial_relay"`
- Le retour de diagnostic (httpStatus, bodyPreview, rawCount, mappedCount, inserted, samplePoints)

Ajouter au diagnostic :
- `firecrawlError: string | null` si l'appel SDK throw
- Retirer `cloudflareBlocked` (plus pertinent) ou le garder mais toujours `false`

### 4. Nettoyage UI
- Supprimer `src/components/ClientScrapeButton.tsx` (test obsolète, CORS confirmé bloquant)
- Retirer son import et son usage dans `src/routes/index.tsx`
- Renommer le bouton restant en **"Importer Mondial Relay (75001) via Firecrawl"**

### 5. Validation
1. Cliquer le bouton → s'attendre à `httpStatus: 200`, `rawCount > 0`, `inserted > 0`.
2. Recharger la carte → les points 75001 doivent apparaître.
3. Vérifier dans le panneau JSON qu'il n'y a pas de `firecrawlError` ni `parseError`.

## Hors scope
- Pas de changement du schéma DB.
- Pas d'extension aux autres codes postaux (on garde 75001 pour le test, on généralisera après validation).
- Pas de gestion de credits Firecrawl (le plan gratuit suffit pour quelques scrapes/mois).

## Détails techniques

**Pourquoi `rawHtml` et pas `json` ou `markdown`** : l'URL cible est un endpoint API qui renvoie du JSON, pas une page HTML. Firecrawl récupère le corps brut de la réponse ; on le passe ensuite à `JSON.parse` comme avant. Le format `markdown` essaierait de convertir, le format `json` (extraction LLM) est inutile et coûteux ici.

**Coût** : 1 scrape Firecrawl = 1 credit. Le plan gratuit donne 500 credits/mois, soit ~16 scrapes/jour. Largement au-dessus du besoin "quelques scrapes/mois".
