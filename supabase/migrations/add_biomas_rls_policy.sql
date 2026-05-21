-- Habilita RLS na tabela biomas e adiciona policy de leitura pública.
-- Sem esta policy, o frontend (anon key) recebe array vazio ao consultar a tabela,
-- pois RLS bloqueia todas as leituras por padrão quando nenhuma policy existe.
-- O Python não é afetado pois usa service_role key, que ignora RLS.

ALTER TABLE biomas ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "biomas_select_public"
  ON biomas FOR SELECT USING (true);
