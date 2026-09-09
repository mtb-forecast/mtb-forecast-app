-- Adiciona a modalidade Dirt Jump/Freeride/Slopestyle/Pumptrack — foco em
-- manobras aéreas e pistas de terra batida, curso curto e bem rígido pra
-- resistir a aterrissagens fortes.
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

  ALTER TABLE public.bicicletas
    ADD CONSTRAINT bicicletas_modalidade_check
    CHECK (modalidade IN ('DOWNHILL', 'ENDURO', 'TRAIL', 'XC', 'DIRT_JUMP', 'MTB_ESTRADA', 'CICLOTURISMO'));
END $$;
