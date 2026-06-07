## Refonte de `/refresh-vinted`

### Modèle de données

Nouvelle table `enrichment_jobs` pour matérialiser chaque batch d'enrichissement (le cron actuel n'écrit que des lignes par-point dans `enrichments`, pas de notion de "run").

```text
enrichment_jobs
  id uuid pk
  provider_id text         -- 'vinted_go' (extensible)
  trigger text             -- 'cron' | 'manual'
  status text              -- 'running' | 'success' | 'error'
  started_at timestamptz
  finished_at timestamptz
  batch_size int
  processed int
  succeeded int
  failed int
  remaining_after int
  error text
```

Migration : table + RLS `public read` + GRANTs (`anon/authenticated SELECT`, `service_role ALL`).

### Backend (`src/lib/vinted-go.functions.ts`)

- `enrichVintedGoBatchImpl(batchSize, trigger)` : insère une ligne `enrichment_jobs` (`running`) en début, la met à jour en fin avec compteurs + `finished_at` + `remaining_after` + `status`. Try/catch global : si throw, `status='error'` + message.
- Hook cron `src/routes/api/public/hooks/enrich-vinted-go.ts` : passe `trigger='cron'`.
- Server fn manuelle `enrichVintedGoBatch` : passe `trigger='manual'`.
- Nouvelle `getVintedGoEnrichmentJobs` : 50 derniers jobs triés `started_at desc`.
- `getVintedGoStats` : ajoute `inProgress` (true si job `running` existe OU `pending > 0`).

### Frontend (`src/routes/refresh-vinted.tsx`)

Refonte complète, KISS :

- **Header** : titre + courte explication.
- **Bouton unique "Rafraîchir Vinted Go"** :
  1. `refreshVintedGoList()`
  2. `enrichVintedGoBatch({ batchSize: 5 })` (kickoff manuel immédiat — le cron toutes les 2 min prend ensuite le relais)
  3. Toast + invalidation
  Désactivé pendant l'exécution.
- **Barre de progression** : `enriched / total`, label "X points en attente — enrichissement en cours" ou "Tout est enrichi".
- **Tableau "Jobs d'enrichissement"** (`refetchInterval: 5000`) :
  - Démarré · Durée · Source (cron/manuel) · Statut (badge animé si `running`) · Traités · OK · Échecs · Restants après · Erreur (tronquée)
  - Auto-rafraîchi → on voit en direct chaque tick de cron arriver.

### Hors scope
- Pas d'auth, pas de pagination, pas de boutons par job, pas de loop côté serveur (le cron existant draine — on garde le `*/2 * * * *` actuel).
- Pas de modif du dashboard `/dashboard` ni des autres providers.

### Fichiers touchés
- `supabase/migrations/<ts>_enrichment_jobs.sql` (nouveau)
- `src/lib/vinted-go.functions.ts` (modifié)
- `src/routes/api/public/hooks/enrich-vinted-go.ts` (passer `trigger='cron'`)
- `src/routes/refresh-vinted.tsx` (réécrit)
