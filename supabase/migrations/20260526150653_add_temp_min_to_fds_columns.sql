
ALTER TABLE condicoes
  ADD COLUMN IF NOT EXISTS fds_d1_temp_min numeric,
  ADD COLUMN IF NOT EXISTS fds_d2_temp_min numeric,
  ADD COLUMN IF NOT EXISTS fds_d3_temp_min numeric;

ALTER TABLE condicoes_strava
  ADD COLUMN IF NOT EXISTS fds_d1_temp_min numeric,
  ADD COLUMN IF NOT EXISTS fds_d2_temp_min numeric,
  ADD COLUMN IF NOT EXISTS fds_d3_temp_min numeric;
