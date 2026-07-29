-- Feature: sistema de seguir usuário + perfil público com trilhas favoritas.
-- Cria a tabela seguidores. Sem alteração no motor Python.

CREATE TABLE IF NOT EXISTS public.seguidores (
  id serial PRIMARY KEY,
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_seguidores_follower ON public.seguidores (follower_id);
CREATE INDEX IF NOT EXISTS idx_seguidores_following ON public.seguidores (following_id);

ALTER TABLE public.seguidores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seguidores' AND policyname = 'seguidores_select_public'
  ) THEN
    CREATE POLICY "seguidores_select_public" ON public.seguidores
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seguidores' AND policyname = 'seguidores_insert_own'
  ) THEN
    CREATE POLICY "seguidores_insert_own" ON public.seguidores
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = follower_id);
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seguidores' AND policyname = 'seguidores_delete_own'
  ) THEN
    CREATE POLICY "seguidores_delete_own" ON public.seguidores
      FOR DELETE TO authenticated
      USING (auth.uid() = follower_id);
  END IF;
END $$;
