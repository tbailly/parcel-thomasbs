## Découverte

En inspectant la page `ounoustrouver.html` dans le navigateur, j'ai capturé un endpoint **JSON public, non authentifié** qu'utilise le front Chronopost :

```
GET https://www.chronopost.fr/expeditionAvancee/stubpointsearch.json
    ?lat={lat}&lon={lng}&z={zip}&c={CITY}&a=&p=FR&lang=null&_={ts}
```

Testé en curl depuis la sandbox avec un UA Firefox + `Referer` : **HTTP 200, ~83 KB**. Réponse :

- `olgiPointList[]` : **30 points** max, triés par distance (rayon ~9 km autour du `lat/lon`).
- Chaque point contient : `identifier` (code unique ex `7747X`), `name`, `address`, `zipcode`, `city`, `latitude`, `longitude`, `type` (`P` = consigne/relais, `B` = bureau de poste, `A` = agence), `distanceInMeters`, et **`listopeninghours`** (tableau `{day: 1..7, openinghours: "08:00-12:00 12:00-22:00"}` — 1=Lundi … 7=Dimanche).

**→ Pas d'étape d'enrichissement nécessaire** (contrairement à Vinted Go) : la liste contient déjà les horaires.

J'ai aussi vu le WSDL SOAP officiel `recherchebt-ws-cxf/PointRelaisServiceWS` — il exige un `accountNumber`/`password` Chronopost (testé : `errorCode=1500 invalid account`). On reste donc sur l'endpoint JSON public.

## Stratégie de couverture

- 1 fetch = 30 points autour d'un `(lat, lng)`, rayon ~9 km.
- On a la table `home_addresses` avec `lat/lng/postal_code`.
- 1 requête par adresse maison, jitter 1-3 s entre les appels (poli + évite le rate-limit Cloudflare).
- Dédup par `identifier` (devient `external_id = cp-{identifier}`).
- Upsert sur `(provider_id, external_id)` exactement comme Vinted Go → relance idempotente.

Pour le premier test, on fetch toutes les adresses maison existantes et on observe le total après dédup. Si on veut élargir plus tard (ex. couvrir un département complet), on pourra générer des points de grille type Vinted Go, mais ce n'est pas nécessaire pour démarrer.

## Fichiers à créer

### 1. `src/lib/chronopost.functions.ts`

Server functions :

- `refreshChronopost()` — `createServerFn` POST :
  1. Crée une ligne `queries` (`provider_id='chronopost'`, `status='running'`).
  2. Lit `home_addresses` (lat/lng/postal_code/name) — early-exit en `error` si vide.
  3. Pour chaque home : `fetch(stubpointsearch.json?...)` avec UA Firefox + Referer + `X-Requested-With: XMLHttpRequest`. Jitter 1-3 s entre.
  4. Parse `olgiPointList`, filtre les points sans `latitude/longitude` valides, dédup par `identifier`.
  5. Mappe en `pickup_points` : `external_id = "cp-"+identifier`, `opening_hours` = conversion `listopeninghours` → `{mon:[{open,close},…], …}` (split sur espace pour les multi-créneaux, ignore les `null`/`fermé`), `notes` = `"Type: P|B|A"` (libellé humain).
  6. **Upsert** `onConflict: 'provider_id,external_id'`.
  7. Met à jour la ligne `queries` (`raw_count`, `inserted_count`, status, `finished_at`, `error` = mini-rapport par adresse `"75009: raw=30"` joint en `||`).

- `getChronopostStats()` — `createServerFn` GET : retourne la dernière query Chronopost (date, raw_count, inserted_count, status, error) + le count total de points actuellement en DB.

### 2. `src/routes/refresh-chronopost.tsx`

Page minimaliste (pattern Vinted Go simplifié — pas d'enrichissement, pas de progress bar) :

- Header + description courte ("Une requête par adresse maison, ~30 points par requête, horaires incluses").
- Bouton "Rafraîchir Chronopost" (couleur `#00925A` du logo). Disabled pendant le run.
- Carte stats : dernier run (status badge, raw_count, inserted_count, durée, erreurs si présentes).
- Liste des 10 dernières `queries` Chronopost en table.

### 3. Routing

`src/routeTree.gen.ts` est auto-régénéré par le plugin Vite — pas à toucher.

## Hors scope pour ce premier test

- Pas de cron automatique : on déclenche à la main pour valider d'abord.
- Pas de grille géographique pour couvrir des zones plus larges que les home_addresses.
- Pas de filtre par type (on garde P + B + A pour l'instant — on verra à l'usage si on veut restreindre).
- Pas d'enrichissement séparé (inutile).
- Pas de modif du provider row `chronopost` en DB (déjà présent).

## Comment tester ensemble

1. J'implémente.
2. Tu vas sur `/refresh-chronopost`, clic sur le bouton.
3. On regarde le résultat (raw_count, inserted_count, sample en notes).
4. On vérifie sur la carte principale `/` que les points Chronopost apparaissent avec leurs horaires lisibles dans le popup.

## Questions avant d'implémenter

- **Filtrage des types** : on garde P (consigne/relais) **et** B (bureau de poste) **et** A (agence Chronopost), ou tu veux qu'on filtre dès maintenant à P uniquement ?
- **Cron** : on attend que le test manuel soit OK avant d'ajouter un cron (recommandé), ou tu veux que je le planifie aussi tout de suite (ex. tous les 7 jours) ?
