-- STEP 38A - Notifica Telegram immediata su PARTECIPA / NON PARTECIPA
-- V2 soltanto. Non modifica le tabelle della V1.

begin;

create or replace function public.v2_claim_telegram_status_now(
  p_event_slug text,
  p_athlete_id uuid,
  p_status text
)
returns setof public.v2_telegram_outbox
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_status not in ('yes','no') then
    return;
  end if;

  return query
  with candidate as (
    select o.id
    from public.v2_telegram_outbox o
    join public.v2_events e on e.id=o.event_id
    join public.v2_event_registrations r on r.id=o.registration_id
    where e.slug=p_event_slug
      and r.athlete_id=p_athlete_id
      and r.status=p_status
      and o.kind='status'
      and o.sent_at is null
      and o.attempts < 5
      and (o.processing_at is null or o.processing_at < now()-interval '5 minutes')
      and o.payload->>'status'=p_status
    order by o.created_at desc
    for update of o skip locked
    limit 1
  )
  update public.v2_telegram_outbox o
  set processing_at=now(),
      attempts=o.attempts+1
  from candidate c
  where o.id=c.id
  returning o.*;
end;
$$;

revoke all on function public.v2_claim_telegram_status_now(text,uuid,text) from public,anon,authenticated;
grant execute on function public.v2_claim_telegram_status_now(text,uuid,text) to service_role;


-- Il cron dello Step 37B da questo momento preleva SOLO le scadenze.
-- Le notifiche PARTECIPA / NON PARTECIPA vengono inviate esclusivamente
-- dalla chiamata immediata generata dal click dell'utente.
create or replace function public.v2_claim_telegram_deadline_outbox(p_limit integer default 50)
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
    where o.kind='deadline'
      and o.sent_at is null
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

revoke all on function public.v2_claim_telegram_deadline_outbox(integer) from public,anon,authenticated;
grant execute on function public.v2_claim_telegram_deadline_outbox(integer) to service_role;

commit;
