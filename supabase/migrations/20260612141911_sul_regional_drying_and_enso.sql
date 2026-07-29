
-- 1. Adiciona coluna regiao em meia_vida_secagem (NULL = default global)
ALTER TABLE meia_vida_secagem ADD COLUMN IF NOT EXISTS regiao TEXT;

-- 2. Cria tabela enso_regional_mult
CREATE TABLE IF NOT EXISTS enso_regional_mult (
    id          SERIAL PRIMARY KEY,
    fase        TEXT           NOT NULL,
    regiao      TEXT           NOT NULL,
    multiplicador NUMERIC(4,2) NOT NULL,
    ativo       BOOLEAN        NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT enso_regional_mult_fase_regiao_key UNIQUE (fase, regiao)
);
ALTER TABLE enso_regional_mult ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enso_regional_mult_read_all"
    ON enso_regional_mult FOR SELECT USING (true);

-- 3. Insere meia_vida SUL
-- SC (+25%): subtropical costeiro/serrano, solo retém umidade por mais tempo
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra', 'fechada', 'SC', 45),
  ('terra', 'aberta',  'SC', 30),
  ('terra', 'mista',   'SC', 38),
  ('misto', 'fechada', 'SC', 34),
  ('misto', 'aberta',  'SC', 22),
  ('misto', 'mista',   'SC', 28),
  ('preto', 'fechada', 'SC', 30),
  ('preto', 'aberta',  'SC', 18),
  ('preto', 'mista',   'SC', 24)
ON CONFLICT DO NOTHING;

-- RS (+33%): mais frio e úmido, secagem mais lenta de todas as regiões
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra', 'fechada', 'RS', 48),
  ('terra', 'aberta',  'RS', 32),
  ('terra', 'mista',   'RS', 40),
  ('misto', 'fechada', 'RS', 36),
  ('misto', 'aberta',  'RS', 24),
  ('misto', 'mista',   'RS', 30),
  ('preto', 'fechada', 'RS', 32),
  ('preto', 'aberta',  'RS', 19),
  ('preto', 'mista',   'RS', 25)
ON CONFLICT DO NOTHING;

-- PR (+17%): zona de transição SUL/SUDESTE
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra', 'fechada', 'PR', 42),
  ('terra', 'aberta',  'PR', 28),
  ('terra', 'mista',   'PR', 35),
  ('misto', 'fechada', 'PR', 33),
  ('misto', 'aberta',  'PR', 21),
  ('misto', 'mista',   'PR', 27),
  ('preto', 'fechada', 'PR', 28),
  ('preto', 'aberta',  'PR', 17),
  ('preto', 'mista',   'PR', 22)
ON CONFLICT DO NOTHING;

-- 4. Insere multiplicadores ENSO regionais para SUL
-- El Niño afeta SUL com mais chuva que SP/SE → threshold cai mais
-- La Niña no SUL traz seca mais intensa → threshold sobe mais
INSERT INTO enso_regional_mult (fase, regiao, multiplicador) VALUES
  ('el_nino_forte', 'SC', 0.68), ('el_nino', 'SC', 0.78),
  ('neutro',        'SC', 1.00),
  ('la_nina',       'SC', 1.22), ('la_nina_forte', 'SC', 1.38),

  ('el_nino_forte', 'RS', 0.68), ('el_nino', 'RS', 0.78),
  ('neutro',        'RS', 1.00),
  ('la_nina',       'RS', 1.25), ('la_nina_forte', 'RS', 1.40),

  ('el_nino_forte', 'PR', 0.72), ('el_nino', 'PR', 0.80),
  ('neutro',        'PR', 1.00),
  ('la_nina',       'PR', 1.20), ('la_nina_forte', 'PR', 1.32)
ON CONFLICT DO NOTHING;
