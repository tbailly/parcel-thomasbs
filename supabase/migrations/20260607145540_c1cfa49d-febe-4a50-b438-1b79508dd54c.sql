
CREATE TABLE public.enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  trigger text NOT NULL DEFAULT 'cron',
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  batch_size integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  remaining_after integer,
  error text
);

GRANT SELECT ON public.enrichment_jobs TO anon, authenticated;
GRANT ALL ON public.enrichment_jobs TO service_role;

ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY enrichment_jobs_public_read ON public.enrichment_jobs
  FOR SELECT TO public USING (true);

CREATE INDEX enrichment_jobs_provider_started_idx
  ON public.enrichment_jobs (provider_id, started_at DESC);
