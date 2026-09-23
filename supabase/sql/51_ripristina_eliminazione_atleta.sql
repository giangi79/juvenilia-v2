-- Ripristina l'eliminazione definitiva di un atleta dopo l'introduzione delle rose stagionali.
-- Le iscrizioni e i risultati collegati sono eliminati dalle relative FK ON DELETE CASCADE.
-- La funzione invoker applica le policy RLS admin su entrambe le tabelle.

create or replace function public.v2_delete_athlete(p_athlete_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.v2_is_admin()) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if not exists(select 1 from public.v2_athletes where id = p_athlete_id) then
    raise exception 'ATHLETE_NOT_FOUND';
  end if;

  delete from public.v2_season_athletes where athlete_id = p_athlete_id;
  delete from public.v2_athletes where id = p_athlete_id;
end;
$$;

revoke all on function public.v2_delete_athlete(uuid) from public, anon;
grant execute on function public.v2_delete_athlete(uuid) to authenticated;
