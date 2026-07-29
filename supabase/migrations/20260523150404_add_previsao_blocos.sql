-- Tabela de blocos de previsão de 6h por trilha
-- Substitui o campo previsao_24h (jsonb) em condicoes por dados relacionais tipados.
-- Migração em 3 passos: (1) criar tabela, (2) migrar frontend, (3) remover previsao_24h de condicoes.

CREATE TABLE IF NOT EXISTS previsao_blocos (
  trilha_id  uuid    NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
  bloco      integer NOT NULL CHECK (bloco BETWEEN 0 AND 3),
  label      text    NOT NULL,
  rain_mm    numeric NOT NULL DEFAULT 0,
  wind_max   numeric NOT NULL DEFAULT 0,
  pop_max    integer NOT NULL DEFAULT 0,
  temp_med   integer NOT NULL DEFAULT 0,
  gerado_em  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (trilha_id, bloco)
);

-- Índice para lookup por trilha (PK já cobre, mas explícito para clareza)
CREATE INDEX IF NOT EXISTS previsao_blocos_trilha_idx ON previsao_blocos (trilha_id);

-- RLS: leitura pública, escrita via service_role
ALTER TABLE previsao_blocos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura pública previsao_blocos"
  ON previsao_blocos FOR SELECT USING (true);
