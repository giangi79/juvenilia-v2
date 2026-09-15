-- Categorie ammesse per singola gara
-- Eseguire una sola volta nel SQL Editor di Supabase.
-- Mantiene il comportamento precedente per le gare senza configurazione allowed_categories.

begin;

create or replace function public.v2_sync_active_athlete_to_events(p_athlete_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_is_active boolean;
  v_category text;
  v_count integer := 0;
begin
  select public.v2_is_admin() into v_is_admin;
  if not coalesce(v_is_admin,false) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select is_active, upper(trim(category))
  into v_is_active, v_category
  from public.v2_athletes
  where id=p_athlete_id;

  if not found then raise exception 'ATHLETE_NOT_FOUND'; end if;
  if not v_is_active then return 0; end if;

  insert into public.v2_event_registrations(event_id,athlete_id,status)
  select e.id,p_athlete_id,'pending'
  from public.v2_events e
  where e.is_published=true
    and e.is_archived=false
    and (
      not exists (
        select 1
        from public.v2_event_config c
        where c.event_id=e.id and c.key='allowed_categories'
      )
      or exists (
        select 1
        from public.v2_event_config c
        cross join lateral jsonb_array_elements_text(c.value) x(category)
        where c.event_id=e.id
          and c.key='allowed_categories'
          and upper(trim(x.category))=v_category
      )
    )
    and not exists (
      select 1 from public.v2_event_registrations r
      where r.event_id=e.id and r.athlete_id=p_athlete_id
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.v2_sync_active_athlete_to_events(uuid) from public, anon;
grant execute on function public.v2_sync_active_athlete_to_events(uuid) to authenticated;

commit;
