-- STEP 43 - Storico pubblico gare, atleti e categorie
-- Eseguire UNA VOLTA nel SQL Editor di Supabase con "Run without RLS".
-- Non espone date di nascita, accompagnatori, email o identificativi tecnici.

begin;

create or replace function public.v2_get_public_history()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with eligible_events as (
  select e.*
  from public.v2_events e
  where e.is_published=true or e.is_archived=true
),
event_rows as (
  select
    e.id,
    e.title,
    e.slug,
    e.is_archived,
    e.is_published,
    e.registration_deadline,
    e.created_at,
    coalesce((select c.value from public.v2_event_config c where c.event_id=e.id and c.key='event_days' limit 1),'[]'::jsonb) as event_days,
    count(r.id)::integer as total_count,
    count(*) filter (where r.status='yes')::integer as yes_count,
    count(*) filter (where r.status='no')::integer as no_count,
    count(*) filter (where r.status='pending')::integer as pending_count
  from eligible_events e
  left join public.v2_event_registrations r on r.event_id=e.id
  group by e.id,e.title,e.slug,e.is_archived,e.is_published,e.registration_deadline,e.created_at
),
event_categories as (
  select
    r.event_id,
    coalesce(r.category_override,a.category,'SENZA CATEGORIA') as category,
    count(*)::integer as total_count,
    count(*) filter (where r.status='yes')::integer as yes_count
  from public.v2_event_registrations r
  join eligible_events e on e.id=r.event_id
  join public.v2_athletes a on a.id=r.athlete_id
  group by r.event_id,coalesce(r.category_override,a.category,'SENZA CATEGORIA')
),
athlete_rows as (
  select
    a.id as athlete_id,
    a.full_name,
    a.category,
    a.gender,
    count(r.id)::integer as total_count,
    count(*) filter (where r.status='yes')::integer as yes_count,
    count(*) filter (where r.status='no')::integer as no_count,
    count(*) filter (where r.status='pending')::integer as pending_count
  from public.v2_event_registrations r
  join eligible_events e on e.id=r.event_id
  join public.v2_athletes a on a.id=r.athlete_id
  group by a.id,a.full_name,a.category,a.gender
),
category_rows as (
  select
    coalesce(r.category_override,a.category,'SENZA CATEGORIA') as category,
    count(*)::integer as total_count,
    count(*) filter (where r.status='yes')::integer as yes_count,
    count(*) filter (where r.status='no')::integer as no_count,
    count(*) filter (where r.status='pending')::integer as pending_count
  from public.v2_event_registrations r
  join eligible_events e on e.id=r.event_id
  join public.v2_athletes a on a.id=r.athlete_id
  group by coalesce(r.category_override,a.category,'SENZA CATEGORIA')
),
totals as (
  select
    (select count(*) from eligible_events)::integer as events_total,
    (select count(*) from athlete_rows)::integer as athletes_total,
    coalesce((select sum(total_count) from event_rows),0)::integer as registrations_total,
    coalesce((select sum(yes_count) from event_rows),0)::integer as yes_total,
    coalesce((select sum(no_count) from event_rows),0)::integer as no_total,
    coalesce((select sum(pending_count) from event_rows),0)::integer as pending_total
)
select jsonb_build_object(
  'summary',(select jsonb_build_object(
    'events_total',events_total,
    'athletes_total',athletes_total,
    'registrations_total',registrations_total,
    'yes_total',yes_total,
    'no_total',no_total,
    'pending_total',pending_total,
    'participation_rate',case when registrations_total>0 then round(yes_total*100.0/registrations_total,1) else 0 end
  ) from totals),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'title',er.title,
    'slug',case when er.is_published and not er.is_archived then er.slug else null end,
    'is_archived',er.is_archived,
    'event_days',er.event_days,
    'total_count',er.total_count,
    'yes_count',er.yes_count,
    'no_count',er.no_count,
    'pending_count',er.pending_count,
    'participation_rate',case when er.total_count>0 then round(er.yes_count*100.0/er.total_count,1) else 0 end,
    'confirmed_athletes',coalesce((select jsonb_agg(jsonb_build_object(
      'full_name',a3.full_name,
      'category',coalesce(r3.category_override,a3.category,'SENZA CATEGORIA')
    ) order by coalesce(r3.category_override,a3.category,'SENZA CATEGORIA'),a3.full_name)
    from public.v2_event_registrations r3
    join public.v2_athletes a3 on a3.id=r3.athlete_id
    where r3.event_id=er.id and r3.status='yes'),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(jsonb_build_object(
      'category',ec.category,'total_count',ec.total_count,'yes_count',ec.yes_count
    ) order by ec.category) from event_categories ec where ec.event_id=er.id),'[]'::jsonb)
  ) order by er.created_at desc) from event_rows er),'[]'::jsonb),
  'athletes',coalesce((select jsonb_agg(jsonb_build_object(
    'full_name',ar.full_name,
    'category',ar.category,
    'gender',ar.gender,
    'total_count',ar.total_count,
    'yes_count',ar.yes_count,
    'no_count',ar.no_count,
    'pending_count',ar.pending_count,
    'participation_rate',case when ar.total_count>0 then round(ar.yes_count*100.0/ar.total_count,1) else 0 end,
    'attended_events',coalesce((select jsonb_agg(jsonb_build_object(
      'title',er.title,
      'event_days',er.event_days,
      'is_archived',er.is_archived,
      'is_registration_closed',(er.is_archived or (er.registration_deadline is not null and er.registration_deadline<=now()))
    ) order by er.created_at desc)
    from public.v2_event_registrations r2
    join event_rows er on er.id=r2.event_id
    where r2.athlete_id=ar.athlete_id and r2.status='yes'),'[]'::jsonb)
  ) order by ar.yes_count desc,ar.full_name) from athlete_rows ar),'[]'::jsonb),
  'categories',coalesce((select jsonb_agg(jsonb_build_object(
    'category',category,
    'total_count',total_count,
    'yes_count',yes_count,
    'no_count',no_count,
    'pending_count',pending_count,
    'participation_rate',case when total_count>0 then round(yes_count*100.0/total_count,1) else 0 end
  ) order by category) from category_rows),'[]'::jsonb)
);
$$;

revoke all on function public.v2_get_public_history() from public;
grant execute on function public.v2_get_public_history() to anon, authenticated;

commit;
