-- =============================================================
-- FASE 4: Limpeza de fallbacks — aderencia_descricoes
-- INSERT: configuracoes_sistema (tabela já existe)
-- Branch: develop
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 4A: aderencia_descricoes
-- 24 textos de _descricao_aderencia() + 1 texto bikepark saturado
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aderencia_descricoes (
  id        serial  PRIMARY KEY,
  status    text    NOT NULL,
  solo_type text    NOT NULL,
  texto     text    NOT NULL,
  ativo     boolean NOT NULL DEFAULT true,
  UNIQUE(status, solo_type)
);

ALTER TABLE aderencia_descricoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aderencia_descricoes_read_all" ON aderencia_descricoes FOR SELECT USING (true);

INSERT INTO aderencia_descricoes (status, solo_type, texto, ativo) VALUES
  -- SECO
  ('SECO',              'terra',    'Solo seco. Boa aderência para DH e Enduro.',                                                                   true),
  ('SECO',              'misto',    'Solo seco. Boa aderência para DH e Enduro.',                                                                   true),
  ('SECO',              'misto_mg', 'Solo seco. Mistura de terra e minério oferece boa aderência.',                                                  true),
  ('SECO',              'preto',    'Solo seco. Terra preta oferece boa aderência.',                                                                 true),
  ('SECO',              'pedra',    'Solo seco. Boa aderência sobre rocha.',                                                                        true),
  ('SECO',              'ferro',    'Solo ferruginoso seco. Aderência excelente — grip firme sobre o minério.',                                     true),
  -- GRIP PERFEITO
  ('GRIP PERFEITO',     'terra',    'Solo levemente úmido. Alta aderência — grip perfeito para DH e Enduro.',                                      true),
  ('GRIP PERFEITO',     'misto',    'Solo levemente úmido. Grip excelente nos trechos de terra e pedra.',                                          true),
  ('GRIP PERFEITO',     'misto_mg', 'Solo levemente úmido. Minério úmido melhora o grip — condição favorável.',                                    true),
  ('GRIP PERFEITO',     'preto',    'Terra preta levemente úmida. Grip perfeito — condição ideal.',                                                true),
  ('GRIP PERFEITO',     'pedra',    'Rocha levemente úmida. Alta aderência — grip perfeito.',                                                      true),
  ('GRIP PERFEITO',     'ferro',    'Solo ferruginoso levemente úmido. Grip excelente — minério úmido oferece boa tração.',                        true),
  -- BOA ADERÊNCIA
  ('BOA ADERÊNCIA',     'terra',    'Solo úmido. Perda parcial de tração. Freios exigem antecipação.',                                             true),
  ('BOA ADERÊNCIA',     'misto',    'Solo úmido. Trechos de terra com perda de tração.',                                                           true),
  ('BOA ADERÊNCIA',     'misto_mg', 'Solo úmido. Trechos de terra com perda de tração — minério retém menos água mas atenção na lama.',            true),
  ('BOA ADERÊNCIA',     'preto',    'Terra preta úmida. Aderência reduzida, especialmente na frenagem.',                                           true),
  ('BOA ADERÊNCIA',     'pedra',    'Rocha molhada. Risco de escorregamento em curvas e frenagens.',                                               true),
  ('BOA ADERÊNCIA',     'ferro',    'Solo ferruginoso úmido. Drena rápido, mas o minério molhado pode ficar traiçoeiro.',                          true),
  -- BAIXA ADERÊNCIA
  ('BAIXA ADERÊNCIA',   'terra',    'Solo encharcado. Lama e poças — alto risco em curvas e descidas.',                                            true),
  ('BAIXA ADERÊNCIA',   'misto',    'Trechos encharcados com lama. Atenção máxima nas seções de terra.',                                           true),
  ('BAIXA ADERÊNCIA',   'misto_mg', 'Solo encharcado. Terra misturada ao minério forma lama — alto risco em curvas e descidas.',                   true),
  ('BAIXA ADERÊNCIA',   'preto',    'Terra preta encharcada. Solo muito liso e instável — alto risco em curvas e frenagens.',                      true),
  ('BAIXA ADERÊNCIA',   'pedra',    'Rocha bem molhada. Sem lama, mas com escorregamento elevado e pouca margem de erro.',                         true),
  ('BAIXA ADERÊNCIA',   'ferro',    'Solo ferruginoso muito molhado. Minério liso e imprevisível — alto risco em curvas e apoios.',                true),
  -- Bikepark saturado — avaliado antes do lookup por status/solo_type
  ('BIKEPARK_SATURADO', 'default',  'Bike park saturado. Drenagem insuficiente para o volume acumulado — risco de lama, valetas e perda de tração.', true);


-- ──────────────────────────────────────────────────────────────
-- 4B: configuracoes_sistema — INSERT apenas (tabela já existe)
-- Multiplicador do fator de recuperacao de aderencia:
--   acumulo_ef < thresh_local * aderencia_recovery_mult → rebaixa BAIXA para BOA
-- ──────────────────────────────────────────────────────────────
INSERT INTO configuracoes_sistema (chave, valor) VALUES
  ('aderencia_recovery_mult', '2.5')
ON CONFLICT (chave) DO NOTHING;
