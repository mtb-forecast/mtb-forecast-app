-- =============================================================
-- FASE 2: Migração de dados hardcoded para Supabase
-- Tabelas: meia_vida_clima_mult, microclima_config
-- INSERT: configuracoes_sistema (tabela já existe)
-- Branch: develop
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 2A: meia_vida_clima_mult
-- Multiplicadores climáticos que substituem _ajustar_meia_vida_clima()
-- Unidade de vento: km/h (código converte m/s → km/h internamente)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meia_vida_clima_mult (
  id            serial  PRIMARY KEY,
  variavel      text    NOT NULL,  -- 'temperatura', 'vento', 'nebulosidade', 'umidade', 'combo', 'bikepark'
  condicao      text    NOT NULL,  -- documentação da condição (não executada em SQL)
  valor_min     numeric,           -- null = sem limite inferior
  valor_max     numeric,           -- null = sem limite superior
  exposicao     text,              -- null = qualquer; 'aberta'/'fechada' para bikepark
  multiplicador numeric NOT NULL,
  ativo         boolean NOT NULL DEFAULT true
);

ALTER TABLE meia_vida_clima_mult ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meia_vida_clima_mult_read_all" ON meia_vida_clima_mult FOR SELECT USING (true);

-- Temperatura (°C) — avaliados em if/elif; o ultimo (~10) é dead code no Python atual
INSERT INTO meia_vida_clima_mult (variavel, condicao, valor_min, valor_max, exposicao, multiplicador, ativo) VALUES
  ('temperatura', 'temp_c >= 35',                                    35,   null, null, 0.65, true),
  ('temperatura', '30 <= temp_c < 35',                               30,   35,   null, 0.75, true),
  ('temperatura', '26 <= temp_c < 30',                               26,   30,   null, 0.86, true),
  ('temperatura', 'temp_c <= 16 (16-26 sem efeito)',                 null, 16,   null, 1.12, true),
  ('temperatura', 'temp_c <= 10 — dead code, coberto pelo <= 16',    null, 10,   null, 1.22, false);

-- Vento (km/h, convertido de m/s: wind_kmh = wind_ms * 3.6)
-- Exceção: último avalia wind_ms <= 1 diretamente (armazenado como 3.6 km/h)
INSERT INTO meia_vida_clima_mult (variavel, condicao, valor_min, valor_max, exposicao, multiplicador, ativo) VALUES
  ('vento', 'wind_kmh >= 40',                              40,   null, null, 0.75, true),
  ('vento', '20 <= wind_kmh < 40',                         20,   40,   null, 0.85, true),
  ('vento', '10.8 <= wind_kmh < 20 (~3 m/s)',              10.8, 20,   null, 0.92, true),
  ('vento', 'wind_ms <= 1 (wind_kmh <= 3.6)',              null, 3.6,  null, 1.05, true);

-- Combo: redução adicional aplicada quando calor + vento ocorrem juntos
INSERT INTO meia_vida_clima_mult (variavel, condicao, valor_min, valor_max, exposicao, multiplicador, ativo) VALUES
  ('combo', 'temp_c >= 30 AND wind_kmh >= 20 — reducao adicional', null, null, null, 0.80, true);

-- Nebulosidade (%)
INSERT INTO meia_vida_clima_mult (variavel, condicao, valor_min, valor_max, exposicao, multiplicador, ativo) VALUES
  ('nebulosidade', 'cloud_pct >= 90',      90,   null, null, 1.12, true),
  ('nebulosidade', '70 <= cloud_pct < 90', 70,   90,   null, 1.06, true),
  ('nebulosidade', 'cloud_pct <= 25',      null, 25,   null, 0.94, true);

-- Umidade (%)
INSERT INTO meia_vida_clima_mult (variavel, condicao, valor_min, valor_max, exposicao, multiplicador, ativo) VALUES
  ('umidade', 'humidity_pct >= 95',      95,   null, null, 1.15, true),
  ('umidade', '85 <= humidity_pct < 95', 85,   95,   null, 1.08, true),
  ('umidade', 'humidity_pct <= 45',      null, 45,   null, 0.93, true);

-- Bikepark: terra compactada + drenagem projetada — seca mais rapido que trilha natural
INSERT INTO meia_vida_clima_mult (variavel, condicao, valor_min, valor_max, exposicao, multiplicador, ativo) VALUES
  ('bikepark', 'trail_type == bikepark AND exposicao == fechada', null, null, 'fechada', 0.60, true),
  ('bikepark', 'trail_type == bikepark AND exposicao == aberta',  null, null, 'aberta',  0.35, true);


-- ──────────────────────────────────────────────────────────────
-- 2B: microclima_config
-- Fatores de retencao de umidade por bioma, altitude e exposicao
-- Substitui logica hardcoded em fator_microclima() e _meia_vida()
-- Avaliados em ordem de especificidade (mais restritivo primeiro)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS microclima_config (
  id              serial  PRIMARY KEY,
  bioma           text    NOT NULL,
  altitude_min    integer,           -- null = sem requisito de altitude
  exposicao       text,              -- null = qualquer
  mult_threshold  numeric NOT NULL,  -- fator retornado por fator_microclima()
  mult_meia_vida  numeric NOT NULL,  -- multiplicador aplicado na base em _meia_vida()
  ativo           boolean NOT NULL DEFAULT true
);

ALTER TABLE microclima_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "microclima_config_read_all" ON microclima_config FOR SELECT USING (true);

INSERT INTO microclima_config (bioma, altitude_min, exposicao, mult_threshold, mult_meia_vida, ativo) VALUES
  ('Mata Atlântica', 600, 'fechada', 0.75, 1.20, true),  -- orografia + dossel fechado = secagem muito mais lenta
  ('Mata Atlântica', null, null,     0.90, 1.10, true);  -- retencao geral da mata atlantica


-- ──────────────────────────────────────────────────────────────
-- 2C: configuracoes_sistema — INSERT apenas (tabela já existe)
-- Limites de _ajustar_meia_vida_clima(): max(4.0, min(72.0, meia_vida))
-- ──────────────────────────────────────────────────────────────
INSERT INTO configuracoes_sistema (chave, valor) VALUES
  ('meia_vida_min', '4'),
  ('meia_vida_max', '72')
ON CONFLICT (chave) DO NOTHING;
