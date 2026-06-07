-- Clean orphans then add cascading FKs
DELETE FROM public.pickup_points WHERE query_id IS NOT NULL AND query_id NOT IN (SELECT id FROM public.queries);
DELETE FROM public.enrichments WHERE point_id IS NOT NULL AND point_id NOT IN (SELECT id FROM public.pickup_points);

ALTER TABLE public.pickup_points
  DROP CONSTRAINT IF EXISTS pickup_points_query_id_fkey,
  ADD CONSTRAINT pickup_points_query_id_fkey
    FOREIGN KEY (query_id) REFERENCES public.queries(id) ON DELETE CASCADE;

ALTER TABLE public.enrichments
  DROP CONSTRAINT IF EXISTS enrichments_point_id_fkey,
  ADD CONSTRAINT enrichments_point_id_fkey
    FOREIGN KEY (point_id) REFERENCES public.pickup_points(id) ON DELETE CASCADE;