-- Adiciona política de INSERT para observacoes_trilha.
-- RLS estava habilitado sem nenhuma policy de escrita,
-- bloqueando todas as inserções de avaliações pelos riders.
-- Usa DO block defensivo: no-op se a tabela ou a policy já existirem
-- (a tabela foi criada diretamente em produção, não via migration).

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'observacoes_trilha'
  ) THEN
    IF NOT EXISTS (
      SELECT FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'observacoes_trilha'
        AND policyname = 'observacoes_insert_own'
    ) THEN
      CREATE POLICY "observacoes_insert_own" ON public.observacoes_trilha
        FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;
END $$;
