-- Feature: Notícia externa — resumo real de clima extremo no Brasil, gerado via
-- busca na web (Claude web_search tool) em scripts/post_noticia_externa.py.
--
-- Diferente de noticias_clima (que resume SÓ dados das nossas trilhas), esta
-- tabela guarda um resumo com fontes REAIS retornadas pela busca — nunca
-- inventar nome/selo de fonte; `fontes` só recebe o que a API de busca
-- efetivamente retornou como citação.
--
-- Tabela isolada de propósito: para desligar por completo, desative o
-- workflow noticia-externa.yml (ou drope esta tabela) — nada mais depende dela.

CREATE TABLE IF NOT EXISTS public.noticias_externas (
  id serial PRIMARY KEY,
  resumo text NOT NULL,
  fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_noticias_externas_created
  ON public.noticias_externas (created_at DESC);

ALTER TABLE public.noticias_externas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'noticias_externas'
      AND policyname = 'noticias_externas_select_public'
  ) THEN
    CREATE POLICY "noticias_externas_select_public" ON public.noticias_externas
      FOR SELECT USING (true);
  END IF;
END $$;

-- Sem policy de INSERT/UPDATE/DELETE para usuários: apenas o service role
-- (scripts/post_noticia_externa.py, rodando no GitHub Actions) escreve aqui.
