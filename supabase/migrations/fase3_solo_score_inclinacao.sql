-- =============================================================
-- FASE 3: Migração de dados hardcoded para Supabase
-- Tabelas: solo_type_config, inclinacao_config, score_config
-- Branch: develop
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 3A: solo_type_config
-- Base de fator_absorcao() e score_mult de calcular_score_trilha()
-- Aplicados quando clay_pct nao esta disponivel (FIX #7)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS solo_type_config (
  id                  serial  PRIMARY KEY,
  solo_type           text    NOT NULL,
  fator_absorcao_base numeric NOT NULL,  -- base de absorcao quando clay_pct ausente
  score_mult          numeric NOT NULL,  -- multiplicador de impacto no score (so sem clay_pct)
  altitude_bonus_min  integer,           -- null = sem bonus; condicao: altitude_m > altitude_bonus_min
  altitude_bonus      numeric,           -- valor somado a base quando altitude_m > altitude_bonus_min
  ativo               boolean NOT NULL DEFAULT true
);

ALTER TABLE solo_type_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solo_type_config_read_all" ON solo_type_config FOR SELECT USING (true);

INSERT INTO solo_type_config (solo_type, fator_absorcao_base, score_mult, altitude_bonus_min, altitude_bonus, ativo) VALUES
  ('terra',    0.80, 1.05, 1200, 0.05, true),
  ('preto',    0.60, 0.95, 1200, 0.05, true),
  ('misto',    0.55, 1.00, 1200, 0.05, true),
  ('misto_mg', 0.45, 0.92, 1200, 0.05, true),
  ('pedra',    0.25, 0.80, 1200, 0.05, true),
  ('ferro',    0.30, 0.85, 1200, 0.05, true);


-- ──────────────────────────────────────────────────────────────
-- 3B: inclinacao_config
-- Penalizadores de fator_absorcao() por inclinacao calculada
-- tipo='inclinacao': graus = desnivel_m / (extensao_km * 1000) * 100  (prioritario)
-- tipo='desnivel': metros brutos — fallback quando extensao_km ausente
-- Avaliados em ordem de id (mais restritivo primeiro dentro de cada tipo)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inclinacao_config (
  id          serial  PRIMARY KEY,
  tipo        text    NOT NULL,   -- 'inclinacao' (graus calculados) | 'desnivel' (metros, fallback)
  grau_min    numeric NOT NULL,   -- para desnivel: metros; para inclinacao: graus percentuais
  grau_max    numeric,            -- null = sem limite superior
  delta_fator numeric NOT NULL,   -- valor subtraido da base (negativo = penalizador)
  ativo       boolean NOT NULL DEFAULT true
);

ALTER TABLE inclinacao_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inclinacao_config_read_all" ON inclinacao_config FOR SELECT USING (true);

-- Inclinacao calculada (graus percentuais — prioritario quando extensao_km disponivel)
-- Desnivel (metros brutos — fallback quando extensao_km ausente)
INSERT INTO inclinacao_config (tipo, grau_min, grau_max, delta_fator, ativo) VALUES
  ('inclinacao', 30,  null, -0.22, true),
  ('inclinacao', 20,  30,   -0.15, true),
  ('inclinacao', 10,  20,   -0.08, true),
  ('desnivel',   800, null, -0.18, true),
  ('desnivel',   500, 800,  -0.10, true),
  ('desnivel',   300, 500,  -0.05, true);


-- ──────────────────────────────────────────────────────────────
-- 3C: score_config
-- Coeficientes de calcular_score_trilha()
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS score_config (
  id      serial  PRIMARY KEY,
  chave   text    NOT NULL UNIQUE,
  valor   numeric NOT NULL,
  ativo   boolean NOT NULL DEFAULT true
);

ALTER TABLE score_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "score_config_read_all" ON score_config FOR SELECT USING (true);

INSERT INTO score_config (chave, valor, ativo) VALUES
  -- Coeficientes de impacto
  ('coef_rain',                  0.6,  true),  -- impacto = rain_mm * coef_rain (solo_descansado, pico_3h < 10)
  ('coef_pico_descansado',       0.7,  true),  -- impacto = pico_3h * 0.7 (pico_3h >= 10, solo_descansado)
  ('coef_pico_molhado',          1.0,  true),  -- impacto = pico_3h * 1.0 (pico_3h >= 10, solo molhado)
  ('coef_acumulo',               0.3,  true),  -- impacto = rain_mm + acumulo_ef * 0.3 (solo molhado, pico_3h < 10)
  ('coef_base',                 10.0,  true),  -- score = impacto * coef_base  (escala 0-100)
  ('pico_threshold',            10.0,  true),  -- limiar para logica de pico_3h (pico_3h >= pico_threshold)
  -- Bikepark
  ('bikepark_acumulo_threshold',  5.0,  true),  -- se acumulo_ef < threshold: aplica bikepark_score_mult
  ('bikepark_score_mult',         0.90, true),  -- reducao de impacto para bikepark nao saturado
  ('bikepark_saturado_threshold', 10.0, true);  -- fallback quando threshold_sazonal indisponivel
