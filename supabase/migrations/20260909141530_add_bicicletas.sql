-- Feature: cadastro de equipamento (bicicleta) no perfil, usado para gerar
-- dicas de setup (regra determinística em lib/, sem chamada de IA).
-- Sem alteração no pipeline Python nem no motor meteorológico.

CREATE TABLE IF NOT EXISTS public.bicicletas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('MTB', 'EMTB', 'RIGIDA')),
  marca text,
  modelo text,
  modalidade text NOT NULL CHECK (modalidade IN ('DOWNHILL', 'ENDURO', 'XC', 'MTB_ESTRADA', 'CICLOTURISMO')),
  ativa boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bicicletas_user ON public.bicicletas (user_id);

-- Garante no máximo uma bike ativa por usuário (índice parcial único)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bicicletas_user_ativa
  ON public.bicicletas (user_id) WHERE ativa;

ALTER TABLE public.bicicletas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bicicletas' AND policyname = 'bicicletas_select_own'
  ) THEN
    CREATE POLICY "bicicletas_select_own" ON public.bicicletas
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bicicletas' AND policyname = 'bicicletas_insert_own'
  ) THEN
    CREATE POLICY "bicicletas_insert_own" ON public.bicicletas
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bicicletas' AND policyname = 'bicicletas_update_own'
  ) THEN
    CREATE POLICY "bicicletas_update_own" ON public.bicicletas
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bicicletas' AND policyname = 'bicicletas_delete_own'
  ) THEN
    CREATE POLICY "bicicletas_delete_own" ON public.bicicletas
      FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
