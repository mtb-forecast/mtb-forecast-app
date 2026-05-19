-- Tabela de localidades (geocoding reverso via Nominatim)
CREATE TABLE IF NOT EXISTS localidades (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pais text NOT NULL DEFAULT 'Brasil',
  estado text NOT NULL,
  cidade text NOT NULL DEFAULT '',
  localidade text,
  created_at timestamptz DEFAULT now()
);

-- Índice único para evitar duplicatas (localidade nula tratada como string vazia)
CREATE UNIQUE INDEX IF NOT EXISTS localidades_unique_idx
  ON localidades (estado, cidade, COALESCE(localidade, ''));

-- FK nas tabelas de trilhas
ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS localidade_id uuid REFERENCES localidades(id);
ALTER TABLE trilhas_pendentes ADD COLUMN IF NOT EXISTS localidade_id uuid REFERENCES localidades(id);

-- RLS
ALTER TABLE localidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "localidades_read_all" ON localidades
  FOR SELECT USING (true);

CREATE POLICY "localidades_insert_auth" ON localidades
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
