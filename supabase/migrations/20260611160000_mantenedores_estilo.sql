alter table mantenedores
  add column nome_primario   text,
  add column nome_secundario text,
  add column cor_primaria    text not null default '#ffffff',
  add column cor_secundaria  text,
  add column icone           text;

update mantenedores
set
  nome_primario   = 'SHIMANO',
  nome_secundario = 'Trailborn',
  cor_primaria    = '#ffffff',
  cor_secundaria  = '#c9a010',
  icone           = 'veado'
where nome ilike '%shimano%';
