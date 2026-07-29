-- Feature: Feed de atividade das trilhas favoritadas.
-- Cria feed_eventos (posts automáticos do pipeline) + trigger AFTER INSERT em condicoes.
-- O agente Python (mtb-forecast.py) já faz DELETE + INSERT em condicoes a cada rodada —
-- este trigger popula o feed automaticamente, sem NENHUMA alteração no motor Python.

CREATE TABLE IF NOT EXISTS public.feed_eventos (
  id serial PRIMARY KEY,
  trilha_id uuid REFERENCES public.trilhas(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'pipeline',
  texto text,
  veredicto text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_eventos_trilha_created
  ON public.feed_eventos (trilha_id, created_at DESC);

ALTER TABLE public.feed_eventos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'feed_eventos'
      AND policyname = 'feed_eventos_select_public'
  ) THEN
    CREATE POLICY "feed_eventos_select_public" ON public.feed_eventos
      FOR SELECT USING (true);
  END IF;
END $$;

-- Sem policy de INSERT/UPDATE/DELETE para usuários: apenas o trigger
-- (executado com privilégios do owner da função, via SECURITY DEFINER)
-- e o service role escrevem nesta tabela.

CREATE OR REPLACE FUNCTION public.fn_feed_evento_condicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_trilha text;
BEGIN
  SELECT name INTO v_nome_trilha FROM public.trilhas WHERE id = NEW.trilha_id;

  INSERT INTO public.feed_eventos (trilha_id, tipo, texto, veredicto, created_at)
  VALUES (
    NEW.trilha_id,
    'pipeline',
    concat_ws(' - ', v_nome_trilha, NEW.veredicto_12h, NEW.texto_dinamico),
    NEW.veredicto_12h,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feed_evento_condicao ON public.condicoes;

CREATE TRIGGER trg_feed_evento_condicao
  AFTER INSERT ON public.condicoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_feed_evento_condicao();

-- Trigger functions só podem ser chamadas em contexto de trigger (NEW não
-- existe fora dele), mas por ser SECURITY DEFINER o linter do Supabase
-- acusa a função como executável via RPC por anon/authenticated. Fecha
-- a superfície mesmo assim, por princípio de menor privilégio.
REVOKE EXECUTE ON FUNCTION public.fn_feed_evento_condicao() FROM PUBLIC, anon, authenticated;
