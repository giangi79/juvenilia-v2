-- STEP 45 - Collegamento e importazione risultati gara
-- Eseguire nel SQL Editor di Supabase con "Run without RLS".

begin;

alter table public.v2_events
  add column if not exists results_url text;

create table if not exists public.v2_event_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.v2_events(id) on delete cascade,
  athlete_id uuid not null references public.v2_athletes(id) on delete cascade,
  source_url text not null,
  source_page text,
  page_title text,
  result_text text not null,
  result_cells jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now()
);

create index if not exists v2_event_results_event_idx
  on public.v2_event_results(event_id);
create index if not exists v2_event_results_athlete_idx
  on public.v2_event_results(athlete_id);

alter table public.v2_event_results enable row level security;

drop policy if exists v2_event_results_admin_select on public.v2_event_results;
create policy v2_event_results_admin_select
on public.v2_event_results for select to authenticated
using (public.v2_is_admin());

drop policy if exists v2_event_results_admin_insert on public.v2_event_results;
create policy v2_event_results_admin_insert
on public.v2_event_results for insert to authenticated
with check (public.v2_is_admin());

drop policy if exists v2_event_results_admin_update on public.v2_event_results;
create policy v2_event_results_admin_update
on public.v2_event_results for update to authenticated
using (public.v2_is_admin()) with check (public.v2_is_admin());

drop policy if exists v2_event_results_admin_delete on public.v2_event_results;
create policy v2_event_results_admin_delete
on public.v2_event_results for delete to authenticated
using (public.v2_is_admin());

create or replace function public.v2_save_event_results(
  p_event_id uuid,
  p_source_url text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer:=0;
begin
  if not public.v2_is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_source_url is null or p_source_url !~* '^https://attivita\.rollergames\.it/' then
    raise exception 'RESULTS_URL_NOT_ALLOWED';
  end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb))<>'array' then
    raise exception 'INVALID_RESULTS';
  end if;

  update public.v2_events set results_url=p_source_url where id=p_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  delete from public.v2_event_results where event_id=p_event_id;

  insert into public.v2_event_results(
    event_id,athlete_id,source_url,source_page,page_title,result_text,result_cells
  )
  select
    p_event_id,
    (x->>'athlete_id')::uuid,
    p_source_url,
    nullif(x->>'source_page',''),
    nullif(x->>'page_title',''),
    left(coalesce(x->>'result_text',''),4000),
    case when jsonb_typeof(x->'result_cells')='array' then x->'result_cells' else '[]'::jsonb end
  from jsonb_array_elements(p_rows) x
  where coalesce(x->>'result_text','')<>''
    and exists (
      select 1 from public.v2_event_registrations r
      where r.event_id=p_event_id
        and r.athlete_id=(x->>'athlete_id')::uuid
        and r.status='yes'
    );

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.v2_save_event_results(uuid,text,jsonb) from public;
grant execute on function public.v2_save_event_results(uuid,text,jsonb) to authenticated;

commit;
