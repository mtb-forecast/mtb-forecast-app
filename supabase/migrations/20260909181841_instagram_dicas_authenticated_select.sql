-- Fix: instagram_dicas só tinha policy de SELECT pra role anon (herdada de
-- quando a tabela só alimentava o script de post no Instagram, que não passa
-- por RLS). Ao conectar a tabela ao /feed (09/09/2026), a query do app roda
-- como usuário autenticado e ficava bloqueada silenciosamente — dica nunca
-- aparecia no feed apesar do post no Instagram funcionar normalmente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'instagram_dicas' AND policyname = 'authenticated_select'
  ) THEN
    CREATE POLICY "authenticated_select" ON public.instagram_dicas
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
