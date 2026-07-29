-- Colunas de rajada de vento prevista (d1/d2/d3 e janela de 12h), para permitir
-- detecção antecipada de tempestade (>=90km/h) antes que ela entre na janela
-- imediata do veredicto. Ver _aplicar_override_vento_futuro() em mtb-forecast.py
-- e o cálculo de gust_12h em mtb-forecast-only.py.

ALTER TABLE condicoes
  ADD COLUMN IF NOT EXISTS fds_d1_gust NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS fds_d2_gust NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS fds_d3_gust NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS gust_12h    NUMERIC(5,1);
