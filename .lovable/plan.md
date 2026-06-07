# Carte : agrégats, pins maison, couleurs de marque

## 1. Agrégats — chiffre blanc, pas de disque

Dans `buildClusterDiamond` (`src/components/PickupMap.tsx`) :
- Supprimer le `<circle cx="28" cy="26" r="13" ...>` blanc au centre.
- Garder les dots colorés des providers présents (un par provider, gris profond par défaut sur le contour).
- Recentrer le `<text>` du compte (actuellement à `y="30"`) vers `y="30"` mais en `fill="#ffffff"`, `font-weight="700"`, taille ~15 et avec un léger `text-shadow` via `paint-order:stroke` + `stroke="rgba(0,0,0,0.35)"` `stroke-width="2.5"` pour rester lisible sur n'importe quelle teinte de losange.
- Déplacer la ligne de dots juste sous le chiffre (vers `cy="42"`) pour qu'elle reste visible.

## 2. Pin "Maison" par adresse

Le backend a déjà une table `home_addresses` (2 entrées : "Maison" 93400, "Vibe" 75009) — actuellement on n'affiche qu'un seul `circleMarker` pour `app_config.center_address`.

- Étendre `getMapData` (`src/lib/pickup-points.functions.ts`) pour retourner aussi `homes: { id, name, lat, lng }[]` lu depuis `home_addresses` (ordre `position, created_at`).
- Dans `PickupMap` : remplacer le `circleMarker` unique par une boucle sur `homes`. Chaque pin = `L.divIcon` losange vert (même langage visuel que les pins relais Holo, taille ~44px), avec :
  - couleur verte vive (ex. `#16A34A` — token Tailwind `green-600` adapté au thème beige clair),
  - icône maison SVG (path Lucide `home`) en blanc au centre, plus de logo provider,
  - tooltip avec le `name` de l'adresse.
- Les pins maison vont sur une `L.layerGroup` séparée, ajoutée directement à la carte (hors cluster) pour qu'ils restent toujours visibles et ne soient pas agrégés avec les points relais.

## 3. Couleurs de marque providers

Migration SQL pour mettre à jour `providers.color` avec les hex officiels actuels des chartes (`Chronopost` et `Vinted Go` restent proches — assumé par l'utilisateur) :

| Provider | Actuel | Proposé | Source |
|---|---|---|---|
| Mondial Relay | `#E2001A` | `#E2001A` | inchangé (déjà la rouge officielle de la charte) |
| Chronopost | `#00925A` | `#00A04B` | vert chronopost.com (logo + header actuels) |
| Vinted Go | `#09B1BA` | `#09B1BA` | inchangé (teal Vinted Go) |

Si tu veux des hex différents (par ex. le `#007782` Vinted historique au lieu du teal Vinted Go), dis-le moi avant qu'on lance la migration.

## Fichiers touchés

- `src/components/PickupMap.tsx` — cluster SVG, pin maison, layer homes.
- `src/lib/pickup-points.functions.ts` — ajout `homes` dans `getMapData`.
- `src/routes/index.tsx` — passage de `homes` à `<PickupMap />` si la prop est typée.
- Migration SQL — `UPDATE providers SET color = ... WHERE id IN ('chronopost')`.

## Hors scope

- Pas de changement sur les pins providers (style Holo conservé tel quel).
- Pas de UI pour gérer les `home_addresses` (la table existe déjà avec ses entrées).
