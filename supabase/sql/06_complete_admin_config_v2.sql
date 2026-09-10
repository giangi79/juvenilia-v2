-- Juvenilia Racing Team V2 - STEP 06
-- Eseguire con Run without RLS. Non tocca il vecchio sistema.

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
  select * into v_event from public.v2_events where slug=p_slug and is_published=true and is_archived=false limit 1;
  if not found then return null; end if;
  select jsonb_build_object(
    'event',jsonb_build_object('id',v_event.id,'slug',v_event.slug,'title',v_event.title,'description',v_event.description,'registration_deadline',v_event.registration_deadline),
    'config',coalesce((select jsonb_object_agg(c.key,c.value) from public.v2_event_config c where c.event_id=v_event.id and c.is_public=true),'{}'::jsonb),
    'timers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'deadline',t.deadline,'categories',t.categories) order by t.deadline) from public.v2_event_timers t where t.event_id=v_event.id),'[]'::jsonb),
    'registrations',coalesce((select jsonb_agg(jsonb_build_object('registration_id',r.id,'athlete_id',a.id,'full_name',a.full_name,'category',coalesce(r.category_override,a.category),'gender',a.gender,'status',r.status,'companion_name',r.companion_name,'race_day',r.race_day,'effective_deadline',public.v2_effective_registration_deadline(v_event.id,a.id)) order by coalesce(r.category_override,a.category),a.full_name) from public.v2_event_registrations r join public.v2_athletes a on a.id=r.athlete_id where r.event_id=v_event.id and a.is_active=true and r.is_locked=false),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;$$;

revoke all on function public.v2_get_public_event(text) from public;
grant execute on function public.v2_get_public_event(text) to anon, authenticated;

commit;

select public.v2_get_public_event('gara-v2-test') as public_event_test;
