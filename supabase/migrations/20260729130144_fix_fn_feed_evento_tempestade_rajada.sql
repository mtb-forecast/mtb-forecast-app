-- 20260729110000_rename_gust_to_rajada.sql renomeou as colunas de condicoes
-- (gust_max_kmh -> rajada_max_kmh, gust_12h -> rajada_12h, fds_d._gust ->
-- fds_d._rajada) mas nao atualizou fn_feed_evento_tempestade, cujo corpo
-- (texto puro em PL/pgSQL) ainda referenciava os nomes antigos via NEW.*.
-- Isso quebrava TODO insert/update em condicoes com
-- "record \"new\" has no field \"gust_max_kmh\"" (SQLSTATE 42703) --
-- provavel causa real de condicoes ter ficado vazia em producao.
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
$function$;
