-- STEP 46 - Risultati pubblici nello storico atleti
-- Eseguire nel SQL Editor di Supabase con "Run without RLS".

begin;

create or replace function public.v2_get_public_history_results()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(jsonb_agg(row_data order by event_title, athlete_name), '[]'::jsonb)
  from (
    select
      e.title as event_title,
      a.full_name as athlete_name,
      jsonb_agg(
        jsonb_build_object(
          'page_title', er.page_title,
          'result_text', case
            when er.page_title ilike '%CLASSIFICA FINALE%'
              and coalesce(er.result_cells->>0, '') ~ '^\d+$'
            then (er.result_cells->>0) || '°'
            else er.result_text
          end
        )
        order by er.imported_at, er.page_title, er.result_text
      ) as results
    from public.v2_event_results er
    join public.v2_events e on e.id=er.event_id
    join public.v2_athletes a on a.id=er.athlete_id
    where (e.is_published=true or e.is_archived=true)
      and coalesce(er.page_title, '') not ilike '%FORMULA TIEZZI%'
    group by e.id, e.title, a.id, a.full_name
  ) row_data;
$$;

revoke all on function public.v2_get_public_history_results() from public;
grant execute on function public.v2_get_public_history_results() to anon, authenticated;

commit;
