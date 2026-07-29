-- Adiciona grip_threshold_ef às tabelas de condições.
-- Valor calculado pelo Python agent: ef_max(GRIP PERFEITO) × fator_microclima(trilha).
-- Elimina o threshold hardcoded 3.0mm que existia no frontend (CondicaoCard.tsx).
-- Populado a cada run do agent — NULL em registros anteriores ao deploy.

ALTER TABLE condicoes       ADD COLUMN IF NOT EXISTS grip_threshold_ef float;

-- condicoes_strava foi removida de produção; guarda evita erro no Preview Branch
-- (que faz replay de todas as migrations do zero) e em ambientes sem a tabela.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'condicoes_strava') then
    alter table condicoes_strava add column if not exists grip_threshold_ef float;
  end if;
end $$;
