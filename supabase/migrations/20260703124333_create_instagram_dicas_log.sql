
CREATE TABLE instagram_dicas_log (
  id        BIGSERIAL PRIMARY KEY,
  dica_id   INTEGER NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX instagram_dicas_log_posted_at_idx ON instagram_dicas_log (posted_at DESC);
