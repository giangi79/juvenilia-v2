-- JUVENILIA V2 — STEP 37A — TELEGRAM SERVER-SIDE
-- Non modifica il vecchio sistema.
-- Eseguire in Supabase SQL Editor con privilegi amministrativi.

begin;

alter table public.v2_events
  add column if not exists telegram_deadline_sent_at timestamptz;

create table if not exists public.v2_telegram_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.v2_events(id) on delete cascade,
  registration_id uuid references public.v2_event_registrations(id) on delete set null,
  kind text not null check (kind in ('status','deadline')),
  dedupe_key text unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processing_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index if not exists v2_telegram_outbox_pending_idx
  on public.v2_telegram_outbox(sent_at, processing_at, created_at);

alter table public.v2_telegram_outbox enable row level security;

revoke all on public.v2_telegram_outbox from anon, authenticated;

create or replace function public.v2_enqueue_telegram_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_enabled boolean := false;
  v_event_title text;
  v_athlete_name text;
  v_category text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status not in ('yes','no') then
    return new;
  end if;

  select exists(
    select 1
    from public.v2_event_config c
    where c.event_id=new.event_id
      and c.key='telegram_status_enabled'
      and c.value='true'::jsonb
  ) into v_enabled;

  if not v_enabled then
    return new;
  end if;

  select e.title, a.full_name, coalesce(new.category_override,a.category)
    into v_event_title, v_athlete_name, v_category
  from public.v2_events e
  join public.v2_athletes a on a.id=new.athlete_id
  where e.id=new.event_id;

  insert into public.v2_telegram_outbox(
    event_id,registration_id,kind,payload
  ) values (
    new.event_id,
    new.id,
    'status',
    jsonb_build_object(
      'event_title',v_event_title,
      'athlete_name',v_athlete_name,
      'category',v_category,
      'status',new.status,
      'companion_name',new.companion_name,
      'responded_at',new.responded_at
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_v2_enqueue_telegram_status on public.v2_event_registrations;
create trigger trg_v2_enqueue_telegram_status
after update of status on public.v2_event_registrations
for each row execute function public.v2_enqueue_telegram_status();

revoke all on function public.v2_enqueue_telegram_status() from public,anon,authenticated;

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

create or replace function public.v2_claim_telegram_outbox(p_limit integer default 50)
returns setof public.v2_telegram_outbox
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with claimed as (
    select o.id
    from public.v2_telegram_outbox o
    where o.sent_at is null
      and o.attempts < 5
      and (o.processing_at is null or o.processing_at < now()-interval '5 minutes')
    order by o.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,50),100))
  )
  update public.v2_telegram_outbox o
  set processing_at=now(),attempts=o.attempts+1
  from claimed c
  where o.id=c.id
  returning o.*;
end;
$$;

revoke all on function public.v2_claim_telegram_outbox(integer) from public,anon,authenticated;
grant execute on function public.v2_claim_telegram_outbox(integer) to service_role;

create or replace function public.v2_finish_telegram_outbox(p_id uuid,p_error text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.v2_telegram_outbox
  set
    processing_at=null,
    sent_at=case when p_error is null then now() else sent_at end,
    last_error=p_error
  where id=p_id;
end;
$$;

revoke all on function public.v2_finish_telegram_outbox(uuid,text) from public,anon,authenticated;
grant execute on function public.v2_finish_telegram_outbox(uuid,text) to service_role;

create or replace function public.v2_reset_telegram_deadline_flags(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_n integer := 0;
  v_rows integer := 0;
begin
  if not public.v2_is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  update public.v2_events
  set telegram_deadline_sent_at=null
  where id=p_event_id;
  get diagnostics v_rows=row_count;
  v_n:=v_n+v_rows;

  update public.v2_event_timers
  set notification_sent_at=null
  where event_id=p_event_id;
  get diagnostics v_rows=row_count;
  v_n:=v_n+v_rows;

  delete from public.v2_telegram_outbox
  where event_id=p_event_id and kind='deadline';
  get diagnostics v_rows=row_count;
  v_n:=v_n+v_rows;

  return v_n;
end;
$$;

revoke all on function public.v2_reset_telegram_deadline_flags(uuid) from public,anon;
grant execute on function public.v2_reset_telegram_deadline_flags(uuid) to authenticated;

-- Le impostazioni Telegram restano private.
update public.v2_event_config
set is_public=false
where key in ('telegram_status_enabled','telegram_deadline_enabled');

commit;

-- Genera una chiave casuale per autenticare il Cron verso la Edge Function.
-- Se esiste già, la conserva.
do $$
begin
  if not exists(
    select 1 from vault.decrypted_secrets where name='telegram_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'telegram_cron_secret',
      'Juvenilia V2 Telegram cron secret'
    );
  end if;
end $$;

-- COPIA il valore restituito e salvalo nei Secrets della Edge Function
-- con nome TELEGRAM_CRON_SECRET. Non inserirlo nei file del sito.
select decrypted_secret as TELEGRAM_CRON_SECRET
from vault.decrypted_secrets
where name='telegram_cron_secret'
limit 1;
