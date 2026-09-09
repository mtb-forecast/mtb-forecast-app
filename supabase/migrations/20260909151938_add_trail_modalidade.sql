-- Adiciona a modalidade Trail/All-Mountain (uso recreativo em trilhas mistas,
-- entre XC e Enduro em termos de curso de suspensão). Antes disso não havia
-- opção adequada — usuário caía em XC ou Enduro sem precisão.
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.bicicletas'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%modalidade%';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.bicicletas DROP CONSTRAINT %I', c_name);
  END IF;

  ALTER TABLE public.bicicletas DROP CONSTRAINT IF EXISTS bicicletas_modalidade_check;

  ALTER TABLE public.bicicletas
    ADD CONSTRAINT bicicletas_modalidade_check
    CHECK (modalidade IN ('DOWNHILL', 'ENDURO', 'TRAIL', 'XC', 'MTB_ESTRADA', 'CICLOTURISMO'));
END $$;
