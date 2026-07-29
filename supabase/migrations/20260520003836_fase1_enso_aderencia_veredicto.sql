-- =============================================================
-- FASE 1: Migração de dados hardcoded para Supabase
-- Tabelas: enso_config, aderencia_thresholds, veredicto_risco_pesos
-- Branch: develop
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1A: enso_config
-- Multiplicadores ONI que substituem classificar_enso() hardcoded
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enso_config (
  id            serial PRIMARY KEY,
  fase          text    NOT NULL,          -- ex: 'el_nino_forte'
  oni_min       numeric,                   -- null = sem limite inferior
  oni_max       numeric,                   -- null = sem limite superior
  multiplicador numeric NOT NULL,          -- fator sobre threshold sazonal
  emoji         text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE enso_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enso_config_read_all" ON enso_config FOR SELECT USING (true);

-- A ordem das fases importa para o lookup: mais restritiva primeiro
INSERT INTO enso_config (fase, oni_min, oni_max, multiplicador, emoji, ativo) VALUES
  ('el_nino_forte', 1.5,   null,  0.75, '🔥',  true),
  ('el_nino',       0.5,   1.5,   0.85, '☀️',  true),
  ('neutro',       -0.5,   0.5,   1.00, '🌤️', true),
  ('la_nina',      -1.5,  -0.5,   1.15, '🌧️', true),
  ('la_nina_forte', null, -1.5,   1.25, '⛈️', true);


-- ──────────────────────────────────────────────────────────────
-- 1B: aderencia_thresholds
-- Limites de ef_combinado que substituem os ifs hardcoded em calcular_aderencia()
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aderencia_thresholds (
  id      serial  PRIMARY KEY,
  status  text    NOT NULL,   -- 'SECO', 'GRIP PERFEITO', 'BOA ADERÊNCIA', 'BAIXA ADERÊNCIA'
  ef_min  numeric,            -- null = sem limite inferior (desde 0)
  ef_max  numeric,            -- null = sem limite superior
  ordem   integer NOT NULL,   -- ordem de avaliação ascendente
  ativo   boolean NOT NULL DEFAULT true
);

ALTER TABLE aderencia_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aderencia_thresholds_read_all" ON aderencia_thresholds FOR SELECT USING (true);

INSERT INTO aderencia_thresholds (status, ef_min, ef_max, ordem, ativo) VALUES
  ('SECO',            null, 0.0,  1, true),
  ('GRIP PERFEITO',   0.0,  5.0,  2, true),
  ('BOA ADERÊNCIA',   5.0,  7.0,  3, true),
  ('BAIXA ADERÊNCIA', 7.0,  null, 4, true);


-- ──────────────────────────────────────────────────────────────
-- 1C: veredicto_risco_pesos
-- Pesos e limiares que substituem os ifs hardcoded em veredicto()
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS veredicto_risco_pesos (
  id              serial PRIMARY KEY,
  fator           text    NOT NULL,  -- identificador do fator de risco
  condicao        text    NOT NULL,  -- documentação da condição (não executada em SQL)
  peso            integer,           -- pontos adicionados ao risco; null para limiares de decisão
  limiar_max      integer,           -- usado só pelos registros de decisão final
  texto_veredicto text,              -- null para pesos; texto do veredicto para limiares
  ativo           boolean NOT NULL DEFAULT true
);

ALTER TABLE veredicto_risco_pesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "veredicto_risco_pesos_read_all" ON veredicto_risco_pesos FOR SELECT USING (true);

-- Pesos de risco
INSERT INTO veredicto_risco_pesos (fator, condicao, peso, limiar_max, texto_veredicto, ativo) VALUES
  ('aderencia_baixa',       'aderencia == BAIXA ADERÊNCIA',                              3, null, null, true),
  ('aderencia_boa',         'aderencia == BOA ADERÊNCIA',                                2, null, null, true),
  ('aderencia_grip',        'aderencia == GRIP PERFEITO',                                1, null, null, true),
  ('pico_3h_muito_alto',    'pico_3h >= 15',                                             2, null, null, true),
  ('pico_3h_alto',          'pico_3h >= 10',                                             1, null, null, true),
  ('rain_alto',             'rain_mm >= 8',                                              1, null, null, true),
  ('vento_alto',            'wind_ms >= 12',                                             1, null, null, true),
  ('inclinacao_alta',       'inclinacao > 30',                                           2, null, null, true),
  ('inclinacao_media',      'inclinacao > 20',                                           1, null, null, true),
  ('vento_estrutural_alto', 'gust_max_kmh > 90',                                        2, null, null, true),
  ('vento_estrutural_med',  'gust_max_kmh > 65',                                        1, null, null, true),
  ('solo_encharcado',       'solo_descansado == false AND aderencia == BAIXA ADERÊNCIA', 1, null, null, true);

-- Limiares de decisão final (risco → texto do veredicto)
INSERT INTO veredicto_risco_pesos (fator, condicao, peso, limiar_max, texto_veredicto, ativo) VALUES
  ('limiar_liberado', 'risco <= limiar_max', null, 1, 'DROP LIBERADO',                   true),
  ('limiar_alertas',  'risco <= limiar_max', null, 3, 'DROP LIBERADO - Veja os alertas', true),
  ('limiar_esperar',  'risco > limiar_max',  null, 3, 'MELHOR ESPERAR',                  true);
