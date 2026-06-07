
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DELETE FROM public.pickup_points p
USING public.pickup_points q
WHERE p.provider_id = q.provider_id
  AND p.external_id = q.external_id
  AND p.external_id IS NOT NULL
  AND (p.updated_at < q.updated_at
       OR (p.updated_at = q.updated_at AND p.ctid < q.ctid));

ALTER TABLE public.pickup_points
  ADD COLUMN IF NOT EXISTS hours_fetched_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pickup_points_provider_extid_uq
  ON public.pickup_points (provider_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.enrichments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  point_id uuid NULL,
  provider_id text NOT NULL,
  external_id text NULL,
  status text NOT NULL,
  error text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.enrichments TO anon, authenticated;
GRANT ALL ON public.enrichments TO service_role;

ALTER TABLE public.enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrichments_public_read"
  ON public.enrichments FOR SELECT
  TO public
  USING (true);

CREATE INDEX IF NOT EXISTS enrichments_created_at_idx ON public.enrichments(created_at DESC);
CREATE INDEX IF NOT EXISTS pickup_points_provider_hours_idx
  ON public.pickup_points(provider_id, hours_fetched_at NULLS FIRST, updated_at);
