DROP POLICY IF EXISTS providers_public_read ON public.providers;
REVOKE SELECT ON public.providers FROM anon, authenticated;
GRANT ALL ON public.providers TO service_role;