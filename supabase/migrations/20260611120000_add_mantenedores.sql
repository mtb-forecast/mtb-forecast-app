-- Tabela de mantenedores (parques, clubes, empresas que mantêm trilhas)
create table mantenedores (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  logo_url  text,
  site_url  text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Leitura pública (logo aparece para todos os usuários)
-- Escrita via service role key (admin pages usam supabaseAdmin no servidor)
alter table mantenedores enable row level security;
create policy "mantenedores_public_read"
  on mantenedores for select using (true);

-- FK em trilhas (só executa se a tabela já existir — Preview Branch parte do zero)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trilhas'
  ) then
    alter table trilhas
      add column if not exists mantenedor_id uuid references mantenedores(id) on delete set null;
    create index if not exists idx_trilhas_mantenedor on trilhas(mantenedor_id);
  end if;
end $$;
