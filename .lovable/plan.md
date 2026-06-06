## Objectif

Restyliser les pins de la carte avec une forme classique de "pin" (rond en haut, pointe en bas où la pointe correspond exactement à la coordonnée géographique), avec le logo du provider à l'intérieur du rond.

## Étapes

### 1. Assets logos providers

Créer `src/assets/providers/` avec :
- `mondial-relay.png` — copié depuis l'image uploadée (`/mnt/user-uploads/logo_cropped.png`).
- `vinted-go.svg`, `chronopost.svg`, `shop2shop.svg` — placeholders SVG simples (cercle coloré avec initiales du provider, type "VG", "CH", "S2S") qu'on pourra remplacer plus tard.

Les fichiers sont petits → on les garde dans le repo (pas de lovable-assets).

### 2. Mettre à jour `logo_url` des providers

Migration SQL : `UPDATE providers SET logo_url = '/src/...'` n'est pas idéal car Vite gère les imports. Préférer :
- Garder `logo_url` en DB pour les autres usages éventuels, mais côté `PickupMap` mapper `provider.name` (ou un slug) vers un import local.
- Créer un petit map `providerLogos: Record<string, string>` dans `PickupMap.tsx` (ou un fichier dédié `src/lib/provider-logos.ts`) qui mappe `provider.name` → URL importée (`import mondialRelayLogo from "@/assets/providers/mondial-relay.png"`).
- Fallback sur `provider.logo_url` si pas de mapping local.

### 3. Nouveau design de pin dans `PickupMap.tsx`

Remplacer `makeIcon` (actuellement un cercle centré sur la coordonnée) par un pin en goutte :

- SVG inline dans le `divIcon` html :
  - Forme : cercle de 36px en haut + pointe triangulaire de 14px en bas (total ~50px de haut).
  - Couleur de fond = `provider.color`, bordure blanche 2px, ombre douce.
  - Logo du provider centré dans la partie circulaire (28×28, `border-radius:50%`, `object-fit:cover`, fond blanc).
- `iconSize: [36, 50]`, `iconAnchor: [18, 50]` (pointe = bas du SVG = coordonnée exacte), `popupAnchor: [0, -46]`.

### 4. Légende

Garder le rendu actuel de la légende (petit rond avec logo) — pas besoin de changer.

## Hors scope

- Pas de changement DB.
- Pas de modification de la logique de fetch ou des popups (contenu inchangé).
- Pas de touch à `/refresh`.
