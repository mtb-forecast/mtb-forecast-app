-- Ano do modelo da bicicleta — usado como referência adicional de setup e
-- futuramente para cruzar com specs reais do fabricante.
ALTER TABLE public.bicicletas
  ADD COLUMN IF NOT EXISTS ano_modelo integer CHECK (ano_modelo IS NULL OR (ano_modelo BETWEEN 1990 AND 2100));

COMMENT ON COLUMN public.bicicletas.ano_modelo IS 'Ano do modelo da bicicleta (ex: 2024)';
