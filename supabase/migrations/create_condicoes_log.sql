-- =============================================================
-- condicoes_log — histórico append-only de execuções
-- Branch: develop
-- `condicoes` é sobrescrita a cada execução (DELETE + INSERT em
-- gravar_supabase()), então não dá pra analisar retroativamente
-- padrões como "pop alto + pico_3h=0 + veredicto LIBERADO" ao
-- longo do tempo. Esta tabela grava um snapshot mínimo por
-- trilha a cada execução, sem sobrescrever o anterior.
-- =============================================================

CREATE TABLE IF NOT EXISTS condicoes_log (
  id              bigserial PRIMARY KEY,
  trilha_id       uuid NOT NULL REFERENCES trilhas(id) ON DELETE CASCADE,
  gerado_em       timestamptz NOT NULL,
  veredicto       text,
  pop_12h         numeric(5,1),
  pop_24h         numeric(5,1),
  pico_3h         numeric(6,1),
  rain_12h        numeric(6,1),
  chuva_solo_48h  numeric(6,1),
  acumulo_ef      numeric(6,1),
  ultima_chuva_h  numeric(6,1),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS condicoes_log_trilha_gerado_idx
  ON condicoes_log (trilha_id, gerado_em DESC);

ALTER TABLE condicoes_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "condicoes_log_read_all" ON condicoes_log FOR SELECT USING (true);
