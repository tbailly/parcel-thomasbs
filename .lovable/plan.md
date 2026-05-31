## Hypothèse à tester

Le run "changé extraction en Json" (169 points) utilisait un appel Firecrawl **sans `actions`** — juste `scrape(url, { formats: [{ type: "json", prompt, schema }], onlyMainContent: false, waitFor: 3000, location })`. Aucune tentative de clic "Afficher plus".

La version actuelle a ajouté des `actions` (`executeJavascript` × 5 pour cliquer sur "Afficher plus"). Quand ces actions échouent côté Firecrawl, **tout le scrape est abandonné** — c'est ce qu'on voit dans les `queries` récentes (`err=Action(s) failed to complete ... ActionError: Element not found`).

Donc avant d'instrumenter quoi que ce soit, je veux **rejouer la requête originale telle quelle**, mais avec `93400` au lieu de `75001`, pour répondre à une question simple :

- Est-ce que le 93400, sans clic "Afficher plus", donne ~13 points (limite réelle MR à cet endroit) ou ~150+ (alors le coupable c'est uniquement nos `actions`) ?

## Étapes

1. **Mode debug "scrape simple"**
   - Ajouter dans la server fn une variante (paramètre `mode: "simple-93400"` ou flag) qui :
     - n'utilise **aucune** `actions`,
     - force le code postal `93400` (pays `FR`),
     - garde exactement le même `prompt`, `schema`, `formats: [{ type: "json", ... }]`, `waitFor: 3000`, `onlyMainContent: false`, `location: { country: "FR", languages: ["fr-FR","fr"] }` qu'au run "changé extraction en Json".
   - Cette variante reste **synchrone** dans la server fn (pas de `backgroundTask`) pour qu'on récupère le résultat directement et qu'on ne reste pas bloqué en `running`.

2. **Sécuriser la fin de job dans tous les cas**
   - Même hors mode debug, si `runScrapeJob` lance ou plante, la ligne `queries` doit toujours finir en `success` ou `error` (try/catch global + `finally` update).
   - Évite les `running` éternels comme `87ae1dfb-...`.

3. **Diagnostic retourné**
   - `rawCount`, `insertedCount`, échantillon des 3 premiers points, erreur Firecrawl brute si présente.
   - Un bouton temporaire "Test 93400 simple" sur la page pour déclencher ce mode et voir le résultat à l'écran.

4. **Décision après le test**
   - Si on obtient >>13 points sur 93400 : on supprime définitivement les `actions` (et on cherche un autre levier pour élargir si nécessaire — search radius dans le prompt, multi-CP autour).
   - Si on obtient ~13 points : la limite vient réellement de la page MR pour ce CP, et il faudra une autre stratégie (zone élargie, plusieurs CP voisins).

## Hors scope

- Pas de refonte des `actions`, pas de polling client, pas de changement de schéma DB.
- Le mode multi-adresses / dédoublonnage existant reste tel quel pour le run normal.
- Le bouton temporaire sera retiré ensuite.