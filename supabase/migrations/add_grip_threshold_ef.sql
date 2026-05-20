-- Adiciona grip_threshold_ef às tabelas de condições.
-- Valor calculado pelo Python agent: ef_max(GRIP PERFEITO) × fator_microclima(trilha).
-- Elimina o threshold hardcoded 3.0mm que existia no frontend (CondicaoCard.tsx).
-- Populado a cada run do agent — NULL em registros anteriores ao deploy.

ALTER TABLE condicoes       ADD COLUMN IF NOT EXISTS grip_threshold_ef float;
ALTER TABLE condicoes_strava ADD COLUMN IF NOT EXISTS grip_threshold_ef float;
