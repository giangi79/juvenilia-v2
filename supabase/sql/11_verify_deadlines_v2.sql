-- STEP 11 - Verifica scadenze V2
-- Non modifica dati o struttura. Puoi eseguirlo con Run without RLS.
-- Serve solo a controllare le scadenze effettive calcolate dal server.

select
  e.title as gara,
  a.full_name as atleta,
  coalesce(r.category_override,a.category) as categoria,
  e.registration_deadline as scadenza_generale,
  public.v2_effective_registration_deadline(e.id,a.id) as scadenza_effettiva
from public.v2_event_registrations r
join public.v2_events e on e.id=r.event_id
join public.v2_athletes a on a.id=r.athlete_id
where e.is_archived=false
order by e.title, categoria, a.full_name;
