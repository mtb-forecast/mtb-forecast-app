-- =============================================================
-- FASE 5: Consolidação de schema — clareza e manutenibilidade
-- Branch: develop
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 5A: veredicto_risco_pesos → veredicto_pesos + veredicto_limiares
-- Separação de dois conceitos que viviam na mesma tabela com
-- colunas nulláveis como seletor de tipo.
-- O campo condicao era documentação pura — nunca lido pelo código.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS veredicto_pesos (
  id    serial  PRIMARY KEY,
  fator text    NOT NULL UNIQUE,
  peso  integer NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

ALTER TABLE veredicto_pesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "veredicto_pesos_read_all" ON veredicto_pesos FOR SELECT USING (true);

INSERT INTO veredicto_pesos (fator, peso, ativo) VALUES
  ('aderencia_baixa',       3, true),
  ('aderencia_boa',         2, true),
  ('aderencia_grip',        1, true),
  ('pico_3h_muito_alto',    2, true),
  ('pico_3h_alto',          1, true),
  ('rain_alto',             1, true),
  ('vento_alto',            1, true),
  ('inclinacao_alta',       2, true),
  ('inclinacao_media',      1, true),
  ('vento_estrutural_alto', 2, true),
  ('vento_estrutural_med',  1, true),
  ('solo_encharcado',       1, true);


CREATE TABLE IF NOT EXISTS veredicto_limiares (
  id              serial  PRIMARY KEY,
  limiar_max      integer NOT NULL,
  texto_veredicto text    NOT NULL,
  ordem           integer NOT NULL,
  ativo           boolean NOT NULL DEFAULT true
);

ALTER TABLE veredicto_limiares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "veredicto_limiares_read_all" ON veredicto_limiares FOR SELECT USING (true);

-- Avaliados em ordem crescente de limiar_max (risco <= limiar_max).
-- Risco > 3 → MELHOR ESPERAR (implícito, sem linha necessária).
INSERT INTO veredicto_limiares (limiar_max, texto_veredicto, ordem, ativo) VALUES
  (1, 'DROP LIBERADO',                   1, true),
  (3, 'DROP LIBERADO - Veja os alertas', 2, true);

DROP TABLE IF EXISTS veredicto_risco_pesos;


-- ──────────────────────────────────────────────────────────────
-- 5B: microclima_config — renomear colunas para semântica clara
-- mult_threshold era divisor (<1 = mais conservador) → fator_threshold
-- mult_meia_vida era multiplicador (>1 = seca mais devagar) → fator_secagem
-- ──────────────────────────────────────────────────────────────
ALTER TABLE microclima_config RENAME COLUMN mult_threshold TO fator_threshold;
ALTER TABLE microclima_config RENAME COLUMN mult_meia_vida TO fator_secagem;


-- ──────────────────────────────────────────────────────────────
-- 5C: inclinacao_config — renomear colunas
-- grau_min/grau_max são enganosos: para tipo='desnivel' a unidade é metros.
-- valor_min/valor_max reflete a realidade sem assumir unidade.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE inclinacao_config RENAME COLUMN grau_min TO valor_min;
ALTER TABLE inclinacao_config RENAME COLUMN grau_max TO valor_max;


-- ──────────────────────────────────────────────────────────────
-- 5D: meia_vida_clima_mult — remover condicao e dead code
-- condicao era documentação pura, nunca lida pelo código.
-- Linha ativo=false (temp<=10) é dead code — coberta pelo temp<=16.
-- ──────────────────────────────────────────────────────────────
DELETE FROM meia_vida_clima_mult WHERE ativo = false;
ALTER TABLE meia_vida_clima_mult DROP COLUMN IF EXISTS condicao;


-- ──────────────────────────────────────────────────────────────
-- 5E: aderencia_thresholds — remover campo ordem
-- ordem é redundante: os intervalos ef_min/ef_max já são
-- naturalmente ordenáveis por ef_min asc nulls first.
-- Manter ordem cria risco de inconsistência quando novas linhas
-- são inseridas com número errado.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE aderencia_thresholds DROP COLUMN IF EXISTS ordem;


-- ──────────────────────────────────────────────────────────────
-- 5F: solo_type_config — altitude_bonus → configuracoes_sistema
-- altitude_bonus_min e altitude_bonus são idênticos em todos os
-- 6 tipos de solo — não têm poder de calibração por tipo.
-- Movidos para configuracoes_sistema como constantes globais.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE solo_type_config DROP COLUMN IF EXISTS altitude_bonus_min;
ALTER TABLE solo_type_config DROP COLUMN IF EXISTS altitude_bonus;


-- ──────────────────────────────────────────────────────────────
-- 5G: score_config → configuracoes_sistema
-- Dois key-value stores sem distinção clara de responsabilidade.
-- Adiciona coluna grupo para categorizar e absorver score_config.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE configuracoes_sistema ADD COLUMN IF NOT EXISTS grupo text NOT NULL DEFAULT 'sistema';
ALTER TABLE configuracoes_sistema ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

UPDATE configuracoes_sistema SET grupo = 'secagem'  WHERE chave IN ('meia_vida_min', 'meia_vida_max');
UPDATE configuracoes_sistema SET grupo = 'aderencia' WHERE chave = 'aderencia_recovery_mult';

INSERT INTO configuracoes_sistema (chave, valor, grupo, ativo) VALUES
  ('altitude_bonus_min', '1200', 'solo', true),
  ('altitude_bonus',     '0.05', 'solo', true)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, grupo = EXCLUDED.grupo;

INSERT INTO configuracoes_sistema (chave, valor, grupo, ativo)
SELECT chave, valor::text, 'scoring', ativo
FROM score_config
ON CONFLICT (chave) DO UPDATE
  SET valor = EXCLUDED.valor, grupo = EXCLUDED.grupo;

DROP TABLE IF EXISTS score_config;


-- ──────────────────────────────────────────────────────────────
-- 5H: tabela_solo — sentinela "TODOS" → NULL
-- Padrão inconsistente com todas as outras tabelas que usam NULL
-- para "sem requisito". TODOS como string depende de convenção
-- Python, não de constraint de banco.
-- ATENÇÃO: ajuste o nome do índice único se diferente abaixo.
-- ──────────────────────────────────────────────────────────────
UPDATE tabela_solo SET bioma  = NULL WHERE bioma  = 'TODOS';
UPDATE tabela_solo SET regiao = NULL WHERE regiao = 'TODOS';

-- Recriar índice único com COALESCE para que NULL funcione como wildcard único.
-- Em PostgreSQL, NULL != NULL, então dois NULLs seriam tratados como distintos
-- sem COALESCE — o que permitiria duplicatas indesejadas.
DROP INDEX IF EXISTS tabela_solo_solo_type_bioma_regiao_key;
DROP INDEX IF EXISTS tabela_solo_unique_idx;
CREATE UNIQUE INDEX tabela_solo_unique_idx
  ON tabela_solo (solo_type, COALESCE(bioma, ''), COALESCE(regiao, ''));
