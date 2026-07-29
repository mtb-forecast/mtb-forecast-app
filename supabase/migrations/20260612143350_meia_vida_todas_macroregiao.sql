
-- NORTE (+55%): Amazônia — umidade permanente, secagem muito lenta
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra',    'fechada', 'NORTE', 56), ('terra',    'aberta',  'NORTE', 37), ('terra',    'mista',   'NORTE', 47),
  ('misto',    'fechada', 'NORTE', 43), ('misto',    'aberta',  'NORTE', 28), ('misto',    'mista',   'NORTE', 36),
  ('preto',    'fechada', 'NORTE', 37), ('preto',    'aberta',  'NORTE', 22), ('preto',    'mista',   'NORTE', 29),
  ('ferro',    'fechada', 'NORTE', 22), ('ferro',    'aberta',  'NORTE', 12), ('ferro',    'mista',   'NORTE', 17),
  ('misto_mg', 'fechada', 'NORTE', 28), ('misto_mg', 'aberta',  'NORTE', 19), ('misto_mg', 'mista',   'NORTE', 23),
  ('pedra',    'fechada', 'NORTE', 16), ('pedra',    'aberta',  'NORTE',  9), ('pedra',    'mista',   'NORTE', 12)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- NORDESTE (-35%): Semi-árido — calor + vento + baixa umidade, secagem rápida
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra',    'fechada', 'NORDESTE', 23), ('terra',    'aberta',  'NORDESTE', 16), ('terra',    'mista',   'NORDESTE', 20),
  ('misto',    'fechada', 'NORDESTE', 18), ('misto',    'aberta',  'NORDESTE', 12), ('misto',    'mista',   'NORDESTE', 15),
  ('preto',    'fechada', 'NORDESTE', 16), ('preto',    'aberta',  'NORDESTE',  9), ('preto',    'mista',   'NORDESTE', 12),
  ('ferro',    'fechada', 'NORDESTE',  9), ('ferro',    'aberta',  'NORDESTE',  5), ('ferro',    'mista',   'NORDESTE',  7),
  ('misto_mg', 'fechada', 'NORDESTE', 12), ('misto_mg', 'aberta',  'NORDESTE',  8), ('misto_mg', 'mista',   'NORDESTE', 10),
  ('pedra',    'fechada', 'NORDESTE',  7), ('pedra',    'aberta',  'NORDESTE',  4), ('pedra',    'mista',   'NORDESTE',  5)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- CENTRO-OESTE (-15%): Cerrado — estação seca acentuada jun-set
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra',    'fechada', 'CENTRO-OESTE', 31), ('terra',    'aberta',  'CENTRO-OESTE', 20), ('terra',    'mista',   'CENTRO-OESTE', 26),
  ('misto',    'fechada', 'CENTRO-OESTE', 24), ('misto',    'aberta',  'CENTRO-OESTE', 15), ('misto',    'mista',   'CENTRO-OESTE', 20),
  ('preto',    'fechada', 'CENTRO-OESTE', 20), ('preto',    'aberta',  'CENTRO-OESTE', 12), ('preto',    'mista',   'CENTRO-OESTE', 16),
  ('ferro',    'fechada', 'CENTRO-OESTE', 12), ('ferro',    'aberta',  'CENTRO-OESTE',  7), ('ferro',    'mista',   'CENTRO-OESTE',  9),
  ('misto_mg', 'fechada', 'CENTRO-OESTE', 15), ('misto_mg', 'aberta',  'CENTRO-OESTE', 10), ('misto_mg', 'mista',   'CENTRO-OESTE', 13),
  ('pedra',    'fechada', 'CENTRO-OESTE',  9), ('pedra',    'aberta',  'CENTRO-OESTE',  5), ('pedra',    'mista',   'CENTRO-OESTE',  7)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;
