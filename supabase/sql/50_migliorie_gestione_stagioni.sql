-- STEP 50 - Modifica/eliminazione stagioni e recupero delle rose vuote.
-- Eseguire dopo 49_gestione_stagioni_sportive.sql.

begin;

-- Se la migrazione 49 ha creato la stagione attuale ma la copia iniziale non è
-- arrivata a termine, la ripopola una sola volta dall'archivio atleti esistente.
insert into public.v2_season_athletes(season_id,athlete_id,category,is_active)
select s.id,a.id,a.category,a.is_active
from public.v2_seasons s
cross join public.v2_athletes a
where s.is_current=true
  and not exists (
    select 1 from public.v2_season_athletes existing
    where existing.season_id=s.id
  )
on conflict (season_id,athlete_id) do nothing;

-- La rosa resta sempre modificabile: il vecchio blocco non è più utilizzato.
update public.v2_seasons set is_locked=false where is_locked=true;
drop trigger if exists trg_v2_guard_locked_season_roster on public.v2_season_athletes;
drop function if exists public.v2_guard_locked_season_roster();
drop function if exists public.v2_set_season_locked(uuid,boolean);

create or replace function public.v2_update_season(
  p_season_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text:=btrim(coalesce(p_name,''));
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if v_name !~ '^\d{4}/\d{4}$' then raise exception 'INVALID_SEASON_NAME'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'INVALID_SEASON_DATES';
  end if;

  update public.v2_seasons
  set name=v_name,start_date=p_start_date,end_date=p_end_date
  where id=p_season_id;
  if not found then raise exception 'SEASON_NOT_FOUND'; end if;
exception
  when unique_violation then raise exception 'SEASON_NAME_ALREADY_EXISTS';
end;
$$;
revoke all on function public.v2_update_season(uuid,text,date,date) from public,anon;
grant execute on function public.v2_update_season(uuid,text,date,date) to authenticated;

create or replace function public.v2_copy_season_roster(
  p_source_season_id uuid,
  p_target_season_id uuid
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer:=0;
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_source_season_id is null or p_target_season_id is null or p_source_season_id=p_target_season_id then
    raise exception 'INVALID_SEASON_COPY';
  end if;
  if not exists(select 1 from public.v2_seasons where id=p_source_season_id) or
     not exists(select 1 from public.v2_seasons where id=p_target_season_id) then
    raise exception 'SEASON_NOT_FOUND';
  end if;

  insert into public.v2_season_athletes(season_id,athlete_id,category,is_active)
  select p_target_season_id,sa.athlete_id,sa.category,true
  from public.v2_season_athletes sa
  where sa.season_id=p_source_season_id and sa.is_active=true
  on conflict (season_id,athlete_id) do nothing;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.v2_copy_season_roster(uuid,uuid) from public,anon;
grant execute on function public.v2_copy_season_roster(uuid,uuid) to authenticated;

create or replace function public.v2_delete_season(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.v2_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.v2_seasons where id=p_season_id) then
    raise exception 'SEASON_NOT_FOUND';
  end if;
  if exists(select 1 from public.v2_seasons where id=p_season_id and is_current=true) then
    raise exception 'CURRENT_SEASON_CANNOT_BE_DELETED';
  end if;
  if exists(select 1 from public.v2_events where season_id=p_season_id) then
    raise exception 'SEASON_HAS_EVENTS';
  end if;

  -- La FK della rosa usa ON DELETE CASCADE; le anagrafiche globali restano intatte.
  delete from public.v2_seasons where id=p_season_id;
end;
$$;
revoke all on function public.v2_delete_season(uuid) from public,anon;
grant execute on function public.v2_delete_season(uuid) to authenticated;

commit;

-- VERIFICA: mostra stagione, numero totale e numero di atleti attivi.
select s.name,s.is_current,count(sa.id) as atleti,
       count(sa.id) filter(where sa.is_active) as atleti_attivi
from public.v2_seasons s
left join public.v2_season_athletes sa on sa.season_id=s.id
group by s.id,s.name,s.is_current,s.start_date
order by s.start_date;
