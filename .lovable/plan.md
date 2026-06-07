## Diagnostic

1. **Cron OK côté schedule** : `enrich-vinted-go` tourne toutes les 2 min (vu dans `cron.job_run_details`).
2. **URL OK depuis publication** : plus de 404 "No published build".
3. **Mais timeout pg_net à 5 s** : `net._http_response` montre `Timeout of 5000 ms reached`. Un batch de 5 points fait 4 attentes de 2-5 s entre les fetchs (`jitter(2000, 5000)`) → 8-20 s, bien au-delà des 5 s par défaut.

Conséquence : le handler côté app *commence* le batch mais pg_net coupe la connexion. Cloudflare peut interrompre la suite du traitement quand le client ferme — d'où aucun `enrichment_jobs` créé par la cron.

## Correctifs

### 1. Rescheduler la cron avec `timeout_milliseconds`

Unscheduler puis recréer avec un timeout généreux (60 s) — la cron n'attend de toute façon pas la réponse pour passer à autre chose. Via `supabase--insert` (pas une migration : touche `cron.job`, contient l'URL/anon key).

```sql
SELECT cron.unschedule('enrich-vinted-go');
SELECT cron.schedule(
  'enrich-vinted-go',
  '*/2 * * * *',
  $$SELECT net.http_post(
      url := 'https://project--a6e6dce0-50f1-4e53-949b-4dc21b6d4ad7.lovable.app/api/public/hooks/enrich-vinted-go',
      headers := '{"Content-Type":"application/json","apikey":"sb_publishable_2SFPKfHm4P0ch_2dHLKIcA_Fa9T_Nqc"}'::jsonb,
      body := '{"batchSize":5}'::jsonb,
      timeout_milliseconds := 60000
  );$$
);
```

### 2. Scoper l'enrichissement à la dernière query éligible

Dans `src/lib/vinted-go.functions.ts`, en haut de `enrichVintedGoBatchImpl` :

1. Lire la dernière `queries` pour `provider_id='vinted_go'` où `status='success'` ET `inserted_count > 1`, triée par `finished_at desc`.
2. Si aucune → finaliser le job en `success` avec `processed=0, remaining_after=0` et `error='no eligible query'`, retourner.
3. Sinon, ajouter `.eq('query_id', latestQuery.id)` au `select` qui pioche les `pickup_points` à enrichir.
4. Recalculer `remaining_after` avec le même `eq('query_id', latestQuery.id)`.

### 3. Aligner `getVintedGoStats`

Pour que la barre de progression reflète ce que la cron traite vraiment, scoper `total`, `enriched`, `pending` à la même dernière query éligible. Si aucune : `total=0, enriched=0, pending=0, inProgress=false`.

### Hors scope

- Pas de modif du dashboard ni des autres providers.
- Pas de refactor de la logique de jitter / batch size.
- Pas de migration SQL (uniquement `cron.job` via insert).

### Fichiers touchés

- `cron.job` (unschedule + reschedule avec timeout)
- `src/lib/vinted-go.functions.ts` (scope query + stats)
