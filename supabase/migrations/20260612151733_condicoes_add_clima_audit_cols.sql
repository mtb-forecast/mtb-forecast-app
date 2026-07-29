
ALTER TABLE condicoes
  ADD COLUMN IF NOT EXISTS cloud_pct       NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS humidity_pct    NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS temp_media_c    NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS meia_vida_base_h NUMERIC(5,1);

COMMENT ON COLUMN condicoes.cloud_pct        IS 'Nebulosidade média 48h (%) — entrada de _ajustar_meia_vida_clima';
COMMENT ON COLUMN condicoes.humidity_pct     IS 'Umidade relativa média 48h (%) — entrada de _ajustar_meia_vida_clima';
COMMENT ON COLUMN condicoes.temp_media_c     IS 'Temperatura média 48h (°C) — entrada de _ajustar_meia_vida_clima';
COMMENT ON COLUMN condicoes.meia_vida_base_h IS 'Meia-vida base antes dos multiplicadores climáticos (h)';
