-- Baseline para tabelas que foram criadas manualmente no dashboard do Supabase
-- em algum momento anterior ao início do versionamento de migrations, e por
-- isso nunca tiveram um CREATE TABLE nos arquivos deste diretório.
--
-- Isso quebra o Supabase Preview Branching: ele monta um banco do ZERO e faz
-- replay de TODAS as migrations em ordem — qualquer ALTER TABLE numa tabela
-- que só existe "de fato" em produção falha com "relation does not exist".
--
-- Este arquivo usa CREATE TABLE IF NOT EXISTS pra cada uma dessas tabelas,
-- com o schema atual de produção (consultado via API do Supabase em
-- 21/07/2026). Em produção é NO-OP puro (as tabelas já existem, IF NOT
-- EXISTS pula tudo). Em um banco novo (Preview Branch, ambiente de dev
-- limpo), cria a base necessária para as migrations seguintes rodarem.
--
-- Nome do arquivo começa com zeros para garantir que rode ANTES de
-- qualquer outra migration (ordem lexicográfica).
--
-- Sem FKs/RLS/policies aqui de propósito — o objetivo é só permitir que os
-- ALTER TABLE subsequentes (a maioria ADD COLUMN IF NOT EXISTS) não
-- quebrem, não replicar 100% do schema de produção.

CREATE TABLE IF NOT EXISTS condicoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id         uuid,
  gerado_em         timestamptz,
  aderencia_status  text,
  aderencia_score   double precision,
  veredicto         text,
  rain_mm           double precision,
  wind_ms           double precision,
  pico_3h           double precision,
  acumulo_48h       double precision, -- renomeada para chuva_solo_48h em 20260626_rename_acumulo_48h_to_chuva_solo_48h.sql
  acumulo_ef        double precision,
  ultima_chuva_h    double precision,
  meia_vida_h       double precision,
  gust_max_kmh      double precision,
  janela            text,
  frase_secagem     text,
  dados_json        jsonb
);

CREATE TABLE IF NOT EXISTS profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  nome               text,
  telegram_username  text,
  regiao             text,
  is_admin           boolean NOT NULL DEFAULT false,
  created_at         timestamptz DEFAULT now(),
  apelido            text,
  telefone           text,
  telefone_whatsapp  boolean,
  receber_email      boolean,
  telegram_chat_id   bigint,
  telegram_ativo     boolean,
  plano              text,
  stripe_customer_id text,
  avatar_url         text,
  instagram          text,
  data_nascimento    date,
  cidade             text,
  facebook           text,
  strava_id          text
);

CREATE TABLE IF NOT EXISTS trilhas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  lat              double precision NOT NULL,
  lon              double precision NOT NULL,
  solo_type        text NOT NULL,
  exposicao        text NOT NULL,
  altitude_m       integer,
  trail_type       text NOT NULL,
  desnivel_m       double precision,
  extensao_km      double precision,
  regiao           text NOT NULL,
  bioma            text,
  aprovada         boolean DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  link_referencia  text,
  observacoes      text
);

CREATE TABLE IF NOT EXISTS tabela_solo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solo_type    text NOT NULL,
  bioma        text,
  regiao       text,
  clay_pct     integer NOT NULL,
  sand_pct     integer NOT NULL,
  texture_class text NOT NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave       text NOT NULL UNIQUE,
  valor       text NOT NULL,
  descricao   text,
  updated_at  timestamptz DEFAULT now(),
  grupo       text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS observacoes_trilha (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id           uuid,
  user_id             uuid NOT NULL,
  estrelas            integer NOT NULL,
  texto               text NOT NULL,
  veredicto_sistema   text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
