-- Tabela de configuração por tipo de trilha × exposição.
-- Centraliza multiplicadores que antes estavam espalhados:
--   meia_vida_mult → era hardcoded em meia_vida_clima_mult (bikepark) e configuracoes_sistema (natural)
--   score_mult     → era bikepark_score_mult em configuracoes_sistema
--
-- Lookup: trail_type + exposicao (exato) → fallback exposicao NULL (genérico por trail_type).

CREATE TABLE IF NOT EXISTS trail_type_config (
  id             serial  PRIMARY KEY,
  trail_type     text    NOT NULL,        -- 'natural' | 'bikepark'
  exposicao      text    DEFAULT NULL,    -- NULL = qualquer; 'aberta' | 'fechada' | 'mista'
  meia_vida_mult float   NOT NULL DEFAULT 1.0,
  score_mult     float   NOT NULL DEFAULT 1.0,
  descricao      text,
  ativo          boolean NOT NULL DEFAULT true
);

INSERT INTO trail_type_config (trail_type, exposicao, meia_vida_mult, score_mult, descricao) VALUES
  ('natural', 'aberta',  1.08, 1.00,
   'Trilha natural em terreno aberto (campos, chapadas, cristas sem cobertura). Sem drenagem projetada, mas sol e vento diretos aceleram a secagem. Efeito suave: +8% sobre meia_vida_base. Ex: terra/aberta 24h → 25.9h.'),

  ('natural', 'mista',   1.15, 1.00,
   'Trilha natural com cobertura vegetal parcial (transição entre aberta e fechada). Retém mais umidade que aberta mas seca mais rápido que fechada. +15% sobre meia_vida_base. Ex: terra/mista 30h → 34.5h.'),

  ('natural', 'fechada', 1.22, 1.00,
   'Trilha natural em mata densa fechada (ex: Mata Atlântica serrana, Amazônia). Sem drenagem projetada, dossel retém umidade, sombra constante. Secagem muito lenta: +22% sobre meia_vida_base. Ex: terra/fechada 36h → 43.9h. Referência: trilha Macaco (natural/fechada/Mata Atlântica).'),

  ('bikepark', 'aberta',  0.35, 0.90,
   'Bikepark aberto com terra compactada exposta ao sol e vento — seca mais rápido de todos. Score reduzido a 90% quando solo não saturado (acumulo_ef < threshold) pois o impacto da chuva é menor em pista com drenagem. Ex: terra/aberta 24h → 8.4h.'),

  ('bikepark', 'mista',   0.48, 0.90,
   'Bikepark com cobertura parcial — drenagem projetada mas com alguma sombra. Valor intermediário entre aberta (0.35) e fechada (0.60). Score reduzido a 90% quando solo não saturado. Ex: terra/mista 30h → 14.4h.'),

  ('bikepark', 'fechada', 0.60, 0.90,
   'Bikepark fechado com drenagem projetada e cobertura vegetal — seca rápido apesar da sombra por causa da infraestrutura de drenagem. Score reduzido a 90% quando solo não saturado. Ex: terra/fechada 36h → 21.6h.');

-- RLS: leitura pública (mesmo padrão das outras tabelas de config)
ALTER TABLE trail_type_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trail_type_config' AND policyname = 'trail_type_config_select_public'
  ) THEN
    CREATE POLICY "trail_type_config_select_public"
      ON trail_type_config FOR SELECT USING (true);
  END IF;
END$$;

-- Remove parâmetros que foram absorvidos por esta tabela
DELETE FROM configuracoes_sistema WHERE chave = 'natural_meia_vida_mult';
UPDATE configuracoes_sistema
  SET valor = 'migrado para trail_type_config', descricao = 'Obsoleto — ver trail_type_config'
  WHERE chave = 'bikepark_score_mult';

-- Desativa as linhas de bikepark em meia_vida_clima_mult (substituídas por trail_type_config)
UPDATE meia_vida_clima_mult SET ativo = false WHERE variavel = 'bikepark';

-- Adiciona exposicao 'mista' na tabela meia_vida_secagem
-- Valores = média de aberta e fechada para cada solo_type
INSERT INTO meia_vida_secagem (solo_type, exposicao, meia_vida_h) VALUES
  ('ferro',    'mista', 11),
  ('pedra',    'mista',  8),
  ('preto',    'mista', 19),
  ('misto_mg', 'mista', 15),
  ('misto',    'mista', 23),
  ('terra',    'mista', 30)
ON CONFLICT DO NOTHING;
