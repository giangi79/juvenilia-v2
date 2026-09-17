-- STEP 42 - Privacy dati pubblici e identificazione sicura delle righe
-- Eseguire UNA VOLTA nel SQL Editor di Supabase con "Run without RLS".
-- Nasconde al pubblico data di nascita, accompagnatore e UUID non necessari.
-- athlete_id resta necessario finche le risposte pubbliche non useranno un account personale.

begin;

create or replace function public.v2_get_public_event(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_event public.v2_events%rowtype; v_result jsonb;
begin
  select * into v_event
  from public.v2_events
  where slug=p_slug and is_published=true and is_archived=false
  limit 1;
  if not found then return null; end if;

  select jsonb_build_object(
    'event',jsonb_build_object(
      'slug',v_event.slug,
      'title',v_event.title,
      'description',v_event.description,
      'registration_deadline',v_event.registration_deadline
    ),
    'config',coalesce((
      select jsonb_object_agg(c.key,c.value)
      from public.v2_event_config c
      where c.event_id=v_event.id and c.is_public=true
    ),'{}'::jsonb),
    'timers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'label',t.label,
        'deadline',t.deadline,
        'categories',t.categories
      ) order by t.deadline)
      from public.v2_event_timers t
      where t.event_id=v_event.id
    ),'[]'::jsonb),
    'registrations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'athlete_id',a.id,
        'full_name',a.full_name,
        'category',coalesce(r.category_override,a.category),
        'gender',a.gender,
        'status',r.status,
        'has_companion',r.companion_name is not null and btrim(r.companion_name)<>'',
        'race_day',r.race_day,
        'effective_deadline',public.v2_effective_registration_deadline(v_event.id,a.id)
      ) order by coalesce(r.category_override,a.category),a.full_name)
      from public.v2_event_registrations r
      join public.v2_athletes a on a.id=r.athlete_id
      where r.event_id=v_event.id and a.is_active=true and r.is_locked=false
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.v2_get_public_event(text) from public;
grant execute on function public.v2_get_public_event(text) to anon, authenticated;

create or replace function public.v2_set_registration_status(p_event_slug text,p_athlete_id uuid,p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_event_id uuid;
begin
  if p_status not in ('yes','no') then raise exception 'INVALID_STATUS'; end if;
  select id into v_event_id from public.v2_events where slug=p_event_slug limit 1;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  perform public.v2_assert_registration_editable(v_event_id,p_athlete_id);
  update public.v2_event_registrations
  set status=p_status,
      responded_at=now(),
      companion_name=case when p_status='no' then null else companion_name end,
      race_days=case when p_status='no' then '{}'::text[] else race_days end
  where event_id=v_event_id and athlete_id=p_athlete_id;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  return jsonb_build_object('ok',true,'status',p_status);
end;
$$;

revoke all on function public.v2_set_registration_status(text,uuid,text) from public;
grant execute on function public.v2_set_registration_status(text,uuid,text) to anon, authenticated;

create or replace function public.v2_set_companion(p_event_slug text,p_athlete_id uuid,p_companion_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_clean_name text;
  v_status text;
  v_existing_name text;
begin
  select id into v_event_id
  from public.v2_events
  where slug=p_event_slug and is_published=true and is_archived=false
  limit 1;
  if not found then raise exception 'EVENT_NOT_AVAILABLE'; end if;
  perform public.v2_assert_registration_editable(v_event_id,p_athlete_id);
  v_clean_name:=nullif(upper(btrim(coalesce(p_companion_name,''))), '');
  if v_clean_name is null then raise exception 'COMPANION_NAME_REQUIRED'; end if;

  select status,companion_name into v_status,v_existing_name
  from public.v2_event_registrations
  where event_id=v_event_id and athlete_id=p_athlete_id
  for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if v_status<>'yes' then raise exception 'ATHLETE_NOT_PARTICIPATING'; end if;
  if nullif(btrim(v_existing_name),'') is not null then raise exception 'COMPANION_ALREADY_SET'; end if;

  update public.v2_event_registrations
  set companion_name=v_clean_name
  where event_id=v_event_id and athlete_id=p_athlete_id;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.v2_set_companion(text,uuid,text) from public;
grant execute on function public.v2_set_companion(text,uuid,text) to anon, authenticated;

commit;
