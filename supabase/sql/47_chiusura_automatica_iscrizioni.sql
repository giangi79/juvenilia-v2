-- STEP 47 - Chiude le sole risposte ancora in attesa alla loro scadenza effettiva.
-- Da eseguire una volta nel SQL Editor di Supabase, con privilegi amministrativi.
-- Non modifica iscrizioni gia' confermate o rifiutate dall'atleta.

begin;

create extension if not exists pg_cron;

alter table public.v2_event_registrations
  add column if not exists auto_declined_at timestamptz;

-- Una successiva modifica manuale dello stato elimina la causa automatica.
create or replace function public.v2_clear_auto_decline_on_manual_change()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.status is distinct from old.status
     and new.auto_declined_at is not distinct from old.auto_declined_at then
    new.auto_declined_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_v2_clear_auto_decline on public.v2_event_registrations;
create trigger trg_v2_clear_auto_decline
before update of status on public.v2_event_registrations
for each row execute function public.v2_clear_auto_decline_on_manual_change();

-- Il cambio automatico non genera una notifica Telegram per ogni atleta.
-- Il riepilogo alla scadenza continua a mostrare i conteggi aggiornati.
drop trigger if exists trg_v2_enqueue_telegram_status on public.v2_event_registrations;
create trigger trg_v2_enqueue_telegram_status
after update of status on public.v2_event_registrations
for each row
when (new.auto_declined_at is null)
execute function public.v2_enqueue_telegram_status();

create or replace function public.v2_auto_close_pending_registrations()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.v2_event_registrations r
  set status='no', auto_declined_at=now(), responded_at=null
  from public.v2_events e
  where e.id=r.event_id
    and e.is_published=true
    and e.is_archived=false
    and r.status='pending'
    and public.v2_effective_registration_deadline(r.event_id,r.athlete_id) <= now();

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.v2_auto_close_pending_registrations() from public,anon,authenticated;

-- Il cron e' indipendente dalle impostazioni e dalla disponibilita' di Telegram.
do $$
begin
  if exists(select 1 from cron.job where jobname='juvenilia-v2-auto-close-pending') then
    perform cron.unschedule('juvenilia-v2-auto-close-pending');
  end if;
end $$;

select cron.schedule(
  'juvenilia-v2-auto-close-pending',
  '* * * * *',
  'select public.v2_auto_close_pending_registrations();'
);

-- Se e' attivo Telegram, prima del riepilogo alla scadenza chiude le risposte
-- ancora sospese, anche quando i due cron partono nello stesso minuto.
create or replace function public.v2_enqueue_due_telegram_deadlines()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
begin
  perform public.v2_auto_close_pending_registrations();

  insert into public.v2_telegram_outbox(event_id,kind,dedupe_key,payload)
  select
    e.id,
    'deadline',
    'deadline:event:'||e.id::text,
    jsonb_build_object(
      'scope','event',
      'event_title',e.title,
      'deadline',e.registration_deadline
    )
  from public.v2_events e
  where e.is_published=true
    and e.is_archived=false
    and e.registration_deadline is not null
    and e.registration_deadline <= now()
    and e.registration_deadline > now()-interval '24 hours'
    and e.telegram_deadline_sent_at is null
    and exists(
      select 1 from public.v2_event_config c
      where c.event_id=e.id
        and c.key='telegram_deadline_enabled'
        and c.value='true'::jsonb
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.v2_telegram_outbox(event_id,kind,dedupe_key,payload)
  select
    t.event_id,
    'deadline',
    'deadline:timer:'||t.id::text,
    jsonb_build_object(
      'scope','timer',
      'timer_id',t.id,
      'event_title',e.title,
      'label',t.label,
      'deadline',t.deadline,
      'categories',to_jsonb(t.categories)
    )
  from public.v2_event_timers t
  join public.v2_events e on e.id=t.event_id
  where e.is_published=true
    and e.is_archived=false
    and t.deadline <= now()
    and t.deadline > now()-interval '24 hours'
    and t.notification_sent_at is null
    and exists(
      select 1 from public.v2_event_config c
      where c.event_id=t.event_id
        and c.key='telegram_deadline_enabled'
        and c.value='true'::jsonb
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  return v_count;
end;
$$;

revoke all on function public.v2_enqueue_due_telegram_deadlines() from public,anon,authenticated;
grant execute on function public.v2_enqueue_due_telegram_deadlines() to service_role;

commit;

-- Verifica: il job deve risultare attivo.
select jobname,schedule,active from cron.job
where jobname='juvenilia-v2-auto-close-pending';
