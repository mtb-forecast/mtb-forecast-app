-- ============================================================
-- MTB FORECASTER — MIGRAÇÃO SOLO_TYPE
-- Gerado em: 2026-05-23
-- Referência: solo_name.xlsx
--
-- MAPEAMENTO FINAL:
--   ferro              → TerraFerrico
--   misto_mg           → TerraFerrico
--   preto              → TerraAltaMontanha
--   misto  >= 1500m    → TerraAltaMontanha
--   misto  <  1500m    → Terra
--   terra  >= 1500m    → TerraAltaMontanha
--   terra  Cerrado     → TerraCerrado
--   terra  <  400m     → TerraLitoral
--   terra  restante    → Terra
--   pedra              → Cascalho
-- ============================================================
-- ANÁLISE DE RISCO:
--   ✓ Sem foreign keys entre tabelas — sem cascade risk
--   ✓ Sem funções/triggers referenciando solo_type
--   ✓ Constraints apenas NOT NULL — qualquer string nova é aceita
--   ✓ RLS policies não filtram por solo_type
--   ⚠ condicoes/condicoes_pessoais/condicoes_strava: snapshot histórico — NÃO migrar
--   ⚠ trilhas_pendentes: 58 registros com solo_type NULL — não afetados
--   ⚠ aderencia_descricoes: UNIQUE(status, solo_type) — inserir antes de deletar
--   ⚠ meia_vida_secagem: UNIQUE(solo_type, exposicao) — inserir antes de deletar
--   ⚠ strava_segmentos_config: 7 registros terra → Terra
-- ============================================================
-- ORDEM DE EXECUÇÃO:
--   1. solo_type_config      (tabela mestre — inserir novos)
--   2. meia_vida_secagem     (depende de solo_type existir)
--   3. aderencia_descricoes  (depende de solo_type existir)
--   4. tabela_solo           (registros de textura)
--   5. trilhas               (UPDATE por altitude/bioma)
--   6. strava_segmentos_config
--   7. Desativar tipos antigos
-- ============================================================

BEGIN;

-- ============================================================
-- PASSO 1: solo_type_config — INSERIR novos tipos
-- ============================================================

INSERT INTO solo_type_config (solo_type, fator_absorcao_base, score_mult, ativo) VALUES
  ('TerraFerrico',       0.22, 0.88, true),
  ('TerraAltaMontanha',  0.72, 0.93, true),
  ('Terra',              0.62, 1.00, true),
  ('TerraCerrado',       0.82, 1.02, true),
  ('TerraLitoral',       0.75, 0.97, true),
  ('Cascalho',           0.25, 0.80, true);

-- ============================================================
-- PASSO 2: meia_vida_secagem — INSERIR novos tipos
-- ============================================================

INSERT INTO meia_vida_secagem (solo_type, exposicao, meia_vida_h) VALUES
  ('TerraFerrico',      'aberta',       6),
  ('TerraFerrico',      'fechada',     10),
  ('TerraFerrico',      'mista',        8),
  ('TerraFerrico',      'semi-aberta',  8),
  ('TerraAltaMontanha', 'aberta',      20),
  ('TerraAltaMontanha', 'fechada',     38),
  ('TerraAltaMontanha', 'mista',       29),
  ('TerraAltaMontanha', 'semi-aberta', 29),
  ('Terra',             'aberta',      16),
  ('Terra',             'fechada',     26),
  ('Terra',             'mista',       21),
  ('Terra',             'semi-aberta', 21),
  ('TerraCerrado',      'aberta',      26),
  ('TerraCerrado',      'fechada',     40),
  ('TerraCerrado',      'mista',       33),
  ('TerraCerrado',      'semi-aberta', 33),
  ('TerraLitoral',      'aberta',      22),
  ('TerraLitoral',      'fechada',     34),
  ('TerraLitoral',      'mista',       28),
  ('TerraLitoral',      'semi-aberta', 28),
  ('Cascalho',          'aberta',       6),
  ('Cascalho',          'fechada',     10),
  ('Cascalho',          'mista',        8),
  ('Cascalho',          'semi-aberta',  8);

-- ============================================================
-- PASSO 3: aderencia_descricoes — INSERIR novos textos
-- ============================================================

INSERT INTO aderencia_descricoes (solo_type, status, texto, ativo) VALUES
  -- TerraFerrico — latossolo_ferrico — Quadrilátero Ferrífero MG
  ('TerraFerrico', 'SECO',            'Terra Ferrico seca. Grip firme sobre a canga — aderência excelente.', true),
  ('TerraFerrico', 'GRIP PERFEITO',   'Terra Ferrico levemente úmida. Canga úmida oferece grip superior.', true),
  ('TerraFerrico', 'BOA ADERÊNCIA',   'Terra Ferrico úmida. Drena rápido, mas superfícies ferrosas podem ficar traiçoeiras.', true),
  ('TerraFerrico', 'BAIXA ADERÊNCIA', 'Terra Ferrico encharcada — canga lisa e imprevisível. Alto risco em curvas.', true),

  -- TerraAltaMontanha — cambissolo_humico — altitude >1500m / PR encosta
  ('TerraAltaMontanha', 'SECO',            'Terra Alta de Montanha seca. Solo orgânico de altitude com boa aderência.', true),
  ('TerraAltaMontanha', 'GRIP PERFEITO',   'Terra Alta de Montanha levemente úmida. Condição ideal — grip perfeito na terra escura.', true),
  ('TerraAltaMontanha', 'BOA ADERÊNCIA',   'Terra Alta de Montanha úmida. Retém umidade por mais tempo — atenção nas frenagens.', true),
  ('TerraAltaMontanha', 'BAIXA ADERÊNCIA', 'Terra Alta de Montanha encharcada. Solo orgânico muito liso — alto risco em curvas e apoios.', true),

  -- Terra — latossolo_vam — Mantiqueira / planalto SP 400-1499m
  ('Terra', 'SECO',            'Terra seca. Boa aderência para DH e Enduro.', true),
  ('Terra', 'GRIP PERFEITO',   'Terra levemente úmida. Grip excelente — condição favorável.', true),
  ('Terra', 'BOA ADERÊNCIA',   'Terra úmida. Perda parcial de tração — freios exigem antecipação.', true),
  ('Terra', 'BAIXA ADERÊNCIA', 'Terra encharcada. Lama vermelha — alto risco em curvas e descidas.', true),

  -- TerraCerrado — latossolo_vermelho — Cerrado SP
  ('TerraCerrado', 'SECO',            'Terra Cerrado seca. Solo argiloso com grip firme.', true),
  ('TerraCerrado', 'GRIP PERFEITO',   'Terra Cerrado levemente úmida. Alta argila oferece grip excelente.', true),
  ('TerraCerrado', 'BOA ADERÊNCIA',   'Terra Cerrado úmida. Argila densa — perda de tração gradual.', true),
  ('TerraCerrado', 'BAIXA ADERÊNCIA', 'Terra Cerrado encharcada. Lama densa e aderente — risco alto.', true),

  -- TerraLitoral — argissolo_vam — baixada costeira SC/SP <400m
  ('TerraLitoral', 'SECO',            'Terra Litoral seca. Boa aderência no solo costeiro.', true),
  ('TerraLitoral', 'GRIP PERFEITO',   'Terra Litoral levemente úmida. Boa tração — aproveite antes da próxima chuva.', true),
  ('TerraLitoral', 'BOA ADERÊNCIA',   'Terra Litoral úmida. Solo de baixada retém água — atenção em trechos planos e frenagens.', true),
  ('TerraLitoral', 'BAIXA ADERÊNCIA', 'Terra Litoral encharcada. Solo costeiro saturado — risco elevado de lama e travamento de pneu.', true),

  -- Cascalho — Cascalhentos — rocha exposta
  ('Cascalho', 'SECO',            'Cascalho seco. Boa aderência sobre pedra e cascalho.', true),
  ('Cascalho', 'GRIP PERFEITO',   'Cascalho levemente úmido. Alta aderência — grip perfeito.', true),
  ('Cascalho', 'BOA ADERÊNCIA',   'Cascalho molhado. Risco de escorregamento em curvas e frenagens.', true),
  ('Cascalho', 'BAIXA ADERÊNCIA', 'Cascalho encharcado. Pedras molhadas — escorregamento elevado e pouca margem de erro.', true);

-- ============================================================
-- PASSO 4: tabela_solo — INSERIR novos registros
-- ============================================================

INSERT INTO tabela_solo (solo_type, bioma, regiao, clay_pct, sand_pct, texture_class) VALUES
  ('TerraFerrico',      'Mata Atlântica', 'MG', 12, 58, 'Franco-arenoso'),
  ('TerraFerrico',      'Mata Atlântica', 'MG', 15, 55, 'Franco-arenoso'),
  ('Terra',             'Mata Atlântica', 'MG', 38, 32, 'Franco-argiloso'),
  ('Terra',             'Mata Atlântica', 'SP', 38, 32, 'Franco-argiloso'),
  ('Terra',             'Mata Atlântica', 'SP', 40, 30, 'Argiloso'),
  ('Terra',             'Mata Atlântica', 'PR', 40, 30, 'Argiloso'),
  ('TerraAltaMontanha', 'Mata Atlântica', 'SP', 42, 22, 'Argiloso'),
  ('TerraAltaMontanha', 'Mata Atlântica', 'MG', 42, 22, 'Argiloso'),
  ('TerraAltaMontanha', 'Mata Atlântica', 'PR', 45, 22, 'Argiloso'),
  ('TerraLitoral',      'Mata Atlântica', 'SC', 30, 42, 'Franco-argiloso'),
  ('TerraLitoral',      'Mata Atlântica', 'SP', 35, 38, 'Franco-argiloso'),
  ('TerraCerrado',      'Cerrado',        'SP', 52, 20, 'Muito argiloso'),
  ('Cascalho',          'Mata Atlântica', 'SP',  5, 80, 'Rocha exposta'),
  ('Cascalho',          'Mata Atlântica', 'MG',  5, 80, 'Rocha exposta'),
  ('Cascalho',          'Mata Atlântica', 'SC',  5, 80, 'Rocha exposta');

-- ============================================================
-- PASSO 5: trilhas — UPDATE solo_type
-- Ordem importa: mais específico primeiro
-- ============================================================

-- 5a. ferro → TerraFerrico
UPDATE trilhas SET solo_type = 'TerraFerrico'
WHERE solo_type = 'ferro';

-- 5b. misto_mg → TerraFerrico
UPDATE trilhas SET solo_type = 'TerraFerrico'
WHERE solo_type = 'misto_mg';

-- 5c. preto → TerraAltaMontanha
UPDATE trilhas SET solo_type = 'TerraAltaMontanha'
WHERE solo_type = 'preto';

-- 5d. misto altitude >= 1500m → TerraAltaMontanha
UPDATE trilhas SET solo_type = 'TerraAltaMontanha'
WHERE solo_type = 'misto' AND altitude_m >= 1500;

-- 5e. misto altitude < 1500m → Terra
UPDATE trilhas SET solo_type = 'Terra'
WHERE solo_type = 'misto' AND altitude_m < 1500;

-- 5f. terra altitude >= 1500m → TerraAltaMontanha
UPDATE trilhas SET solo_type = 'TerraAltaMontanha'
WHERE solo_type = 'terra' AND altitude_m >= 1500;

-- 5g. terra Cerrado → TerraCerrado
UPDATE trilhas SET solo_type = 'TerraCerrado'
WHERE solo_type = 'terra' AND bioma = 'Cerrado';

-- 5h. terra altitude < 400m → TerraLitoral
UPDATE trilhas SET solo_type = 'TerraLitoral'
WHERE solo_type = 'terra' AND altitude_m < 400;

-- 5i. terra restante → Terra
UPDATE trilhas SET solo_type = 'Terra'
WHERE solo_type = 'terra';

-- ============================================================
-- PASSO 6: strava_segmentos_config
-- Tabela removida manualmente da producao apos esta migration rodar
-- (nunca teve CREATE TABLE versionado, nao existe mais nem e referenciada
-- em nenhum codigo atual). Guard evita quebrar replay do zero em Preview
-- Branch, onde ela nunca chega a existir.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'strava_segmentos_config') THEN
    UPDATE strava_segmentos_config SET solo_type = 'Terra' WHERE solo_type = 'terra';
  END IF;
END$$;

-- ============================================================
-- PASSO 7: solo_type_config — desativar tipos antigos
-- Mantidos no banco para histórico de condicoes
-- ============================================================

UPDATE solo_type_config SET ativo = false
WHERE solo_type IN ('ferro', 'misto', 'misto_mg', 'preto', 'terra', 'pedra');

-- ============================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO
-- Descomentar e rodar após COMMIT para confirmar
-- ============================================================
-- SELECT solo_type, count(*) FROM trilhas GROUP BY solo_type ORDER BY solo_type;
-- SELECT solo_type, count(*) FROM tabela_solo GROUP BY solo_type ORDER BY solo_type;
-- SELECT solo_type, ativo FROM solo_type_config ORDER BY ativo DESC, solo_type;
-- SELECT solo_type, count(*) FROM meia_vida_secagem GROUP BY solo_type ORDER BY solo_type;
-- SELECT solo_type, count(*) FROM aderencia_descricoes GROUP BY solo_type ORDER BY solo_type;
-- SELECT solo_type, count(*) FROM strava_segmentos_config GROUP BY solo_type;

COMMIT;
