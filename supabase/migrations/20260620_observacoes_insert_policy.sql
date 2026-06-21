-- Adiciona política de INSERT para observacoes_trilha.
-- RLS estava habilitado sem nenhuma policy de escrita,
-- bloqueando todas as inserções de avaliações pelos riders.

CREATE POLICY "observacoes_insert_own" ON public.observacoes_trilha
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
