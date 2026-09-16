-- Conferma pubblica atomica: PARTECIPA + giorni gara.
-- Dopo la conferma i giorni non sono più modificabili dal pubblico.
-- L'admin continua a poterli modificare direttamente da v2_event_registrations.

begin;

create or replace function public.v2_confirm_registration_with_days(
  p_event_slug text,
  p_athlete_id uuid,
  p_days text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_status text;
  v_existing text[];
  v_allowed text[] := '{}';
  v_clean text[] := '{}';
  v_day text;
begin
  select id into v_event_id
  from public.v2_events
  where slug=p_event_slug and is_published=true and is_archived=false
  limit 1;
  if not found then raise exception 'EVENT_NOT_AVAILABLE'; end if;

  perform public.v2_assert_registration_editable(v_event_id,p_athlete_id);

  select status,coalesce(race_days,'{}'::text[])
  into v_status,v_existing
  from public.v2_event_registrations
  where event_id=v_event_id and athlete_id=p_athlete_id
  for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;

  if v_status='yes' or cardinality(v_existing)>0 then
    raise exception 'RACE_DAYS_ALREADY_CONFIRMED';
  end if;

  select coalesce(array(select jsonb_array_elements_text(value)),'{}'::text[])
  into v_allowed
  from public.v2_event_config
  where event_id=v_event_id and key='athlete_weekdays'
  limit 1;

  if cardinality(v_allowed)=0 then raise exception 'RACE_DAYS_NOT_ENABLED'; end if;
  if cardinality(coalesce(p_days,'{}'::text[]))=0 then raise exception 'SELECT_AT_LEAST_ONE_DAY'; end if;

  foreach v_day in array p_days loop
    v_day:=upper(btrim(v_day));
    if not (v_day=any(v_allowed)) then raise exception 'INVALID_RACE_DAY: %',v_day; end if;
    if not (v_day=any(v_clean)) then v_clean:=array_append(v_clean,v_day); end if;
  end loop;

  update public.v2_event_registrations
  set status='yes',responded_at=now(),race_days=v_clean
  where event_id=v_event_id and athlete_id=p_athlete_id;

  return jsonb_build_object('ok',true,'status','yes','race_days',to_jsonb(v_clean));
end;
$$;

revoke all on function public.v2_confirm_registration_with_days(text,uuid,text[]) from public;
grant execute on function public.v2_confirm_registration_with_days(text,uuid,text[]) to anon;
grant execute on function public.v2_confirm_registration_with_days(text,uuid,text[]) to authenticated;

-- La vecchia RPC non deve più permettere modifiche dei giorni dal frontend.
-- L'Admin modifica race_days direttamente sulla tabella, protetta da RLS admin.
revoke execute on function public.v2_set_registration_days(text,uuid,text[]) from anon;
revoke execute on function public.v2_set_registration_days(text,uuid,text[]) from authenticated;

commit;
