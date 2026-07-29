-- Feature: posta no feed (trilhas favoritadas) quando o modelo detecta tempestade
-- (rajada >=90km/h, iminente ou nos próximos 3 dias). Reaproveita feed_eventos
-- com tipo='alerta_tempestade'. Dispara em INSERT (pipeline completo, 2-4x/dia)
-- e em UPDATE das colunas de rajada (job horário mtb-forecast-only.py), para
-- cobrir os dois mecanismos de detecção. Dedup: no máx. 1 alerta por trilha a
-- cada 20h, para não repetir a cada execução enquanto a tempestade persiste.

CREATE OR REPLACE FUNCTION public.fn_feed_evento_tempestade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_trilha text;
  v_gust_max numeric;
  v_ja_alertado boolean;
BEGIN
  v_gust_max := GREATEST(
    COALESCE(NEW.gust_max_kmh, 0),
    COALESCE(NEW.gust_12h, 0),
    COALESCE(NEW.fds_d1_gust, 0),
    COALESCE(NEW.fds_d2_gust, 0),
    COALESCE(NEW.fds_d3_gust, 0)
  );

  IF v_gust_max < 90 AND COALESCE(NEW.alerta_vento_nivel, 0) < 3 THEN
    RETURN NEW;
  END IF;

  IF NEW.trilha_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.feed_eventos
    WHERE trilha_id = NEW.trilha_id
      AND tipo = 'alerta_tempestade'
      AND created_at > now() - interval '20 hours'
  ) INTO v_ja_alertado;

  IF v_ja_alertado THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_nome_trilha FROM public.trilhas WHERE id = NEW.trilha_id;

  INSERT INTO public.feed_eventos (trilha_id, tipo, texto, veredicto, created_at)
  VALUES (
    NEW.trilha_id,
    'alerta_tempestade',
    concat_ws(' — ', v_nome_trilha,
      'Tempestade prevista: rajadas de até ' || round(v_gust_max)::text || ' km/h, risco de queda de árvores'),
    NEW.veredicto,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feed_evento_tempestade ON public.condicoes;

CREATE TRIGGER trg_feed_evento_tempestade
  AFTER INSERT OR UPDATE OF
    gust_max_kmh, gust_12h, fds_d1_gust, fds_d2_gust, fds_d3_gust, alerta_vento_nivel
  ON public.condicoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_feed_evento_tempestade();

REVOKE EXECUTE ON FUNCTION public.fn_feed_evento_tempestade() FROM PUBLIC, anon, authenticated;
