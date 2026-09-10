-- Feature: notifica no Feed quando alguém é adicionado como colaborador de
-- uma seleção de trilhas. Mesmo padrão de 20260723180755_add_feed_evento_seguida.sql
-- (reaproveita feed_eventos com colunas novas + trigger AFTER INSERT).
-- Telegram/e-mail são disparados pela aplicação (app/api/selecoes/**), não daqui —
-- Postgres/Supabase não faz chamada HTTP direta num trigger simples.

ALTER TABLE public.feed_eventos
  ADD COLUMN IF NOT EXISTS selecao_id uuid REFERENCES public.selecoes_trilhas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS destinatario_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_feed_eventos_selecao ON public.feed_eventos (selecao_id);
CREATE INDEX IF NOT EXISTS idx_feed_eventos_destinatario ON public.feed_eventos (destinatario_id);

CREATE OR REPLACE FUNCTION public.fn_feed_evento_selecao_membro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_selecao text;
  v_owner_id     uuid;
BEGIN
  SELECT nome, owner_id INTO v_nome_selecao, v_owner_id
  FROM public.selecoes_trilhas WHERE id = NEW.selecao_id;

  -- Só notifica colaboradores de verdade — o owner nunca deveria aparecer
  -- como linha em selecao_membros, mas por segurança não gera evento se aparecer.
  IF v_owner_id = NEW.profile_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.feed_eventos (trilha_id, tipo, texto, selecao_id, destinatario_id, created_at)
  VALUES (
    NULL,
    'selecao_membro',
    concat_ws(' ', 'Você foi adicionado à seleção', v_nome_selecao),
    NEW.selecao_id,
    NEW.profile_id,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feed_evento_selecao_membro ON public.selecao_membros;

CREATE TRIGGER trg_feed_evento_selecao_membro
  AFTER INSERT ON public.selecao_membros
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_feed_evento_selecao_membro();

REVOKE EXECUTE ON FUNCTION public.fn_feed_evento_selecao_membro() FROM PUBLIC, anon, authenticated;
