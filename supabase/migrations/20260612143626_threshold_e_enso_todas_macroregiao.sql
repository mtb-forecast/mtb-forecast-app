
-- ══════════════════════════════════════════════════════════════
-- threshold_sazonal: 5 macro-regiões + SUDESTE e SUL consolidados
-- ══════════════════════════════════════════════════════════════

-- SUDESTE (igual ao DEFAULT/SP — base de calibração)
INSERT INTO threshold_sazonal (regiao, mes, threshold_descansado, threshold_saturado) VALUES
  ('SUDESTE',1,3.0,7.0),('SUDESTE',2,2.0,6.0),('SUDESTE',3,3.0,7.0),
  ('SUDESTE',4,5.0,10.0),('SUDESTE',5,6.0,12.0),('SUDESTE',6,8.0,15.0),
  ('SUDESTE',7,8.0,15.0),('SUDESTE',8,8.0,15.0),('SUDESTE',9,8.0,15.0),
  ('SUDESTE',10,5.0,10.0),('SUDESTE',11,4.0,9.0),('SUDESTE',12,3.0,7.0)
ON CONFLICT (regiao, mes) DO NOTHING;

-- SUL (média de SC/RS/PR — já existem por UF, macro serve como fallback)
INSERT INTO threshold_sazonal (regiao, mes, threshold_descansado, threshold_saturado) VALUES
  ('SUL',1,3.0,7.5),('SUL',2,2.5,7.0),('SUL',3,3.0,7.5),
  ('SUL',4,5.0,10.5),('SUL',5,6.5,12.5),('SUL',6,8.5,15.0),
  ('SUL',7,8.5,15.0),('SUL',8,8.5,15.0),('SUL',9,7.5,14.0),
  ('SUL',10,5.0,10.5),('SUL',11,4.0,9.5),('SUL',12,3.0,7.5)
ON CONFLICT (regiao, mes) DO NOTHING;

-- NORTE (+25% umidade — chuva ano todo, solo satura com menos mm)
-- Threshold MENOR: menos chuva já torna trilha impraticável
INSERT INTO threshold_sazonal (regiao, mes, threshold_descansado, threshold_saturado) VALUES
  ('NORTE',1,2.0,5.0),('NORTE',2,1.5,4.5),('NORTE',3,2.0,5.0),
  ('NORTE',4,3.5,7.5),('NORTE',5,4.5,9.0),('NORTE',6,6.0,11.0),
  ('NORTE',7,6.0,11.0),('NORTE',8,6.0,11.0),('NORTE',9,6.0,11.0),
  ('NORTE',10,3.5,7.5),('NORTE',11,3.0,7.0),('NORTE',12,2.0,5.0)
ON CONFLICT (regiao, mes) DO NOTHING;

-- NORDESTE (semi-árido — threshold MAIOR: solo seca rápido, aguenta mais chuva)
-- Sazonalidade: chuvas concentradas fev-abr; jun-jan muito seco
INSERT INTO threshold_sazonal (regiao, mes, threshold_descansado, threshold_saturado) VALUES
  ('NORDESTE',1,4.0,10.0),('NORDESTE',2,3.0,8.0),('NORDESTE',3,4.0,10.0),
  ('NORDESTE',4,7.0,14.0),('NORDESTE',5,8.5,17.0),('NORDESTE',6,11.0,21.0),
  ('NORDESTE',7,11.0,21.0),('NORDESTE',8,11.0,21.0),('NORDESTE',9,11.0,21.0),
  ('NORDESTE',10,7.0,14.0),('NORDESTE',11,5.5,12.5),('NORDESTE',12,4.0,10.0)
ON CONFLICT (regiao, mes) DO NOTHING;

-- CENTRO-OESTE (Cerrado — seca intensa mai-set, threshold MAIOR no seco)
INSERT INTO threshold_sazonal (regiao, mes, threshold_descansado, threshold_saturado) VALUES
  ('CENTRO-OESTE',1,3.0,8.0),('CENTRO-OESTE',2,2.0,7.0),('CENTRO-OESTE',3,3.0,8.0),
  ('CENTRO-OESTE',4,5.0,11.0),('CENTRO-OESTE',5,7.0,14.0),('CENTRO-OESTE',6,10.0,18.0),
  ('CENTRO-OESTE',7,10.0,18.0),('CENTRO-OESTE',8,10.0,18.0),('CENTRO-OESTE',9,9.5,17.0),
  ('CENTRO-OESTE',10,5.5,11.0),('CENTRO-OESTE',11,4.5,10.0),('CENTRO-OESTE',12,3.0,8.0)
ON CONFLICT (regiao, mes) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- enso_regional_mult: NORTE, NORDESTE, CENTRO-OESTE
-- Lógica INVERSA ao SUL: El Niño → seca → threshold SOBE (mult > 1)
--                         La Niña → chuva → threshold DESCE (mult < 1)
-- ══════════════════════════════════════════════════════════════
INSERT INTO enso_regional_mult (fase, regiao, multiplicador) VALUES
  -- NORTE: El Niño traz seca amazônica severa; La Niña inunda
  ('el_nino_forte', 'NORTE', 1.25),
  ('el_nino',       'NORTE', 1.18),
  ('neutro',        'NORTE', 1.00),
  ('la_nina',       'NORTE', 0.85),
  ('la_nina_forte', 'NORTE', 0.75),

  -- NORDESTE: El Niño = seca extrema (fenômeno bem documentado)
  ('el_nino_forte', 'NORDESTE', 1.35),
  ('el_nino',       'NORDESTE', 1.25),
  ('neutro',        'NORDESTE', 1.00),
  ('la_nina',       'NORDESTE', 0.80),
  ('la_nina_forte', 'NORDESTE', 0.70),

  -- CENTRO-OESTE: efeito moderado
  ('el_nino_forte', 'CENTRO-OESTE', 1.12),
  ('el_nino',       'CENTRO-OESTE', 1.08),
  ('neutro',        'CENTRO-OESTE', 1.00),
  ('la_nina',       'CENTRO-OESTE', 0.92),
  ('la_nina_forte', 'CENTRO-OESTE', 0.88)
ON CONFLICT (fase, regiao) DO NOTHING;
