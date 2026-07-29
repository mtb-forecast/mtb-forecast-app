-- Feature: publica no feed quando um usuário passa a seguir outro.
-- Reaproveita feed_eventos (já usado pelos posts de pipeline) com duas colunas
-- novas (follower_id, following_id) e tipo='seguida'. Aparece:
--   (a) no feed de quem foi seguido (following_id = viewer) — notificação de novo seguidor
--   (b) no feed de quem já segue o follower (follower_id IN following_ids do viewer) — atividade social
-- Sem alteração no motor Python.

ALTER TABLE public.feed_eventos
  ADD COLUMN IF NOT EXISTS follower_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS following_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_feed_eventos_follower ON public.feed_eventos (follower_id);
CREATE INDEX IF NOT EXISTS idx_feed_eventos_following ON public.feed_eventos (following_id);

CREATE OR REPLACE FUNCTION public.fn_feed_evento_seguida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.feed_eventos (trilha_id, tipo, follower_id, following_id, created_at)
  VALUES (NULL, 'seguida', NEW.follower_id, NEW.following_id, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feed_evento_seguida ON public.seguidores;

CREATE TRIGGER trg_feed_evento_seguida
  AFTER INSERT ON public.seguidores
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_feed_evento_seguida();

REVOKE EXECUTE ON FUNCTION public.fn_feed_evento_seguida() FROM PUBLIC, anon, authenticated;
