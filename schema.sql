CREATE TABLE IF NOT EXISTS farmers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  island TEXT NOT NULL,
  village TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  farmer_id TEXT REFERENCES farmers(id) ON DELETE CASCADE,
  cultivar TEXT NOT NULL,
  form TEXT NOT NULL,
  weight NUMERIC NOT NULL,
  harvest_date DATE NOT NULL,
  gi TEXT NOT NULL,
  lab TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_docs (
  id TEXT PRIMARY KEY,
  batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  buyer_id TEXT REFERENCES buyers(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  form TEXT NOT NULL,
  cultivar TEXT,
  min_kg NUMERIC NOT NULL,
  max_kg NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES requests(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES batches(id) ON DELETE SET NULL,
  offer_kg NUMERIC NOT NULL,
  price NUMERIC,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
