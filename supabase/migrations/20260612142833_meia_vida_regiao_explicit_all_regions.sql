
-- 1. Dropar constraint antigo (solo_type, exposicao) que bloqueava inserções regionais
ALTER TABLE meia_vida_secagem
  DROP CONSTRAINT meia_vida_secagem_solo_type_exposicao_key;

-- 2. NULL → 'DEFAULT' nas 18 linhas globais
UPDATE meia_vida_secagem SET regiao = 'DEFAULT' WHERE regiao IS NULL;

-- 3. Novo constraint único inclui regiao
ALTER TABLE meia_vida_secagem
  ADD CONSTRAINT meia_vida_secagem_solo_expo_regiao_key
  UNIQUE (solo_type, exposicao, regiao);

-- 4. SP (mesmos valores do DEFAULT)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','SP',36),('terra','aberta','SP',24),('terra','mista','SP',30),
  ('misto','fechada','SP',28),('misto','aberta','SP',18),('misto','mista','SP',23),
  ('preto','fechada','SP',24),('preto','aberta','SP',14),('preto','mista','SP',19),
  ('ferro','fechada','SP',14),('ferro','aberta','SP',8), ('ferro','mista','SP',11),
  ('misto_mg','fechada','SP',18),('misto_mg','aberta','SP',12),('misto_mg','mista','SP',15),
  ('pedra','fechada','SP',10),('pedra','aberta','SP',6), ('pedra','mista','SP',8)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 5. MG (mesmos valores do DEFAULT)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','MG',36),('terra','aberta','MG',24),('terra','mista','MG',30),
  ('misto','fechada','MG',28),('misto','aberta','MG',18),('misto','mista','MG',23),
  ('preto','fechada','MG',24),('preto','aberta','MG',14),('preto','mista','MG',19),
  ('ferro','fechada','MG',14),('ferro','aberta','MG',8), ('ferro','mista','MG',11),
  ('misto_mg','fechada','MG',18),('misto_mg','aberta','MG',12),('misto_mg','mista','MG',15),
  ('pedra','fechada','MG',10),('pedra','aberta','MG',6), ('pedra','mista','MG',8)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 6. RJ (mesmos valores do DEFAULT)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','RJ',36),('terra','aberta','RJ',24),('terra','mista','RJ',30),
  ('misto','fechada','RJ',28),('misto','aberta','RJ',18),('misto','mista','RJ',23),
  ('preto','fechada','RJ',24),('preto','aberta','RJ',14),('preto','mista','RJ',19),
  ('ferro','fechada','RJ',14),('ferro','aberta','RJ',8), ('ferro','mista','RJ',11),
  ('misto_mg','fechada','RJ',18),('misto_mg','aberta','RJ',12),('misto_mg','mista','RJ',15),
  ('pedra','fechada','RJ',10),('pedra','aberta','RJ',6), ('pedra','mista','RJ',8)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 7. ES (mesmos valores do DEFAULT)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','ES',36),('terra','aberta','ES',24),('terra','mista','ES',30),
  ('misto','fechada','ES',28),('misto','aberta','ES',18),('misto','mista','ES',23),
  ('preto','fechada','ES',24),('preto','aberta','ES',14),('preto','mista','ES',19),
  ('ferro','fechada','ES',14),('ferro','aberta','ES',8), ('ferro','mista','ES',11),
  ('misto_mg','fechada','ES',18),('misto_mg','aberta','ES',12),('misto_mg','mista','ES',15),
  ('pedra','fechada','ES',10),('pedra','aberta','ES',6), ('pedra','mista','ES',8)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 8. PR (+17% em todos os tipos)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','PR',42),('terra','aberta','PR',28),('terra','mista','PR',35),
  ('misto','fechada','PR',33),('misto','aberta','PR',21),('misto','mista','PR',27),
  ('preto','fechada','PR',28),('preto','aberta','PR',17),('preto','mista','PR',22),
  ('ferro','fechada','PR',16),('ferro','aberta','PR',9), ('ferro','mista','PR',13),
  ('misto_mg','fechada','PR',21),('misto_mg','aberta','PR',14),('misto_mg','mista','PR',18),
  ('pedra','fechada','PR',12),('pedra','aberta','PR',7), ('pedra','mista','PR',9)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 9. SC (+25% em todos os tipos)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','SC',45),('terra','aberta','SC',30),('terra','mista','SC',38),
  ('misto','fechada','SC',34),('misto','aberta','SC',22),('misto','mista','SC',28),
  ('preto','fechada','SC',30),('preto','aberta','SC',18),('preto','mista','SC',24),
  ('ferro','fechada','SC',18),('ferro','aberta','SC',10),('ferro','mista','SC',14),
  ('misto_mg','fechada','SC',23),('misto_mg','aberta','SC',15),('misto_mg','mista','SC',19),
  ('pedra','fechada','SC',13),('pedra','aberta','SC',8), ('pedra','mista','SC',10)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;

-- 10. RS (+33% em todos os tipos)
INSERT INTO meia_vida_secagem (solo_type, exposicao, regiao, meia_vida_h) VALUES
  ('terra','fechada','RS',48),('terra','aberta','RS',32),('terra','mista','RS',40),
  ('misto','fechada','RS',36),('misto','aberta','RS',24),('misto','mista','RS',30),
  ('preto','fechada','RS',32),('preto','aberta','RS',19),('preto','mista','RS',25),
  ('ferro','fechada','RS',19),('ferro','aberta','RS',11),('ferro','mista','RS',15),
  ('misto_mg','fechada','RS',24),('misto_mg','aberta','RS',16),('misto_mg','mista','RS',20),
  ('pedra','fechada','RS',13),('pedra','aberta','RS',8), ('pedra','mista','RS',11)
ON CONFLICT (solo_type, exposicao, regiao) DO NOTHING;
