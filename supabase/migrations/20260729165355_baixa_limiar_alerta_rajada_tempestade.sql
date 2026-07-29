-- Recalibra limiares de alerta de rajada de vento (mais sensivel):
--   badge do card:            30/50 -> 25/30 km/h (aberta/fechada)
--   veredicto rajada_prevista: 30/50 -> 25/30 km/h (aberta/fechada)
--   veredicto rajada_tempestade: 90 -> 40 km/h
--   override fds "ventos fortes": 65 -> 40 km/h
--   override fds "tempestade" (forca MELHOR ESPERAR): 90 -> 50 km/h
--   feed alerta_tempestade: 90 -> 40 km/h (este arquivo)
-- Os niveis de vento historico (nivel_vento 1/2/3: 55/65/90 km/h) NAO mudam --
-- so os limiares baseados em rajada PREVISTA (forecast), nao observada.
CREATE OR REPLACE FUNCTION public.fn_feed_evento_tempestade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome_trilha text;
  v_gust_max numeric;
  v_ja_alertado boolean;
BEGIN
  v_gust_max := GREATEST(
    COALESCE(NEW.rajada_max_kmh, 0),
    COALESCE(NEW.rajada_12h, 0),
    COALESCE(NEW.fds_d1_rajada, 0),
    COALESCE(NEW.fds_d2_rajada, 0),
    COALESCE(NEW.fds_d3_rajada, 0)
  );

  IF v_gust_max < 40 AND COALESCE(NEW.alerta_vento_nivel, 0) < 3 THEN
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
$function$;
