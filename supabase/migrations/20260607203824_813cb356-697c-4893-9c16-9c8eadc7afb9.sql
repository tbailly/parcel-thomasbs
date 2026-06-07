DROP POLICY IF EXISTS enrichments_public_read ON public.enrichments;
DROP POLICY IF EXISTS queries_public_read ON public.queries;
DROP POLICY IF EXISTS enrichment_jobs_public_read ON public.enrichment_jobs;
REVOKE SELECT ON public.enrichments FROM anon, authenticated;
REVOKE SELECT ON public.queries FROM anon, authenticated;
REVOKE SELECT ON public.enrichment_jobs FROM anon, authenticated;