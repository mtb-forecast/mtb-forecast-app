-- Rajada máxima por bloco de 6h, para que o alerta de rajada no card da
-- trilha possa citar QUANDO dentro das próximas 24h o pico ocorre, em vez
-- de só dizer "nas próximas 24h" genericamente.

ALTER TABLE previsao_blocos
  ADD COLUMN IF NOT EXISTS gust_max NUMERIC(5,1);
