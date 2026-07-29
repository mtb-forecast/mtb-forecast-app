-- Preferências de dia/horário para envio de email e Telegram.
-- O sistema só roda em 4 janelas fixas por dia (06h, 12h, 16h, 20h BRT — ver
-- lib/schedule.ts e .github/workflows/mtb-forecast-workflow.yml), então a
-- preferência de horário é "quais dessas 4 janelas o usuário quer receber",
-- não um horário livre. Uma única preferência controla email e Telegram.

alter table profiles
  add column if not exists notif_dias smallint[] not null default '{0,1,2,3,4,5,6}',
  add column if not exists notif_horarios text[] not null default '{06h,12h,16h,20h}';

-- notif_dias usa a convenção de datetime.weekday() do Python: Segunda=0 ... Domingo=6
-- (já usada em mtb_telegram.py para rotular D+1/D+2/D+3).
comment on column profiles.notif_dias is
  'Dias da semana em que o usuário quer receber email/Telegram. Segunda=0 ... Domingo=6 (convenção datetime.weekday() do Python).';

comment on column profiles.notif_horarios is
  'Janelas de envio (subconjunto de {06h,12h,16h,20h} BRT) em que o usuário quer receber email/Telegram.';

alter table profiles
  add constraint profiles_notif_dias_check
    check (notif_dias <@ array[0,1,2,3,4,5,6]::smallint[]);

alter table profiles
  add constraint profiles_notif_horarios_check
    check (notif_horarios <@ array['06h','12h','16h','20h']::text[]);
