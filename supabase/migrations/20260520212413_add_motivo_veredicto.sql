-- Armazena os fatores que levaram ao veredicto, para exibição no frontend
-- quando o veredicto é "DROP LIBERADO - Veja os alertas" sem alertas específicos
ALTER TABLE condicoes        ADD COLUMN IF NOT EXISTS motivo_veredicto text;

-- condicoes_strava foi removida de produção; guarda evita erro no Preview Branch
-- (que faz replay de todas as migrations do zero) e em ambientes sem a tabela.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'condicoes_strava') then
    alter table condicoes_strava add column if not exists motivo_veredicto text;
  end if;
end $$;
