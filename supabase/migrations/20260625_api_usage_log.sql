-- Tabela de auditoria de consumo de APIs externas
-- Gravada pelo pipeline Python no final de cada execução
create table if not exists api_usage_log (
  id             uuid        primary key default gen_random_uuid(),
  execucao_id    text        not null,           -- UUID único por execução do pipeline
  api_name       text        not null,           -- ex: 'openweathermap', 'anthropic', 'open_meteo'
  endpoint       text        not null default '',-- URL ou nome curto do endpoint
  chamadas       integer     not null default 0, -- chamadas HTTP efetivas (sem cache)
  tokens_input   integer     not null default 0, -- tokens de prompt (LLMs)
  tokens_output  integer     not null default 0, -- tokens de resposta (LLMs)
  custo_usd      numeric(12,8) not null default 0, -- custo estimado em USD
  sucesso        integer     not null default 0, -- chamadas bem-sucedidas
  falhas         integer     not null default 0, -- chamadas que falharam
  criado_em      timestamptz not null default now()
);

create index if not exists idx_api_usage_log_criado_em  on api_usage_log(criado_em desc);
create index if not exists idx_api_usage_log_api_name   on api_usage_log(api_name);
create index if not exists idx_api_usage_log_execucao_id on api_usage_log(execucao_id);

-- Apenas admins leem; pipeline insere via service_role (sem RLS necessária para insert)
alter table api_usage_log enable row level security;

create policy "api_usage_log_admin_read"
  on api_usage_log for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );
