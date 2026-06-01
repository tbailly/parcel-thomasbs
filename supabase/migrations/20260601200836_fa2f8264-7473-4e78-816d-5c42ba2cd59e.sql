ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS refresh_url text,
  ADD COLUMN IF NOT EXISTS refresh_script text;

UPDATE public.providers
SET refresh_url = 'https://www.mondialrelay.fr/trouver-le-point-relais-le-plus-proche-de-chez-moi/',
    refresh_script = E'main() {\n  console.log(''TOTO'');\n}\nmain();'
WHERE id = 'mondial_relay';
