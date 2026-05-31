## Objectif
Tester depuis le navigateur de l'utilisateur (sans server function) si on peut appeler directement `https://www.mondialrelay.fr/api/parcelshop?...` pour récupérer les points relais. But : valider/invalider l'hypothèse "fetch côté client = ça passe" avant de basculer sur Firecrawl.

## Pourquoi on s'attend à un échec (mais on veut le voir)
- Le navigateur de l'utilisateur résout naturellement le challenge Cloudflare et envoie le cookie `cf_clearance` → cette partie devrait passer.
- **MAIS** l'endpoint `/api/parcelshop` ne renvoie quasi-certainement pas `Access-Control-Allow-Origin: *` → le navigateur va bloquer la réponse par CORS, **avant** même de te la livrer.
- Si CORS bloque, on aura le message exact dans la console et un panneau d'erreur clair dans l'UI → on saura à 100 % qu'il faut passer par Firecrawl.

## Étapes

### 1. Nouveau composant `src/components/ClientScrapeButton.tsx`
Composant client autonome qui contient :
- Un bouton **"Tester fetch direct (navigateur)"**
- `useState` pour `loading`, `result`, `error`, `corsBlocked`, `rawResponse`
- Au clic :
  - construire l'URL `https://www.mondialrelay.fr/api/parcelshop?country=FR&postcode=75001&city=&services=&excludeSat=false&naturesAllowed=1,A,E,F,D,J,T,S,C`
  - `fetch(url, { method: "GET", headers: { Accept: "application/json" }, mode: "cors", credentials: "omit" })`
  - try/catch : si exception → message + flag `corsBlocked` (le navigateur jette `TypeError: Failed to fetch` typique du blocage CORS)
  - si réponse OK → `res.json()` et affichage du nombre de points + 3 premiers samples
  - logger le statut, les headers visibles (très limités en cross-origin), la taille de la réponse

### 2. Intégrer dans `src/routes/index.tsx`
Ajouter le nouveau bouton **à côté** de celui existant (server function). On garde les deux pour comparer :
- "Tester fetch direct (navigateur)" → CORS attendu
- "Tester import Mondial Relay (75001)" → server function actuelle

Disposer les deux boutons l'un au-dessus de l'autre, même panneau de résultat / erreur.

### 3. Affichage diagnostic enrichi
Quand l'appel échoue, afficher :
- Le message d'erreur exact (`TypeError: Failed to fetch` → on l'interprète comme "CORS")
- Un encart explicatif : "Si tu vois 'Failed to fetch', c'est CORS qui bloque côté navigateur. Vérifie la console (onglet réseau) pour confirmer le statut Cloudflare."

### 4. Aucune écriture en DB
Ce bouton-test **ne touche pas** à la base. Il affiche juste le JSON brut. Pas de DELETE / INSERT pickup_points.

## Validation
1. Cliquer "Tester fetch direct" → observer le résultat.
2. Trois issues possibles :
   - **CORS bloqué** (attendu) → `TypeError: Failed to fetch`, on enchaîne sur Firecrawl.
   - **Cloudflare 403** → on voit le statut, peu probable car le navigateur a déjà ses cookies, mais possible.
   - **Succès** (peu probable mais cool) → on a un tableau JSON, on saura qu'on peut tout faire côté client.
3. Ouvrir l'onglet Réseau du navigateur pour voir la vraie raison (CORS preflight, 403, etc.).

## Hors scope
- Pas de migration Firecrawl dans ce ticket (plan déjà prêt pour après).
- Pas de modif sur la server function existante.
- Pas d'insertion en DB côté client.
