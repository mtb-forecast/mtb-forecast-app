-- Corrige drift de baseline em `condicoes`: 33 colunas existem em produção mas
-- nunca foram versionadas em migration nenhuma (mesmo padrão de
-- 00000000000000_baseline_legacy_tables.sql, que corrigiu tabelas — este
-- corrige colunas). Descoberto ao rodar o Preview Branch do Supabase (que
-- reconstrói o schema do zero a partir das migrations): CREATE TRIGGER
-- referenciando alerta_vento_nivel falhava com "column does not exist",
-- mesmo a coluna existindo em produção há meses.
-- Tipos abaixo espelham exatamente information_schema.columns de produção.

ALTER TABLE condicoes
  ADD COLUMN IF NOT EXISTS aderencia_desc          text,
  ADD COLUMN IF NOT EXISTS aderencia_futura_label   text,
  ADD COLUMN IF NOT EXISTS aderencia_futura_rain     numeric,
  ADD COLUMN IF NOT EXISTS aderencia_futura_status   text,
  ADD COLUMN IF NOT EXISTS alerta_rajada_kmh          double precision,
  ADD COLUMN IF NOT EXISTS alerta_vento_kmh           double precision,
  ADD COLUMN IF NOT EXISTS alerta_vento_nivel         integer,
  ADD COLUMN IF NOT EXISTS enso_fase                  text,
  ADD COLUMN IF NOT EXISTS enso_oni                   double precision,
  ADD COLUMN IF NOT EXISTS fds_d1_pop                 integer,
  ADD COLUMN IF NOT EXISTS fds_d1_rain                double precision,
  ADD COLUMN IF NOT EXISTS fds_d1_temp                numeric,
  ADD COLUMN IF NOT EXISTS fds_d1_temp_min            numeric,
  ADD COLUMN IF NOT EXISTS fds_d1_veredicto           text,
  ADD COLUMN IF NOT EXISTS fds_d1_wind                numeric,
  ADD COLUMN IF NOT EXISTS fds_d2_pop                 integer,
  ADD COLUMN IF NOT EXISTS fds_d2_rain                double precision,
  ADD COLUMN IF NOT EXISTS fds_d2_temp                numeric,
  ADD COLUMN IF NOT EXISTS fds_d2_temp_min            numeric,
  ADD COLUMN IF NOT EXISTS fds_d2_veredicto           text,
  ADD COLUMN IF NOT EXISTS fds_d2_wind                numeric,
  ADD COLUMN IF NOT EXISTS fds_d3_pop                 integer,
  ADD COLUMN IF NOT EXISTS fds_d3_rain                double precision,
  ADD COLUMN IF NOT EXISTS fds_d3_temp                numeric,
  ADD COLUMN IF NOT EXISTS fds_d3_temp_min            numeric,
  ADD COLUMN IF NOT EXISTS fds_d3_veredicto           text,
  ADD COLUMN IF NOT EXISTS fds_d3_wind                numeric,
  ADD COLUMN IF NOT EXISTS historico_atualizado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS horarios_chuva             text,
  ADD COLUMN IF NOT EXISTS limiar_descanso            double precision,
  ADD COLUMN IF NOT EXISTS meia_vida_base_h           numeric(5,1),
  ADD COLUMN IF NOT EXISTS temp_media_c               numeric(5,1),
  ADD COLUMN IF NOT EXISTS wind_12h                   double precision;
