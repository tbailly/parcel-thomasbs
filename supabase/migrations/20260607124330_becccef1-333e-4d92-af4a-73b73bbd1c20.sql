DROP INDEX IF EXISTS public.pickup_points_provider_extid_uq;
CREATE UNIQUE INDEX pickup_points_provider_extid_uq ON public.pickup_points (provider_id, external_id);