ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS strava_segment_id bigint UNIQUE;
