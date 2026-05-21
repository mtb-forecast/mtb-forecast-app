-- Habilita RLS na tabela biomas e adiciona policy de leitura pública.
-- Sem esta policy, o frontend (anon key) recebe array vazio ao consultar a tabela,
-- pois RLS bloqueia todas as leituras por padrão quando nenhuma policy existe.
-- O Python não é afetado pois usa service_role key, que ignora RLS.

ALTER TABLE biomas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'biomas' AND policyname = 'biomas_select_public'
  ) THEN
    CREATE POLICY "biomas_select_public"
      ON biomas FOR SELECT USING (true);
  END IF;
END$$;
