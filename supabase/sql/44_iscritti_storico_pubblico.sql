-- STEP 44 - Elenco iscritti nello storico pubblico
-- Eseguire nel SQL Editor di Supabase con "Run without RLS".
-- Restituisce solo nome e categoria degli atleti con partecipazione confermata.

begin;

create or replace function public.v2_get_public_history_attendees()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_title',e.title,
    'athletes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'full_name',a.full_name,
        'category',coalesce(r.category_override,a.category,'SENZA CATEGORIA')
      ) order by coalesce(r.category_override,a.category,'SENZA CATEGORIA'),a.full_name)
      from public.v2_event_registrations r
      join public.v2_athletes a on a.id=r.athlete_id
      where r.event_id=e.id and r.status='yes'
    ),'[]'::jsonb)
  ) order by e.created_at desc),'[]'::jsonb)
  from public.v2_events e
  where e.is_published=true or e.is_archived=true;
$$;

revoke all on function public.v2_get_public_history_attendees() from public;
grant execute on function public.v2_get_public_history_attendees() to anon, authenticated;

commit;

-- Verifica facoltativa: deve mostrare il numero corretto per ogni gara.
select
  row ->> 'event_title' as gara,
  jsonb_array_length(row -> 'athletes') as iscritti
from jsonb_array_elements(public.v2_get_public_history_attendees()) row;
