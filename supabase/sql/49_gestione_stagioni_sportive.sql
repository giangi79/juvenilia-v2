-- STEP 49 - Stagioni sportive, rose stagionali e categorie storiche.
-- VERSIONE DI PROVA: eseguire nel SQL Editor prima di provare il pacchetto locale.
-- Compatibile con il frontend attuale: non elimina e non rinomina dati esistenti.

begin;

create table if not exists public.v2_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_seasons_dates_check check (end_date >= start_date),
  constraint v2_seasons_name_check check (name ~ '^\d{4}/\d{4}$')
);

create unique index if not exists v2_seasons_one_current_idx
  on public.v2_seasons (is_current) where is_current=true;

drop trigger if exists trg_v2_seasons_updated_at on public.v2_seasons;
create trigger trg_v2_seasons_updated_at before update on public.v2_seasons
for each row execute function public.v2_set_updated_at();

create table if not exists public.v2_season_athletes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.v2_seasons(id) on delete cascade,
  athlete_id uuid not null references public.v2_athletes(id) on delete restrict,
  category text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_season_athletes_unique unique (season_id,athlete_id),
  constraint v2_season_athletes_category_check check (btrim(category)<>'')
);

create index if not exists v2_season_athletes_season_idx
  on public.v2_season_athletes(season_id,is_active);
create index if not exists v2_season_athletes_athlete_idx
  on public.v2_season_athletes(athlete_id);

drop trigger if exists trg_v2_season_athletes_updated_at on public.v2_season_athletes;
create trigger trg_v2_season_athletes_updated_at before update on public.v2_season_athletes
for each row execute function public.v2_set_updated_at();

insert into public.v2_seasons(name,start_date,end_date,is_current)
values ('2025/2026','2025-07-01','2026-06-30',false)
on conflict (name) do nothing;

update public.v2_seasons
set is_current=true
where name='2025/2026'
  and not exists (select 1 from public.v2_seasons where is_current=true);

insert into public.v2_season_athletes(season_id,athlete_id,category,is_active)
select s.id,a.id,a.category,a.is_active
from public.v2_seasons s cross join public.v2_athletes a
where s.name='2025/2026'
on conflict (season_id,athlete_id) do nothing;

alter table public.v2_events add column if not exists season_id uuid;
update public.v2_events e set season_id=s.id
from public.v2_seasons s
where e.season_id is null and s.name='2025/2026';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='v2_events_season_id_fkey' and conrelid='public.v2_events'::regclass
  ) then
    alter table public.v2_events add constraint v2_events_season_id_fkey
      foreign key (season_id) references public.v2_seasons(id) on delete restrict;
  end if;
end $$;
alter table public.v2_events alter column season_id set not null;
create index if not exists v2_events_season_idx on public.v2_events(season_id,created_at desc);

create or replace function public.v2_assign_current_season_to_event()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.season_id is null then
    select id into new.season_id from public.v2_seasons where is_current=true limit 1;
  end if;
  if new.season_id is null then raise exception 'CURRENT_SEASON_NOT_CONFIGURED'; end if;
  return new;
end;
$$;
drop trigger if exists trg_v2_assign_current_season_to_event on public.v2_events;
create trigger trg_v2_assign_current_season_to_event before insert on public.v2_events
for each row execute function public.v2_assign_current_season_to_event();

alter table public.v2_event_registrations add column if not exists category_snapshot text;
update public.v2_event_registrations r
set category_snapshot=coalesce(nullif(btrim(r.category_override),''),a.category)
from public.v2_athletes a
where a.id=r.athlete_id and r.category_snapshot is null;
alter table public.v2_event_registrations alter column category_snapshot set not null;

create or replace function public.v2_fill_registration_category_snapshot()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.category_snapshot is null or btrim(new.category_snapshot)='' then
    select coalesce(sa.category,a.category) into new.category_snapshot
    from public.v2_athletes a
    left join public.v2_events e on e.id=new.event_id
    left join public.v2_season_athletes sa on sa.season_id=e.season_id and sa.athlete_id=new.athlete_id
    where a.id=new.athlete_id;
  end if;
  if new.category_snapshot is null then raise exception 'REGISTRATION_CATEGORY_REQUIRED'; end if;
  return new;
end;
$$;
drop trigger if exists trg_v2_fill_registration_category_snapshot on public.v2_event_registrations;
create trigger trg_v2_fill_registration_category_snapshot
before insert or update of athlete_id,event_id,category_snapshot on public.v2_event_registrations
for each row execute function public.v2_fill_registration_category_snapshot();

alter table public.v2_seasons enable row level security;
alter table public.v2_season_athletes enable row level security;
revoke all on table public.v2_seasons,public.v2_season_athletes from anon;
grant select,insert,update,delete on table public.v2_seasons,public.v2_season_athletes to authenticated;

drop policy if exists v2_seasons_admin_select on public.v2_seasons;
drop policy if exists v2_seasons_admin_insert on public.v2_seasons;
drop policy if exists v2_seasons_admin_update on public.v2_seasons;
drop policy if exists v2_seasons_admin_delete on public.v2_seasons;
create policy v2_seasons_admin_select on public.v2_seasons for select to authenticated
using ((select public.v2_is_admin()));
create policy v2_seasons_admin_insert on public.v2_seasons for insert to authenticated
with check ((select public.v2_is_admin()));
create policy v2_seasons_admin_update on public.v2_seasons for update to authenticated
using ((select public.v2_is_admin())) with check ((select public.v2_is_admin()));
create policy v2_seasons_admin_delete on public.v2_seasons for delete to authenticated
using ((select public.v2_is_admin()));

drop policy if exists v2_season_athletes_admin_select on public.v2_season_athletes;
drop policy if exists v2_season_athletes_admin_insert on public.v2_season_athletes;
drop policy if exists v2_season_athletes_admin_update on public.v2_season_athletes;
drop policy if exists v2_season_athletes_admin_delete on public.v2_season_athletes;
create policy v2_season_athletes_admin_select on public.v2_season_athletes for select to authenticated
using ((select public.v2_is_admin()));
create policy v2_season_athletes_admin_insert on public.v2_season_athletes for insert to authenticated
with check ((select public.v2_is_admin()));
create policy v2_season_athletes_admin_update on public.v2_season_athletes for update to authenticated
using ((select public.v2_is_admin())) with check ((select public.v2_is_admin()));
create policy v2_season_athletes_admin_delete on public.v2_season_athletes for delete to authenticated
using ((select public.v2_is_admin()));

create or replace function public.v2_guard_locked_season_roster()
returns trigger language plpgsql set search_path=public as $$
declare v_season_id uuid; v_locked boolean;
begin
  if tg_op='DELETE' then v_season_id:=old.season_id; else v_season_id:=new.season_id; end if;
  select is_locked into v_locked from public.v2_seasons where id=v_season_id;
  if v_locked then raise exception 'SEASON_LOCKED'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists trg_v2_guard_locked_season_roster on public.v2_season_athletes;
create trigger trg_v2_guard_locked_season_roster
before insert or update or delete on public.v2_season_athletes
for each row execute function public.v2_guard_locked_season_roster();

create or replace function public.v2_create_season(
  p_name text,p_start_date date,p_end_date date,p_copy_from uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_name text:=btrim(coalesce(p_name,''));
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if v_name !~ '^\d{4}/\d{4}$' then raise exception 'INVALID_SEASON_NAME'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'INVALID_SEASON_DATES'; end if;
  insert into public.v2_seasons(name,start_date,end_date) values(v_name,p_start_date,p_end_date)
  returning id into v_id;
  if p_copy_from is not null then
    insert into public.v2_season_athletes(season_id,athlete_id,category,is_active)
    select v_id,sa.athlete_id,sa.category,true
    from public.v2_season_athletes sa
    where sa.season_id=p_copy_from and sa.is_active=true;
  end if;
  return v_id;
end;
$$;
revoke all on function public.v2_create_season(text,date,date,uuid) from public,anon;
grant execute on function public.v2_create_season(text,date,date,uuid) to authenticated;

create or replace function public.v2_set_current_season(p_season_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.v2_seasons where id=p_season_id) then raise exception 'SEASON_NOT_FOUND'; end if;
  update public.v2_seasons set is_current=false where is_current=true;
  update public.v2_seasons set is_current=true where id=p_season_id;
  update public.v2_athletes a
  set category=sa.category,is_active=sa.is_active
  from public.v2_season_athletes sa
  where sa.season_id=p_season_id and sa.athlete_id=a.id;
  update public.v2_athletes a set is_active=false
  where not exists(select 1 from public.v2_season_athletes sa where sa.season_id=p_season_id and sa.athlete_id=a.id);
end;
$$;
revoke all on function public.v2_set_current_season(uuid) from public,anon;
grant execute on function public.v2_set_current_season(uuid) to authenticated;

create or replace function public.v2_set_season_locked(p_season_id uuid,p_locked boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.v2_seasons set is_locked=coalesce(p_locked,false) where id=p_season_id;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.v2_set_season_locked(uuid,boolean) from public,anon;
grant execute on function public.v2_set_season_locked(uuid,boolean) to authenticated;

create or replace function public.v2_sync_season_athlete_to_events(p_season_id uuid,p_athlete_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_category text; v_active boolean; v_count integer:=0;
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select category,is_active into v_category,v_active from public.v2_season_athletes
  where season_id=p_season_id and athlete_id=p_athlete_id;
  if not found then raise exception 'SEASON_ATHLETE_NOT_FOUND'; end if;
  if not v_active then return 0; end if;
  insert into public.v2_event_registrations(event_id,athlete_id,status,category_snapshot)
  select e.id,p_athlete_id,'pending',v_category from public.v2_events e
  where e.season_id=p_season_id and e.is_archived=false
    and not exists (
      select 1 from public.v2_event_config c
      where c.event_id=e.id and c.key='allowed_categories'
        and jsonb_typeof(c.value)='array' and not (c.value ? v_category)
    )
    and not exists (
      select 1 from public.v2_event_registrations r
      where r.event_id=e.id and r.athlete_id=p_athlete_id
    );
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.v2_sync_season_athlete_to_events(uuid,uuid) from public,anon;
grant execute on function public.v2_sync_season_athlete_to_events(uuid,uuid) to authenticated;

create or replace function public.v2_set_season_athlete_active(
  p_season_id uuid,p_athlete_id uuid,p_active boolean
) returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.v2_season_athletes set is_active=coalesce(p_active,false)
  where season_id=p_season_id and athlete_id=p_athlete_id;
  if not found then raise exception 'SEASON_ATHLETE_NOT_FOUND'; end if;
  if exists(select 1 from public.v2_seasons where id=p_season_id and is_current=true) then
    update public.v2_athletes set is_active=coalesce(p_active,false) where id=p_athlete_id;
  end if;
  if p_active then
    return public.v2_sync_season_athlete_to_events(p_season_id,p_athlete_id);
  end if;
  delete from public.v2_event_registrations r using public.v2_events e
  where r.event_id=e.id and e.season_id=p_season_id and e.is_archived=false
    and r.athlete_id=p_athlete_id and r.status='pending';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.v2_set_season_athlete_active(uuid,uuid,boolean) from public,anon;
grant execute on function public.v2_set_season_athlete_active(uuid,uuid,boolean) to authenticated;

create or replace function public.v2_update_season_athlete_category(
  p_season_id uuid,p_athlete_id uuid,p_category text
) returns integer language plpgsql security definer set search_path=public as $$
declare v_category text:=upper(btrim(coalesce(p_category,'')));v_count integer:=0;
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if v_category='' then raise exception 'CATEGORY_REQUIRED'; end if;
  update public.v2_season_athletes set category=v_category
  where season_id=p_season_id and athlete_id=p_athlete_id;
  if not found then raise exception 'SEASON_ATHLETE_NOT_FOUND'; end if;
  if exists(select 1 from public.v2_seasons where id=p_season_id and is_current=true) then
    update public.v2_athletes set category=v_category where id=p_athlete_id;
  end if;
  update public.v2_event_registrations r set category_snapshot=v_category
  from public.v2_events e
  where r.event_id=e.id and e.season_id=p_season_id and e.is_archived=false
    and r.athlete_id=p_athlete_id and r.status='pending' and r.category_override is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.v2_update_season_athlete_category(uuid,uuid,text) from public,anon;
grant execute on function public.v2_update_season_athlete_category(uuid,uuid,text) to authenticated;

drop function if exists public.v2_admin_list_active_categories();
create function public.v2_admin_list_active_categories(p_season_id uuid default null)
returns text[] language plpgsql stable security definer set search_path=public as $$
declare v_categories text[];
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select coalesce(array_agg(distinct btrim(sa.category) order by btrim(sa.category)),'{}'::text[])
  into v_categories from public.v2_season_athletes sa
  where sa.is_active=true and sa.category is not null and btrim(sa.category)<>''
    and sa.season_id=coalesce(p_season_id,(select id from public.v2_seasons where is_current=true limit 1));
  return v_categories;
end;
$$;
revoke all on function public.v2_admin_list_active_categories(uuid) from public,anon;
grant execute on function public.v2_admin_list_active_categories(uuid) to authenticated;

create or replace function public.v2_effective_registration_deadline(p_event_id uuid,p_athlete_id uuid)
returns timestamptz language sql stable security definer set search_path=public as $$
  with athlete_data as (
    select coalesce(r.category_override,r.category_snapshot,a.category) category_name
    from public.v2_event_registrations r join public.v2_athletes a on a.id=r.athlete_id
    where r.event_id=p_event_id and r.athlete_id=p_athlete_id limit 1
  ), deadlines as (
    select e.registration_deadline deadline from public.v2_events e
    where e.id=p_event_id and e.registration_deadline is not null
    union all
    select t.deadline from public.v2_event_timers t cross join athlete_data ad
    where t.event_id=p_event_id and (cardinality(t.categories)=0 or ad.category_name=any(t.categories))
  ) select min(deadline) from deadlines;
$$;
revoke all on function public.v2_effective_registration_deadline(uuid,uuid) from public,anon,authenticated;

create or replace function public.v2_assert_registration_editable(p_event_id uuid,p_athlete_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_published boolean;v_archived boolean;v_locked boolean;v_active boolean;v_deadline timestamptz;
begin
  select e.is_published,e.is_archived,r.is_locked,sa.is_active
  into v_published,v_archived,v_locked,v_active
  from public.v2_events e
  join public.v2_event_registrations r on r.event_id=e.id and r.athlete_id=p_athlete_id
  join public.v2_season_athletes sa on sa.season_id=e.season_id and sa.athlete_id=r.athlete_id
  where e.id=p_event_id;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if v_published is not true or v_archived is true then raise exception 'EVENT_NOT_AVAILABLE'; end if;
  if v_active is not true then raise exception 'ATHLETE_NOT_ACTIVE'; end if;
  if v_locked is true then raise exception 'REGISTRATION_LOCKED'; end if;
  v_deadline:=public.v2_effective_registration_deadline(p_event_id,p_athlete_id);
  if v_deadline is not null and now()>v_deadline then raise exception 'REGISTRATION_DEADLINE_EXPIRED'; end if;
end;
$$;
revoke all on function public.v2_assert_registration_editable(uuid,uuid) from public,anon,authenticated;

create or replace function public.v2_list_public_events()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'slug',e.slug,'title',e.title,'description',e.description,
    'registration_deadline',e.registration_deadline,'season_name',s.name
  ) order by case when e.registration_deadline is null then 1 else 0 end,e.registration_deadline,e.created_at desc),'[]'::jsonb)
  from public.v2_events e join public.v2_seasons s on s.id=e.season_id
  where e.is_published=true and e.is_archived=false;
$$;
revoke all on function public.v2_list_public_events() from public;
grant execute on function public.v2_list_public_events() to anon,authenticated;

create or replace function public.v2_get_public_event(p_slug text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_event public.v2_events%rowtype;v_result jsonb;v_season_name text;
begin
  select e.* into v_event
  from public.v2_events e
  where e.slug=p_slug and e.is_published=true and e.is_archived=false limit 1;
  if not found then return null; end if;
  select s.name into v_season_name from public.v2_seasons s where s.id=v_event.season_id;
  select jsonb_build_object(
    'event',jsonb_build_object('slug',v_event.slug,'title',v_event.title,'description',v_event.description,
      'registration_deadline',v_event.registration_deadline,'season_name',v_season_name),
    'config',coalesce((select jsonb_object_agg(c.key,c.value) from public.v2_event_config c
      where c.event_id=v_event.id and c.is_public=true),'{}'::jsonb),
    'timers',coalesce((select jsonb_agg(jsonb_build_object('label',t.label,'deadline',t.deadline,'categories',t.categories) order by t.deadline)
      from public.v2_event_timers t where t.event_id=v_event.id),'[]'::jsonb),
    'registrations',coalesce((select jsonb_agg(jsonb_build_object(
      'athlete_id',a.id,'full_name',a.full_name,
      'category',coalesce(r.category_override,r.category_snapshot,a.category),
      'gender',a.gender,'status',r.status,
      'has_companion',r.companion_name is not null and btrim(r.companion_name)<>'',
      'race_day',r.race_day,'effective_deadline',public.v2_effective_registration_deadline(v_event.id,a.id)
    ) order by coalesce(r.category_override,r.category_snapshot,a.category),a.full_name)
      from public.v2_event_registrations r
      join public.v2_athletes a on a.id=r.athlete_id
      join public.v2_season_athletes sa on sa.season_id=v_event.season_id and sa.athlete_id=a.id
      where r.event_id=v_event.id and sa.is_active=true and r.is_locked=false),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.v2_get_public_event(text) from public;
grant execute on function public.v2_get_public_event(text) to anon,authenticated;

create or replace function public.v2_get_public_history_attendees()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_title',e.title,
    'season_name',s.name,
    'athletes',coalesce((select jsonb_agg(jsonb_build_object(
      'full_name',a.full_name,'category',coalesce(r.category_override,r.category_snapshot,a.category)
    ) order by coalesce(r.category_override,r.category_snapshot,a.category),a.full_name)
    from public.v2_event_registrations r join public.v2_athletes a on a.id=r.athlete_id
    where r.event_id=e.id and r.status='yes'),'[]'::jsonb)
  ) order by e.created_at desc),'[]'::jsonb)
  from public.v2_events e join public.v2_seasons s on s.id=e.season_id
  where e.is_published=true or e.is_archived=true;
$$;
revoke all on function public.v2_get_public_history_attendees() from public;
grant execute on function public.v2_get_public_history_attendees() to anon,authenticated;

create or replace function public.v2_get_public_history()
returns jsonb language sql stable security definer set search_path=public as $$
with eligible_events as (
  select e.*,s.name season_name from public.v2_events e join public.v2_seasons s on s.id=e.season_id
  where e.is_published=true or e.is_archived=true
), event_rows as (
  select e.id,e.title,e.slug,e.season_name,e.is_archived,e.is_published,e.registration_deadline,e.created_at,
    coalesce((select c.value from public.v2_event_config c where c.event_id=e.id and c.key='event_days' limit 1),'[]'::jsonb) event_days,
    count(r.id)::integer total_count,count(*) filter(where r.status='yes')::integer yes_count,
    count(*) filter(where r.status='no')::integer no_count,count(*) filter(where r.status='pending')::integer pending_count
  from eligible_events e left join public.v2_event_registrations r on r.event_id=e.id
  group by e.id,e.title,e.slug,e.season_name,e.is_archived,e.is_published,e.registration_deadline,e.created_at
), athlete_rows as (
  select a.id athlete_id,a.full_name,a.gender,
    coalesce((select sa.category from public.v2_season_athletes sa join public.v2_seasons s on s.id=sa.season_id
      where sa.athlete_id=a.id and s.is_current=true limit 1),a.category) category,
    count(r.id)::integer total_count,count(*) filter(where r.status='yes')::integer yes_count,
    count(*) filter(where r.status='no')::integer no_count,count(*) filter(where r.status='pending')::integer pending_count
  from public.v2_event_registrations r join eligible_events e on e.id=r.event_id
  join public.v2_athletes a on a.id=r.athlete_id group by a.id,a.full_name,a.category,a.gender
), totals as (
  select (select count(*) from eligible_events)::integer events_total,(select count(*) from athlete_rows)::integer athletes_total,
    coalesce((select sum(total_count) from event_rows),0)::integer registrations_total,
    coalesce((select sum(yes_count) from event_rows),0)::integer yes_total,
    coalesce((select sum(no_count) from event_rows),0)::integer no_total,
    coalesce((select sum(pending_count) from event_rows),0)::integer pending_total
)
select jsonb_build_object(
  'summary',(select jsonb_build_object('events_total',events_total,'athletes_total',athletes_total,
    'registrations_total',registrations_total,'yes_total',yes_total,'no_total',no_total,'pending_total',pending_total,
    'participation_rate',case when registrations_total>0 then round(yes_total*100.0/registrations_total,1) else 0 end) from totals),
  'events',coalesce((select jsonb_agg(jsonb_build_object(
    'title',er.title,'season_name',er.season_name,
    'slug',case when er.is_published and not er.is_archived then er.slug else null end,
    'is_archived',er.is_archived,'event_days',er.event_days,'total_count',er.total_count,
    'yes_count',er.yes_count,'no_count',er.no_count,'pending_count',er.pending_count,
    'participation_rate',case when er.total_count>0 then round(er.yes_count*100.0/er.total_count,1) else 0 end
  ) order by er.created_at desc) from event_rows er),'[]'::jsonb),
  'athletes',coalesce((select jsonb_agg(jsonb_build_object(
    'full_name',ar.full_name,'category',ar.category,'gender',ar.gender,'total_count',ar.total_count,
    'yes_count',ar.yes_count,'no_count',ar.no_count,'pending_count',ar.pending_count,
    'participation_rate',case when ar.total_count>0 then round(ar.yes_count*100.0/ar.total_count,1) else 0 end,
    'attended_events',coalesce((select jsonb_agg(jsonb_build_object(
      'title',er.title,'season_name',er.season_name,'event_days',er.event_days,'is_archived',er.is_archived,
      'is_registration_closed',(er.is_archived or (er.registration_deadline is not null and er.registration_deadline<=now()))
    ) order by er.created_at desc) from public.v2_event_registrations r2 join event_rows er on er.id=r2.event_id
      where r2.athlete_id=ar.athlete_id and r2.status='yes'),'[]'::jsonb)
  ) order by ar.yes_count desc,ar.full_name) from athlete_rows ar),'[]'::jsonb),
  'categories','[]'::jsonb
);
$$;
revoke all on function public.v2_get_public_history() from public;
grant execute on function public.v2_get_public_history() to anon,authenticated;

create or replace function public.v2_get_public_history_results()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(row_data order by event_title,season_name,athlete_name),'[]'::jsonb)
  from (
    select e.title event_title,s.name season_name,a.full_name athlete_name,
      jsonb_agg(jsonb_build_object(
        'page_title',er.page_title,
        'result_text',case when er.page_title ilike '%CLASSIFICA FINALE%'
          and coalesce(er.result_cells->>0,'') ~ '^\d+$'
          then (er.result_cells->>0)||'°' else er.result_text end
      ) order by er.imported_at,er.page_title,er.result_text) results
    from public.v2_event_results er
    join public.v2_events e on e.id=er.event_id
    join public.v2_seasons s on s.id=e.season_id
    join public.v2_athletes a on a.id=er.athlete_id
    where (e.is_published=true or e.is_archived=true)
      and coalesce(er.page_title,'') not ilike '%FORMULA TIEZZI%'
    group by e.id,e.title,s.name,a.id,a.full_name
  ) row_data;
$$;
revoke all on function public.v2_get_public_history_results() from public;
grant execute on function public.v2_get_public_history_results() to anon,authenticated;

create or replace function public.v2_enqueue_telegram_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_enabled boolean:=false;v_event_title text;v_athlete_name text;v_category text;
begin
  if tg_op<>'UPDATE' or old.status is not distinct from new.status or new.status not in ('yes','no') then return new; end if;
  select exists(select 1 from public.v2_event_config c where c.event_id=new.event_id
    and c.key='telegram_status_enabled' and c.value='true'::jsonb) into v_enabled;
  if not v_enabled then return new; end if;
  select e.title,a.full_name,coalesce(new.category_override,new.category_snapshot,a.category)
  into v_event_title,v_athlete_name,v_category
  from public.v2_events e join public.v2_athletes a on a.id=new.athlete_id where e.id=new.event_id;
  insert into public.v2_telegram_outbox(event_id,registration_id,kind,payload)
  values(new.event_id,new.id,'status',jsonb_build_object(
    'event_title',v_event_title,'athlete_name',v_athlete_name,'category',v_category,
    'status',new.status,'companion_name',new.companion_name,'responded_at',new.responded_at));
  return new;
end;
$$;
revoke all on function public.v2_enqueue_telegram_status() from public,anon,authenticated;

commit;

-- VERIFICA: deve restituire una sola stagione corrente e nessun record senza stagione/categoria.
select
  (select count(*) from public.v2_seasons where is_current=true) as stagioni_correnti,
  (select count(*) from public.v2_events where season_id is null) as gare_senza_stagione,
  (select count(*) from public.v2_event_registrations where category_snapshot is null) as iscrizioni_senza_categoria;
