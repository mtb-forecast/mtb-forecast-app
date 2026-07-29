-- Corrige contador de favoritados por trilha (/trilhas/[id] e /trilhas/[id]/favoritos):
-- favoritos tem RLS restringindo SELECT a auth.uid() = user_id (linhas do próprio
-- usuário), então count(*) e a listagem via sessão do usuário só enxergavam a
-- própria linha — nunca as dos outros. Confirmado em produção: query SQL direta
-- (bypass RLS) mostrou 15 favoritos na trilha Saracura, mas o app mostrava 1.
--
-- Adiciona policy PERMISSIVE de leitura pública. Policies PERMISSIVE do mesmo
-- comando (SELECT) são combinadas com OR, então isso não remove nem substitui
-- a policy "própria linha" existente — só amplia a visibilidade, como já foi
-- feito para seguidores e feed_eventos.

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'favoritos'
  ) THEN
    IF NOT EXISTS (
      SELECT FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'favoritos'
        AND policyname = 'favoritos_select_public'
    ) THEN
      CREATE POLICY "favoritos_select_public" ON public.favoritos
        FOR SELECT USING (true);
    END IF;
  END IF;
END $$;
