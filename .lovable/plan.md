# Refresh semi-automatique des providers

## Idée

Pour chaque provider, on stocke en base :
- une URL à ouvrir dans un nouvel onglet,
- un script JavaScript (texte libre) que l'utilisateur collera lui-même dans la console du site ouvert.

Une nouvelle page `/refresh` liste les providers configurés. Un clic sur le bouton du provider :
1. copie le script dans le presse-papiers,
2. ouvre l'URL dans un nouvel onglet.

On commence avec Mondial Relay ; les autres providers viendront s'ajouter au même mécanisme s'ils s'y prêtent.

## Changements

### 1. Base de données (migration)

Ajouter deux colonnes à `public.providers` :
- `refresh_url text` — l'URL à ouvrir.
- `refresh_script text` — le script à copier dans le presse-papiers.

Puis seeder Mondial Relay :
- `refresh_url = 'https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/'`
- `refresh_script = "main() {\n  console.log('TOTO');\n}\nmain();"`

### 2. Server function

`src/lib/refresh.functions.ts` : `getRefreshProviders` (GET, sans auth) → renvoie `[{ id, name, color, refresh_url, refresh_script }]` filtré sur les lignes où `refresh_url` et `refresh_script` sont non nuls. Lecture via `supabaseAdmin`.

### 3. Route `/refresh`

`src/routes/refresh.tsx` :
- `head()` avec title/description dédiés.
- Loader qui pré-charge la liste via TanStack Query (`ensureQueryData`).
- Composant : pour chaque provider, un gros bouton (style `Button` size lg, couleur du provider en accent). Au clic :
  1. `await navigator.clipboard.writeText(provider.refresh_script)`
  2. `window.open(provider.refresh_url, '_blank', 'noopener')`
  3. petit toast / texte de confirmation "Script copié, onglet ouvert".
- Gestion d'erreur clipboard (fallback : afficher le script dans un `<textarea>` sélectionné, demander de copier manuellement).

## Hors scope

- Pas de modification du flow Firecrawl/scrape existant.
- Pas d'ingestion automatique du résultat du script — pour l'instant le script ne fait que `console.log('TOTO')`, on validera la mécanique avant de brancher quoi que ce soit derrière.
- Pas d'auth sur `/refresh` (page interne d'outillage, comme la page `/`).
