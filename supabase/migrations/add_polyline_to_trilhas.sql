ALTER TABLE trilhas ADD COLUMN IF NOT EXISTS polyline TEXT;

-- trilhas_pendentes foi removida de produção; guarda evita erro no Preview Branch
-- (que faz replay de todas as migrations do zero) e em ambientes sem a tabela.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'trilhas_pendentes') then
    alter table trilhas_pendentes add column if not exists polyline text;
  end if;
end $$;
