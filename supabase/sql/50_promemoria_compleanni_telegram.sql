-- Promemoria Telegram il giorno prima del compleanno degli atleti attivi
-- della stagione corrente. La tabella non e' accessibile dal frontend.
begin;

create table if not exists public.v2_birthday_notification_log (
  reminder_for date primary key,
  processing_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
alter table public.v2_birthday_notification_log enable row level security;
revoke all on public.v2_birthday_notification_log from public, anon, authenticated;

create or replace function public.v2_claim_birthday_reminder()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := now() at time zone 'Europe/Rome';
  v_day date;
  v_names jsonb;
  v_claimed date;
begin
  -- Il cron chiama la funzione anche durante il cambio tra ora solare e legale.
  if extract(hour from v_local) < 8 or extract(hour from v_local) >= 10 then
    return null;
  end if;
  v_day := v_local::date + 1;

  select jsonb_agg(person.full_name order by person.full_name) into v_names
  from (
    select distinct a.id, a.full_name
    from public.v2_athletes a
    join public.v2_season_athletes sa on sa.athlete_id = a.id
    join public.v2_seasons s on s.id = sa.season_id
    where s.is_current = true and sa.is_active = true
      and a.birth_date is not null
      and extract(month from a.birth_date) = extract(month from v_day)
      and extract(day from a.birth_date) = extract(day from v_day)
  ) person;
  if v_names is null then return null; end if;

  insert into public.v2_birthday_notification_log(reminder_for, processing_at, attempts)
  values (v_day, now(), 1)
  on conflict (reminder_for) do update
    set processing_at = now(), attempts = public.v2_birthday_notification_log.attempts + 1,
        last_error = null
    where public.v2_birthday_notification_log.sent_at is null
      and public.v2_birthday_notification_log.processing_at < now() - interval '15 minutes'
  returning reminder_for into v_claimed;
  if v_claimed is null then return null; end if;
  return jsonb_build_object('reminder_for', v_day, 'names', v_names);
end;
$$;
revoke all on function public.v2_claim_birthday_reminder() from public, anon, authenticated;
grant execute on function public.v2_claim_birthday_reminder() to service_role;

create or replace function public.v2_finish_birthday_reminder(p_day date, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.v2_birthday_notification_log
  set sent_at = case when p_error is null then now() else sent_at end,
      last_error = left(p_error, 1000), processing_at = now()
  where reminder_for = p_day and sent_at is null;
$$;
revoke all on function public.v2_finish_birthday_reminder(date,text) from public, anon, authenticated;
grant execute on function public.v2_finish_birthday_reminder(date,text) to service_role;

commit;

