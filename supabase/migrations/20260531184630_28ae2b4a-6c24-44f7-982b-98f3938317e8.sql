
-- home_addresses
CREATE TABLE public.home_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'FR',
  lat numeric NOT NULL,
  lng numeric NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_addresses TO anon, authenticated;
GRANT ALL ON public.home_addresses TO service_role;
ALTER TABLE public.home_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY home_addresses_public_read ON public.home_addresses FOR SELECT USING (true);

-- queries
CREATE TABLE public.queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL,
  home_address_id uuid NULL,
  postal_code text NULL,
  status text NOT NULL DEFAULT 'success',
  raw_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  error text NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queries_provider_finished_idx ON public.queries (provider_id, finished_at DESC);
GRANT SELECT ON public.queries TO anon, authenticated;
GRANT ALL ON public.queries TO service_role;
ALTER TABLE public.queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY queries_public_read ON public.queries FOR SELECT USING (true);

-- pickup_points.query_id
ALTER TABLE public.pickup_points ADD COLUMN query_id uuid NULL;
CREATE INDEX pickup_points_provider_query_idx ON public.pickup_points (provider_id, query_id);

-- vue latest_pickup_points
CREATE OR REPLACE VIEW public.latest_pickup_points AS
WITH last_q AS (
  SELECT DISTINCT ON (provider_id) id, provider_id
  FROM public.queries
  WHERE status = 'success'
  ORDER BY provider_id, finished_at DESC
)
SELECT p.*
FROM public.pickup_points p
JOIN last_q ON p.query_id = last_q.id;
GRANT SELECT ON public.latest_pickup_points TO anon, authenticated;
