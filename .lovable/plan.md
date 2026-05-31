## Constat

Le site public mondialrelay.fr appelle son propre endpoint JSON `https://www.mondialrelay.fr/api/parcelshop?country=FR&postcode=75001&...` qui retourne **300 points** parfaitement structurés. Pas besoin de parser du HTML, ni de Firecrawl, ni de SOAP partenaire. Un simple `fetch` côté serveur avec un User-Agent navigateur passe Cloudflare (à valider en production, fallback Firecrawl si besoin plus tard).

## Ce qu'on change

### 1. `src/lib/mondial-relay.functions.ts` — réécriture

Remplacer le parseur HTML par un appel à l'endpoint JSON officiel.

- Entrée du job : `{ postalCode: string = "75001", country: "FR" }`.
- Appel `GET https://www.mondialrelay.fr/api/parcelshop?country=FR&postcode={cp}&city=&services=&excludeSat=false&naturesAllowed=1,A,E,F,D,J,T,S,C` avec headers :
  - `User-Agent` Chrome réaliste
  - `Accept: application/json, text/plain, */*`
  - `Accept-Language: fr-FR`
  - `Referer: https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/`
- Si status ≠ 200 ou réponse non-JSON → on renvoie quand même le diagnostic (status, preview, `cloudflareBlocked`) sans planter.
- Validation Zod stricte de la réponse (tableau de points avec `Numero`, `Adresse{...}`, `Horaires[]`, `Conges[]`, `CodeNature`).

### 2. Mapping JSON → schéma DB

Pour chaque point :

| Champ DB | Source |
|---|---|
| `provider_id` | `"mondial_relay"` |
| `external_id` | `"mr-" + Numero` |
| `name` | `Adresse.Libelle` |
| `address` | `AdresseLigne1` + (`AdresseLigne2` si non vide) |
| `postal_code` | `Adresse.CodePostal` |
| `city` | `Adresse.Ville` |
| `lat` / `lng` | `Adresse.Latitude` / `Adresse.Longitude` |
| `opening_hours` | `Horaires[]` → JSONB `{mon:[{open,close},...], tue:[...], ...}` (JourSemaine 0=dim → 6=sam, slots AM puis PM si présents, journée fermée si tous les champs absents) |
| `notes` | Composé : type (`Locker` si `CodeNature="C"`, sinon `Point Relais`) + congés actifs futurs au format `Fermé du JJ/MM au JJ/MM` (depuis `Conges[]`) + suffixe `EstPIS` si vrai |

### 3. Insertion DB

Inchangé sur le principe : transaction logique simple via `supabaseAdmin` :
1. `DELETE FROM pickup_points WHERE provider_id='mondial_relay'`
2. `INSERT` par batch unique de tous les points mappés.

### 4. Front (`src/routes/index.tsx`)

Aucun changement structurel — le bouton existant continue d'appeler `scrapeMondialRelay`. Juste renommer le libellé en **"Tester import Mondial Relay (75001)"** et passer `postalCode: "75001"` par défaut (au lieu de 93400) pour matcher la demande "Paris". Le panneau JSON résultat continue d'afficher : `httpStatus`, `parsedCount`, `inserted`, `dbError`, et un échantillon des points.

### 5. Retour du job (JSON affiché dans l'UI)

```ts
{
  startedAt, finishedAt,
  requestedUrl,
  httpStatus, fetchError,
  cloudflareBlocked,           // heuristique sur "Just a moment" / challenge
  rawCount,                    // taille du tableau JSON brut
  mappedCount,                 // points valides après mapping
  inserted, dbError,
  samplePoints: points.slice(0, 5),  // pour ne pas saturer l'UI
}
```

## Hors scope (ce ticket)

- Itération multi-CP pour couvrir 75 + 92 + 93 (on reste sur un seul CP par appel pour le test manuel).
- Branchement pg_cron (à faire dans un ticket dédié quand le mapping est validé).
- Autres providers (Vinted Go, Chronopost, Shop2Shop).
- Renommage du nom de la fonction `scrapeMondialRelay` (pour éviter de toucher à plus de surface).

## Validation post-implémentation

1. Cliquer le bouton sur `/` → loading → JSON affiché.
2. Vérifier `httpStatus = 200`, `cloudflareBlocked = false`, `mappedCount ≈ 300`, `inserted ≈ 300`.
3. Recharger la page : les pins Mondial Relay apparaissent sur la carte aux bonnes positions (75001 et alentours).
4. Ouvrir un popup : nom, adresse, horaires de la journée corrects ; `notes` contient `Locker` ou `Point Relais` (+ congés si applicable).

## Plan de repli si Cloudflare bloque depuis le Worker

Si `httpStatus = 403` ou `cloudflareBlocked = true` en production :
- Option A : passer par Firecrawl (connecteur Lovable) en réutilisant le même endpoint mais à travers leur navigateur headless.
- Option B : déclencher l'import depuis un environnement non-edge (ex. exécution manuelle via `psql` côté toi, ou script local qui POSTe les données).

À décider seulement si on constate effectivement le blocage.
