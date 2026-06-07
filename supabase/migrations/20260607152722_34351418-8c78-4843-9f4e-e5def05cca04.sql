UPDATE public.pickup_points
SET opening_hours = (opening_hours #>> '{}')::jsonb
WHERE jsonb_typeof(opening_hours) = 'string';