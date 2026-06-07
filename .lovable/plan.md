## Contexte

Le pin actuel est une goutte d'eau (teardrop) avec un disque blanc contenant le logo du provider, ancré par sa pointe sur la coordonnée. Tu veux passer à :
- **Forme** : losange (diamond) travaillé, pas une simple rotation de carré
- **Centre** : le pin est centré sur la coordonnée (plus de pointe vers le bas)
- **Esthétique** : futuriste, contour glowy, touche légère de couleur provider

## Stratégie

Je vais implémenter **3 variantes en parallèle**, sélectionnables via un sélecteur discret (segmented control) en haut à gauche de la carte, pour qu'on puisse comparer en live sur le vrai dataset avant de figer un style. Chaque variante est un SVG `L.divIcon`, ancré au centre (`iconAnchor: [size/2, size/2]`), avec le glow rendu via `<filter>` SVG (pas CSS, pour rester net dans les clusters Leaflet).

### Variante A — « Holo Diamond »
- Losange à 4 facettes (faces gauche/droite avec dégradés clair→sombre) pour effet 3D taillé
- Contour 1.5px en `provider.color` + halo externe (filter `feGaussianBlur` r=3) de la même couleur à 60% opacité
- Cœur : disque blanc cassé `#f8fafc` contenant le logo
- Mini chevrons aux 4 pointes pour le côté HUD/sci-fi
- Touche couleur : facettes teintées à 8-12% de `provider.color`

### Variante B — « Neon Crystal »
- Losange creux (juste le contour 2px) en `provider.color` saturé
- Double halo : un interne diffus (couleur provider, 40%) + un externe (blanc, 60%) → effet néon
- Cœur logo en disque sombre `#0f172a` translucide (85%) avec le logo en blanc/contour
- Hyper lisible sur fond beige clair, très "futuriste minimal"
- Touche couleur : forte sur le contour, neutre partout ailleurs

### Variante C — « Glass Prism »
- Losange en glassmorphism : fond `rgba(255,255,255,0.55)` + `backdrop-filter` (via filter SVG approximé) + bordure 1px blanche
- Reflet diagonal (gradient `white→transparent` à 45°) sur la moitié haute
- Liseré fin (1px) `provider.color` autour du losange
- Petite pastille circulaire en bas-droite avec la couleur provider pure (genre LED de statut)
- Logo centré sur fond transparent → on voit la carte derrière en filigrane

## Détails techniques

- **Taille** : 40×40 px (vs 40×52 actuel). Anchor `[20, 20]`, popup anchor `[0, -22]`.
- **Glow** : `<filter id="glow-X"><feGaussianBlur stdDeviation="2.5"/><feMerge>…</feMerge></filter>` dans chaque SVG. ID suffixé par `provider.id` + variant pour éviter les collisions DOM dans le cluster.
- **Sélecteur de style** : petit overlay flottant `absolute left-3 top-3` (3 boutons A/B/C), state local dans `PickupMap`. Passé à `makeIcon(provider, variant)`. Persistance via `localStorage` pour qu'on garde la sélection entre reloads pendant l'itération.
- **Marqueur central** (adresse maison) : on garde le `circleMarker` actuel, indépendant.

## Fichiers touchés

- `src/components/PickupMap.tsx` :
  - `makeIcon(provider, variant)` avec switch sur 3 builders SVG (`buildHoloDiamond`, `buildNeonCrystal`, `buildGlassPrism`)
  - Ajout state `variant`, overlay sélecteur, dépendance dans le `useEffect` qui repeuple le cluster
- **Aucune** modif backend, tuiles, ou schéma.

## Comment on itère après ce premier jet

Tu testes les 3 sur la carte réelle. Tu me dis laquelle tu préfères (ou laquelle hybrider). Je supprime le sélecteur et je garde la finale, ou j'ajuste (taille du glow, intensité couleur, épaisseur contour, etc.).

## Question

Tu veux qu'on garde le logo du provider visible au centre dans toutes les variantes (comme aujourd'hui), ou tu préfères qu'au moins une variante remplace le logo par juste une initiale / un point coloré pour un rendu encore plus "abstrait futuriste" ?
