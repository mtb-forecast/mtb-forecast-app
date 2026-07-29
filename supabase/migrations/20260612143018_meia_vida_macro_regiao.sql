
-- 1. Remove entradas por UF (SP/MG/RJ/ES/PR/SC/RS) — mantém só 'DEFAULT'
DELETE FROM meia_vida_secagem WHERE regiao IN ('SP','MG','RJ','ES','PR','SC','RS');

-- 2. Remove entradas por UF do ENSO regional
DELETE FROM enso_regional_mult WHERE regiao IN ('SC','RS','PR');

-- 3. Insere SUDESTE (mesmos valores do DEFAULT — SP/MG/RJ/ES têm comportamento idêntico)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','SUDESTE',36),('terra','aberta','SUDESTE',24),('terra','mista','SUDESTE',30),
  ('misto','fechada','SUDESTE',28),('misto','aberta','SUDESTE',18),('misto','mista','SUDESTE',23),
  ('preto','fechada','SUDESTE',24),('preto','aberta','SUDESTE',14),('preto','mista','SUDESTE',19),
  ('ferro','fechada','SUDESTE',14),('ferro','aberta','SUDESTE',8), ('ferro','mista','SUDESTE',11),
  ('misto_mg','fechada','SUDESTE',18),('misto_mg','aberta','SUDESTE',12),('misto_mg','mista','SUDESTE',15),
  ('pedra','fechada','SUDESTE',10),('pedra','aberta','SUDESTE',6), ('pedra','mista','SUDESTE',8)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 4. Insere SUL (+28% médio entre PR/SC/RS — PR=+17%, SC=+25%, RS=+33%)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','SUL',46),('terra','aberta','SUL',31),('terra','mista','SUL',39),
  ('misto','fechada','SUL',36),('misto','aberta','SUL',23),('misto','mista','SUL',30),
  ('preto','fechada','SUL',31),('preto','aberta','SUL',18),('preto','mista','SUL',25),
  ('ferro','fechada','SUL',18),('ferro','aberta','SUL',10),('ferro','mista','SUL',14),
  ('misto_mg','fechada','SUL',23),('misto_mg','aberta','SUL',15),('misto_mg','mista','SUL',20),
  ('pedra','fechada','SUL',13),('pedra','aberta','SUL',8), ('pedra','mista','SUL',10)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 5. Insere ENSO SUL (médio entre SC/RS/PR)
INSERT INTO enso_regional_mult (fase, regiao, multiplicador) VALUES
  ('el_nino_forte', 'SUL', 0.69),
  ('el_nino',       'SUL', 0.79),
  ('neutro',        'SUL', 1.00),
  ('la_nina',       'SUL', 1.22),
  ('la_nina_forte', 'SUL', 1.37)
ON CONFLICT (fase, regiao) DO NOTHING;
