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
alter table mantenedores enable row level security;
create policy "mantenedores_public_read"
  on mantenedores for select using (true);
create policy "mantenedores_admin_all"
  on mantenedores for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- FK em trilhas
alter table trilhas
  add column mantenedor_id uuid references mantenedores(id) on delete set null;

create index idx_trilhas_mantenedor on trilhas(mantenedor_id);
