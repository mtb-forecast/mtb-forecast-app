-- Tabela única de biomas: fonte de verdade para coeficientes de dossel,
-- sazonalidade e ajuste de threshold de grip.
-- Substitui microclima_config no Python (tabela mantida por conservadorismo).

CREATE TABLE IF NOT EXISTS biomas (
  id                   serial  PRIMARY KEY,
  bioma                text    NOT NULL,
  exposicao            text    NOT NULL,       -- 'aberta' | 'fechada'
  altitude_min         int     DEFAULT NULL,   -- NULL = qualquer altitude; 600 = só acima de 600m

  -- Coeficientes de dossel (Gemini / Penman-Monteith simplificado)
  chuva_pct            float   NOT NULL,       -- fração da chuva que chega ao solo (0–1)
  vento_pct            float   NOT NULL,       -- fração do vento ao nível do solo (0–1)
  sol_pct              float   NOT NULL,       -- fração da radiação solar ao solo (0–1)

  -- Sazonalidade: meses em que o dossel abre (Caatinga/Cerrado na seca)
  mes_sazonal_inicio   int     DEFAULT NULL,
  mes_sazonal_fim      int     DEFAULT NULL,
  chuva_pct_sazonal    float   DEFAULT NULL,
  vento_pct_sazonal    float   DEFAULT NULL,
  sol_pct_sazonal      float   DEFAULT NULL,

  -- Ajuste de grip threshold (ex-microclima_config.fator_threshold)
  fator_threshold      float   NOT NULL DEFAULT 1.0,

  ativo                boolean NOT NULL DEFAULT true
);

-- ── Trilhas ABERTAS ───────────────────────────────────────────────────────────
INSERT INTO biomas (bioma, exposicao, chuva_pct, vento_pct, sol_pct, fator_threshold) VALUES
  ('Amazônia',       'aberta', 0.965, 0.575, 0.800, 1.00),
  ('Mata Atlântica', 'aberta', 0.965, 0.600, 0.775, 0.90),
  ('Cerrado',        'aberta', 0.990, 0.850, 0.925, 1.00),
  ('Caatinga',       'aberta', 0.995, 0.900, 0.975, 1.00),
  ('Pantanal',       'aberta', 0.990, 0.800, 0.900, 1.00),
  ('Pampa',          'aberta', 0.990, 0.950, 0.940, 1.00);

-- ── Trilhas FECHADAS ──────────────────────────────────────────────────────────
INSERT INTO biomas (bioma, exposicao, altitude_min, chuva_pct, vento_pct, sol_pct, fator_threshold) VALUES
  ('Amazônia',       'fechada', NULL, 0.175, 0.100, 0.020, 1.00),
  ('Mata Atlântica', 'fechada', NULL, 0.225, 0.125, 0.035, 0.90),
  ('Mata Atlântica', 'fechada', 600,  0.180, 0.100, 0.025, 0.50),
  ('Cerrado',        'fechada', NULL, 0.500, 0.275, 0.175, 1.00),
  ('Caatinga',       'fechada', NULL, 0.600, 0.325, 0.225, 1.00),
  ('Pantanal',       'fechada', NULL, 0.400, 0.175, 0.100, 1.00),
  ('Pampa',          'fechada', NULL, 0.450, 0.225, 0.140, 1.00);

-- ── Sazonalidade: Cerrado fechado (abr–set) ───────────────────────────────────
UPDATE biomas SET
  mes_sazonal_inicio = 4,  mes_sazonal_fim = 9,
  chuva_pct_sazonal  = 0.75, vento_pct_sazonal = 0.55, sol_pct_sazonal = 0.45
WHERE bioma = 'Cerrado' AND exposicao = 'fechada' AND altitude_min IS NULL;

-- ── Sazonalidade: Caatinga fechada (jun–set) ──────────────────────────────────
UPDATE biomas SET
  mes_sazonal_inicio = 6,  mes_sazonal_fim = 9,
  chuva_pct_sazonal  = 0.85, vento_pct_sazonal = 0.65, sol_pct_sazonal = 0.55
WHERE bioma = 'Caatinga' AND exposicao = 'fechada' AND altitude_min IS NULL;
