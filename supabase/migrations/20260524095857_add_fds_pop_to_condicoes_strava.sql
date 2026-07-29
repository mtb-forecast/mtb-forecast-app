
ALTER TABLE condicoes_strava
  ADD COLUMN IF NOT EXISTS fds_d1_pop numeric,
  ADD COLUMN IF NOT EXISTS fds_d2_pop numeric,
  ADD COLUMN IF NOT EXISTS fds_d3_pop numeric;
