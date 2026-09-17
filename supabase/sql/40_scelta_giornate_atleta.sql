-- Scelta multipla giorni gara per atleta
-- Eseguire UNA VOLTA nel SQL Editor di Supabase prima di usare la funzione.

begin;

alter table public.v2_event_registrations
  add column if not exists race_days text[] not null default '{}';

create or replace function public.v2_get_public_registration_days(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_result jsonb;
begin
  select id into v_event_id
  from public.v2_events
  where slug=p_slug and is_published=true and is_archived=false
  limit 1;
  if not found then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('athlete_id',r.athlete_id,'race_days',to_jsonb(coalesce(r.race_days,'{}'::text[])))),'[]'::jsonb)
  into v_result
  from public.v2_event_registrations r
  join public.v2_athletes a on a.id=r.athlete_id
  where r.event_id=v_event_id and r.is_locked=false and a.is_active=true;
  return v_result;
end;
$$;
revoke all on function public.v2_get_public_registration_days(text) from public;
grant execute on function public.v2_get_public_registration_days(text) to anon;
grant execute on function public.v2_get_public_registration_days(text) to authenticated;

create or replace function public.v2_set_registration_days(p_event_slug text,p_athlete_id uuid,p_days text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_status text;
  v_allowed text[] := '{}';
  v_clean text[] := '{}';
  v_day text;
begin
  select id into v_event_id from public.v2_events where slug=p_event_slug limit 1;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  perform public.v2_assert_registration_editable(v_event_id,p_athlete_id);
  select status into v_status from public.v2_event_registrations where event_id=v_event_id and athlete_id=p_athlete_id;
  if v_status <> 'yes' then raise exception 'ATHLETE_NOT_PARTICIPATING'; end if;
  select coalesce(array(select jsonb_array_elements_text(value)),'{}'::text[])
  into v_allowed from public.v2_event_config where event_id=v_event_id and key='athlete_weekdays' limit 1;
  if cardinality(v_allowed)=0 then raise exception 'RACE_DAYS_NOT_ENABLED'; end if;
  foreach v_day in array coalesce(p_days,'{}'::text[]) loop
    v_day := upper(btrim(v_day));
    if not (v_day = any(v_allowed)) then raise exception 'INVALID_RACE_DAY: %',v_day; end if;
    if not (v_day = any(v_clean)) then v_clean := array_append(v_clean,v_day); end if;
  end loop;
  update public.v2_event_registrations set race_days=v_clean where event_id=v_event_id and athlete_id=p_athlete_id;
  return jsonb_build_object('ok',true,'race_days',to_jsonb(v_clean));
end;
$$;
revoke all on function public.v2_set_registration_days(text,uuid,text[]) from public;
grant execute on function public.v2_set_registration_days(text,uuid,text[]) to anon;
grant execute on function public.v2_set_registration_days(text,uuid,text[]) to authenticated;

create or replace function public.v2_set_registration_status(p_event_slug text,p_athlete_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_registration_id uuid;
begin
  if p_status not in ('yes','no') then raise exception 'INVALID_STATUS'; end if;
  select id into v_event_id from public.v2_events where slug=p_event_slug limit 1;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  perform public.v2_assert_registration_editable(v_event_id,p_athlete_id);
  update public.v2_event_registrations
  set status=p_status,responded_at=now(),companion_name=case when p_status='no' then null else companion_name end,race_days=case when p_status='no' then '{}'::text[] else race_days end
  where event_id=v_event_id and athlete_id=p_athlete_id returning id into v_registration_id;
  return jsonb_build_object('ok',true,'status',p_status);
end;
$$;
revoke all on function public.v2_set_registration_status(text,uuid,text) from public;
grant execute on function public.v2_set_registration_status(text,uuid,text) to anon;
grant execute on function public.v2_set_registration_status(text,uuid,text) to authenticated;

commit;
