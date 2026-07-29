-- Feature: Notícia climática — "visão geral" agregada das condições de trilha
-- no Brasil, gerada por scripts/post_noticia_clima.py após cada rodada do pipeline.
--
-- Tabela isolada de propósito: não referencia trilhas/condicoes/feed_eventos.
-- Para desligar a feature por completo, basta desativar o workflow
-- noticia-clima.yml (ou dropar esta tabela) — nenhuma outra parte do sistema
-- depende dela.

CREATE TABLE IF NOT EXISTS public.noticias_clima (
  id serial PRIMARY KEY,
  frase_destaque text NOT NULL,
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_noticias_clima_created
  ON public.noticias_clima (created_at DESC);

ALTER TABLE public.noticias_clima ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'noticias_clima'
      AND policyname = 'noticias_clima_select_public'
  ) THEN
    CREATE POLICY "noticias_clima_select_public" ON public.noticias_clima
      FOR SELECT USING (true);
  END IF;
END $$;

-- Sem policy de INSERT/UPDATE/DELETE para usuários: apenas o service role
-- (scripts/post_noticia_clima.py, rodando no GitHub Actions) escreve aqui.
