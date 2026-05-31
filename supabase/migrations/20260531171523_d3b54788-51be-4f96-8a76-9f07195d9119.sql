
-- providers
CREATE TABLE public.providers (
  id text PRIMARY KEY,
  name text NOT NULL,
  logo_url text NOT NULL,
  color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.providers TO anon, authenticated;
GRANT ALL ON public.providers TO service_role;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_public_read" ON public.providers FOR SELECT TO anon, authenticated USING (true);

-- pickup_points
CREATE TABLE public.pickup_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  external_id text,
  name text NOT NULL,
  address text NOT NULL,
  postal_code text NOT NULL,
  city text NOT NULL,
  lat numeric(9,6) NOT NULL,
  lng numeric(9,6) NOT NULL,
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pickup_points_provider_idx ON public.pickup_points(provider_id);
CREATE INDEX pickup_points_coords_idx ON public.pickup_points(lat, lng);

GRANT SELECT ON public.pickup_points TO anon, authenticated;
GRANT ALL ON public.pickup_points TO service_role;
ALTER TABLE public.pickup_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pickup_points_public_read" ON public.pickup_points FOR SELECT TO anon, authenticated USING (true);

-- app_config (singleton)
CREATE TABLE public.app_config (
  id int PRIMARY KEY CHECK (id = 1),
  center_address text NOT NULL,
  center_lat numeric(9,6) NOT NULL,
  center_lng numeric(9,6) NOT NULL,
  default_zoom int NOT NULL DEFAULT 15,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_config TO anon, authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config_public_read" ON public.app_config FOR SELECT TO anon, authenticated USING (true);

-- Seed providers
INSERT INTO public.providers (id, name, logo_url, color) VALUES
  ('mondial_relay', 'Mondial Relay', '/logos/mondial_relay.png', '#E2001A'),
  ('vinted_go',    'Vinted Go',     '/logos/vinted_go.png',     '#09B1BA'),
  ('chronopost',   'Chronopost',    '/logos/chronopost.png',    '#00925A'),
  ('shop2shop',    'Shop2Shop',     '/logos/shop2shop.png',     '#F08000');

-- Default center: Place de la République, Paris
INSERT INTO public.app_config (id, center_address, center_lat, center_lng, default_zoom)
VALUES (1, 'Place de la République, 75011 Paris', 48.867670, 2.363824, 15);

-- Seed ~25 fake pickup points across 75 / 92 / 93
INSERT INTO public.pickup_points (provider_id, name, address, postal_code, city, lat, lng, opening_hours, notes) VALUES
  -- Mondial Relay
  ('mondial_relay', 'Fake - Tabac République',     '12 Rue du Faubourg du Temple',  '75011', 'Paris',           48.8689, 2.3650, '{"mon":[{"open":"08:00","close":"20:00"}],"tue":[{"open":"08:00","close":"20:00"}],"wed":[{"open":"08:00","close":"20:00"}],"thu":[{"open":"08:00","close":"20:00"}],"fri":[{"open":"08:00","close":"20:00"}],"sat":[{"open":"09:00","close":"19:00"}],"sun":[]}', 'Casier souvent plein le samedi'),
  ('mondial_relay', 'Fake - Presse Oberkampf',     '85 Rue Oberkampf',              '75011', 'Paris',           48.8650, 2.3760, '{"mon":[{"open":"07:00","close":"21:00"}],"tue":[{"open":"07:00","close":"21:00"}],"wed":[{"open":"07:00","close":"21:00"}],"thu":[{"open":"07:00","close":"21:00"}],"fri":[{"open":"07:00","close":"21:00"}],"sat":[{"open":"08:00","close":"20:00"}],"sun":[{"open":"09:00","close":"13:00"}]}', NULL),
  ('mondial_relay', 'Fake - Épicerie Levallois',   '45 Rue du Président Wilson',    '92300', 'Levallois-Perret', 48.8930, 2.2870, '{"mon":[{"open":"09:00","close":"19:30"}],"tue":[{"open":"09:00","close":"19:30"}],"wed":[{"open":"09:00","close":"19:30"}],"thu":[{"open":"09:00","close":"19:30"}],"fri":[{"open":"09:00","close":"19:30"}],"sat":[{"open":"09:00","close":"18:00"}],"sun":[]}', 'Fermé exceptionnellement le 14/07'),
  ('mondial_relay', 'Fake - Tabac Saint-Denis',    '22 Rue de la République',       '93200', 'Saint-Denis',     48.9362, 2.3574, '{"mon":[{"open":"08:00","close":"20:00"}],"tue":[{"open":"08:00","close":"20:00"}],"wed":[{"open":"08:00","close":"20:00"}],"thu":[{"open":"08:00","close":"20:00"}],"fri":[{"open":"08:00","close":"20:00"}],"sat":[{"open":"09:00","close":"19:00"}],"sun":[]}', NULL),
  ('mondial_relay', 'Fake - Pressing Bagnolet',    '8 Rue Sadi Carnot',             '93170', 'Bagnolet',        48.8676, 2.4170, '{"mon":[{"open":"09:00","close":"19:00"}],"tue":[{"open":"09:00","close":"19:00"}],"wed":[{"open":"09:00","close":"19:00"}],"thu":[{"open":"09:00","close":"19:00"}],"fri":[{"open":"09:00","close":"19:00"}],"sat":[{"open":"09:00","close":"17:00"}],"sun":[]}', 'Disponibilité élevée'),

  -- Vinted Go
  ('vinted_go', 'Fake - Locker Bastille',      'Place de la Bastille',           '75011', 'Paris',            48.8530, 2.3690, '{"mon":[{"open":"00:00","close":"23:59"}],"tue":[{"open":"00:00","close":"23:59"}],"wed":[{"open":"00:00","close":"23:59"}],"thu":[{"open":"00:00","close":"23:59"}],"fri":[{"open":"00:00","close":"23:59"}],"sat":[{"open":"00:00","close":"23:59"}],"sun":[{"open":"00:00","close":"23:59"}]}', '24h/24 - casiers automatiques'),
  ('vinted_go', 'Fake - Locker République',    'Place de la République',         '75011', 'Paris',            48.8675, 2.3635, '{"mon":[{"open":"00:00","close":"23:59"}],"tue":[{"open":"00:00","close":"23:59"}],"wed":[{"open":"00:00","close":"23:59"}],"thu":[{"open":"00:00","close":"23:59"}],"fri":[{"open":"00:00","close":"23:59"}],"sat":[{"open":"00:00","close":"23:59"}],"sun":[{"open":"00:00","close":"23:59"}]}', 'Disponibilité limitée'),
  ('vinted_go', 'Fake - Locker Nation',        'Place de la Nation',             '75012', 'Paris',            48.8485, 2.3960, '{"mon":[{"open":"00:00","close":"23:59"}],"tue":[{"open":"00:00","close":"23:59"}],"wed":[{"open":"00:00","close":"23:59"}],"thu":[{"open":"00:00","close":"23:59"}],"fri":[{"open":"00:00","close":"23:59"}],"sat":[{"open":"00:00","close":"23:59"}],"sun":[{"open":"00:00","close":"23:59"}]}', NULL),
  ('vinted_go', 'Fake - Locker Courbevoie',    'Place Charras',                  '92400', 'Courbevoie',       48.8970, 2.2570, '{"mon":[{"open":"00:00","close":"23:59"}],"tue":[{"open":"00:00","close":"23:59"}],"wed":[{"open":"00:00","close":"23:59"}],"thu":[{"open":"00:00","close":"23:59"}],"fri":[{"open":"00:00","close":"23:59"}],"sat":[{"open":"00:00","close":"23:59"}],"sun":[{"open":"00:00","close":"23:59"}]}', NULL),
  ('vinted_go', 'Fake - Locker Aubervilliers', 'Avenue Jean Jaurès',             '93300', 'Aubervilliers',    48.9145, 2.3830, '{"mon":[{"open":"00:00","close":"23:59"}],"tue":[{"open":"00:00","close":"23:59"}],"wed":[{"open":"00:00","close":"23:59"}],"thu":[{"open":"00:00","close":"23:59"}],"fri":[{"open":"00:00","close":"23:59"}],"sat":[{"open":"00:00","close":"23:59"}],"sun":[{"open":"00:00","close":"23:59"}]}', 'Casier souvent plein'),

  -- Chronopost
  ('chronopost', 'Fake - Agence Chronopost Châtelet',   '15 Rue de Rivoli',              '75004', 'Paris',            48.8580, 2.3530, '{"mon":[{"open":"09:00","close":"18:30"}],"tue":[{"open":"09:00","close":"18:30"}],"wed":[{"open":"09:00","close":"18:30"}],"thu":[{"open":"09:00","close":"18:30"}],"fri":[{"open":"09:00","close":"18:30"}],"sat":[{"open":"09:00","close":"13:00"}],"sun":[]}', NULL),
  ('chronopost', 'Fake - Point Chronopost Madeleine',   '8 Place de la Madeleine',       '75008', 'Paris',            48.8700, 2.3245, '{"mon":[{"open":"09:30","close":"19:00"}],"tue":[{"open":"09:30","close":"19:00"}],"wed":[{"open":"09:30","close":"19:00"}],"thu":[{"open":"09:30","close":"19:00"}],"fri":[{"open":"09:30","close":"19:00"}],"sat":[{"open":"10:00","close":"18:00"}],"sun":[]}', 'Forte affluence à midi'),
  ('chronopost', 'Fake - Agence Boulogne',             '120 Avenue Jean-Baptiste Clément','92100', 'Boulogne-Billancourt', 48.8350, 2.2400, '{"mon":[{"open":"08:30","close":"19:00"}],"tue":[{"open":"08:30","close":"19:00"}],"wed":[{"open":"08:30","close":"19:00"}],"thu":[{"open":"08:30","close":"19:00"}],"fri":[{"open":"08:30","close":"19:00"}],"sat":[{"open":"09:00","close":"13:00"}],"sun":[]}', NULL),
  ('chronopost', 'Fake - Point Chronopost Neuilly',    '50 Avenue Charles de Gaulle',   '92200', 'Neuilly-sur-Seine', 48.8855, 2.2685, '{"mon":[{"open":"09:00","close":"19:30"}],"tue":[{"open":"09:00","close":"19:30"}],"wed":[{"open":"09:00","close":"19:30"}],"thu":[{"open":"09:00","close":"19:30"}],"fri":[{"open":"09:00","close":"19:30"}],"sat":[{"open":"10:00","close":"18:00"}],"sun":[]}', NULL),
  ('chronopost', 'Fake - Agence Montreuil',            '30 Rue de Paris',               '93100', 'Montreuil',        48.8625, 2.4438, '{"mon":[{"open":"09:00","close":"18:30"}],"tue":[{"open":"09:00","close":"18:30"}],"wed":[{"open":"09:00","close":"18:30"}],"thu":[{"open":"09:00","close":"18:30"}],"fri":[{"open":"09:00","close":"18:30"}],"sat":[]}', 'Fermé le samedi'),

  -- Shop2Shop
  ('shop2shop', 'Fake - Carrefour City Marais',    '38 Rue de Bretagne',            '75003', 'Paris',            48.8625, 2.3625, '{"mon":[{"open":"07:00","close":"23:00"}],"tue":[{"open":"07:00","close":"23:00"}],"wed":[{"open":"07:00","close":"23:00"}],"thu":[{"open":"07:00","close":"23:00"}],"fri":[{"open":"07:00","close":"23:00"}],"sat":[{"open":"07:00","close":"23:00"}],"sun":[{"open":"08:00","close":"21:00"}]}', NULL),
  ('shop2shop', 'Fake - Franprix Père Lachaise',   '15 Boulevard de Ménilmontant',  '75011', 'Paris',            48.8615, 2.3895, '{"mon":[{"open":"08:00","close":"21:00"}],"tue":[{"open":"08:00","close":"21:00"}],"wed":[{"open":"08:00","close":"21:00"}],"thu":[{"open":"08:00","close":"21:00"}],"fri":[{"open":"08:00","close":"21:00"}],"sat":[{"open":"08:00","close":"21:00"}],"sun":[{"open":"09:00","close":"13:00"}]}', 'Disponibilité élevée'),
  ('shop2shop', 'Fake - Tabac Issy',               '5 Rue du Général Leclerc',      '92130', 'Issy-les-Moulineaux', 48.8240, 2.2730, '{"mon":[{"open":"07:30","close":"20:00"}],"tue":[{"open":"07:30","close":"20:00"}],"wed":[{"open":"07:30","close":"20:00"}],"thu":[{"open":"07:30","close":"20:00"}],"fri":[{"open":"07:30","close":"20:00"}],"sat":[{"open":"08:30","close":"19:00"}],"sun":[]}', NULL),
  ('shop2shop', 'Fake - Carrefour Asnières',       '12 Rue Pierre Brossolette',     '92600', 'Asnières-sur-Seine', 48.9120, 2.2870, '{"mon":[{"open":"08:00","close":"21:00"}],"tue":[{"open":"08:00","close":"21:00"}],"wed":[{"open":"08:00","close":"21:00"}],"thu":[{"open":"08:00","close":"21:00"}],"fri":[{"open":"08:00","close":"21:00"}],"sat":[{"open":"08:00","close":"21:00"}],"sun":[{"open":"09:00","close":"13:00"}]}', 'Casier au fond du magasin'),
  ('shop2shop', 'Fake - Tabac Pantin',             '55 Avenue Jean Lolive',         '93500', 'Pantin',           48.8945, 2.4060, '{"mon":[{"open":"07:00","close":"20:00"}],"tue":[{"open":"07:00","close":"20:00"}],"wed":[{"open":"07:00","close":"20:00"}],"thu":[{"open":"07:00","close":"20:00"}],"fri":[{"open":"07:00","close":"20:00"}],"sat":[{"open":"08:00","close":"19:00"}],"sun":[]}', 'Fermé exceptionnellement le 15/08'),
  ('shop2shop', 'Fake - Franprix Bobigny',         '88 Avenue Henri Barbusse',      '93000', 'Bobigny',          48.9100, 2.4400, '{"mon":[{"open":"08:00","close":"21:00"}],"tue":[{"open":"08:00","close":"21:00"}],"wed":[{"open":"08:00","close":"21:00"}],"thu":[{"open":"08:00","close":"21:00"}],"fri":[{"open":"08:00","close":"21:00"}],"sat":[{"open":"08:00","close":"21:00"}],"sun":[{"open":"09:00","close":"13:00"}]}', NULL);
