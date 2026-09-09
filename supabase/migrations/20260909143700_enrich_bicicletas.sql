-- Enriquece o cadastro de bicicleta para permitir dicas de setup mais
-- inteligentes (PSI recomendado por peso, sag alvo por curso de suspensão,
-- aviso de config mullet). Continua 100% fora do pipeline Python.

ALTER TABLE public.bicicletas
  ADD COLUMN IF NOT EXISTS aro_dianteiro text CHECK (aro_dianteiro IN ('26', '27.5', '29')),
  ADD COLUMN IF NOT EXISTS aro_traseiro text CHECK (aro_traseiro IN ('26', '27.5', '29')),
  ADD COLUMN IF NOT EXISTS peso_atleta_kg numeric(5,1) CHECK (peso_atleta_kg IS NULL OR (peso_atleta_kg > 0 AND peso_atleta_kg < 250)),
  ADD COLUMN IF NOT EXISTS curso_dianteiro_mm numeric(5,0) CHECK (curso_dianteiro_mm IS NULL OR (curso_dianteiro_mm > 0 AND curso_dianteiro_mm < 250)),
  ADD COLUMN IF NOT EXISTS curso_traseiro_mm numeric(5,0) CHECK (curso_traseiro_mm IS NULL OR (curso_traseiro_mm > 0 AND curso_traseiro_mm < 250)),
  ADD COLUMN IF NOT EXISTS psi_dianteiro numeric(4,1) CHECK (psi_dianteiro IS NULL OR (psi_dianteiro > 0 AND psi_dianteiro < 80)),
  ADD COLUMN IF NOT EXISTS psi_traseiro numeric(4,1) CHECK (psi_traseiro IS NULL OR (psi_traseiro > 0 AND psi_traseiro < 80));

COMMENT ON COLUMN public.bicicletas.aro_dianteiro IS 'Aro dianteiro (26/27.5/29) — comparado ao traseiro identifica config mullet';
COMMENT ON COLUMN public.bicicletas.aro_traseiro IS 'Aro traseiro (26/27.5/29)';
COMMENT ON COLUMN public.bicicletas.peso_atleta_kg IS 'Peso do atleta em kg — base para recomendação de PSI';
COMMENT ON COLUMN public.bicicletas.curso_dianteiro_mm IS 'Curso de suspensão dianteira (garfo) em mm';
COMMENT ON COLUMN public.bicicletas.curso_traseiro_mm IS 'Curso de suspensão traseira (amortecedor) em mm — null em bike rígida/hardtail';
COMMENT ON COLUMN public.bicicletas.psi_dianteiro IS 'PSI atual informado pelo usuário no pneu dianteiro';
COMMENT ON COLUMN public.bicicletas.psi_traseiro IS 'PSI atual informado pelo usuário no pneu traseiro';
