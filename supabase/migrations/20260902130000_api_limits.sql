-- Limites de consumo cadastráveis por API (diário/mensal) + estado de alerta já disparado.
-- Motivação: 01/09/2026 o consumo diário de OpenWeatherMap (day_summary + onecall +
-- onecall_hourly) somou 1.045 chamadas — acima do limite gratuito de 1.000/dia do
-- One Call 3.0. Não havia nenhum alerta configurado.
create table if not exists api_limits (
  id                uuid          primary key default gen_random_uuid(),
  api_name          text          not null,           -- mesma chave usada em api_usage_log.api_name
  tipo              text          not null check (tipo in ('diario', 'mensal')),
  limite_chamadas   integer,                           -- null = não monitora esse eixo
  limite_tokens     integer,
  limite_custo_usd  numeric(12,4),
  ativo             boolean       not null default true,
  ultimo_alerta_em  timestamptz,                       -- dedupe: só realerta no próximo período
  criado_em         timestamptz   not null default now(),
  atualizado_em     timestamptz   not null default now(),
  unique (api_name, tipo)
);

create index if not exists idx_api_limits_ativo on api_limits(ativo);

alter table api_limits enable row level security;

-- Política condicional: só cria se a tabela profiles já existir (evita erro em preview branches)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    execute $policy$
      create policy "api_limits_admin_all"
        on api_limits for all
        using (
          exists (
            select 1 from profiles
            where profiles.id = auth.uid()
              and profiles.is_admin = true
          )
        )
        with check (
          exists (
            select 1 from profiles
            where profiles.id = auth.uid()
              and profiles.is_admin = true
          )
        )
    $policy$;
  end if;
end $$;

-- Seed do limite já conhecido (documentado em CLAUDE.md): OWM One Call 3.0 free tier
insert into api_limits (api_name, tipo, limite_chamadas, ativo)
values ('openweathermap', 'diario', 1000, true)
on conflict (api_name, tipo) do nothing;
