-- Adiciona políticas RLS de leitura pública (anon) para a landing page.
-- Usa IF NOT EXISTS em tudo — seguro de rodar mesmo que RLS já esteja configurado.
-- Caso RLS não esteja habilitado na tabela, habilita e adiciona política para
-- authenticated também, para não quebrar o acesso existente.

DO $$
BEGIN

  -- ── trilhas ──────────────────────────────────────────────────────────────────
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.trilhas'::regclass) THEN
    ALTER TABLE public.trilhas ENABLE ROW LEVEL SECURITY;
    -- se RLS não estava ativo, authenticated precisava de uma policy agora
    CREATE POLICY "trilhas_auth_select_all" ON public.trilhas
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trilhas'
      AND policyname = 'trilhas_anon_select_aprovadas'
  ) THEN
    CREATE POLICY "trilhas_anon_select_aprovadas" ON public.trilhas
      FOR SELECT USING (aprovada = true);
  END IF;

  -- ── condicoes ─────────────────────────────────────────────────────────────────
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.condicoes'::regclass) THEN
    ALTER TABLE public.condicoes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "condicoes_auth_select_all" ON public.condicoes
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'condicoes'
      AND policyname = 'condicoes_anon_select'
  ) THEN
    CREATE POLICY "condicoes_anon_select" ON public.condicoes
      FOR SELECT USING (true);
  END IF;

  -- ── observacoes_trilha ────────────────────────────────────────────────────────
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.observacoes_trilha'::regclass) THEN
    ALTER TABLE public.observacoes_trilha ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "observacoes_auth_select_all" ON public.observacoes_trilha
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'observacoes_trilha'
      AND policyname = 'observacoes_anon_select_public'
  ) THEN
    CREATE POLICY "observacoes_anon_select_public" ON public.observacoes_trilha
      FOR SELECT USING (texto IS NOT NULL AND trilha_id IS NOT NULL);
  END IF;

  -- ── profiles ──────────────────────────────────────────────────────────────────
  -- profiles é gerenciado pelo Supabase Auth — RLS já está habilitado.
  -- Só adiciona a policy de anon se ainda não existir.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_anon_select_public'
  ) THEN
    CREATE POLICY "profiles_anon_select_public" ON public.profiles
      FOR SELECT USING (true);
  END IF;

END $$;
