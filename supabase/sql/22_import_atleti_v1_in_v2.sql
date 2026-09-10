-- ============================================================
-- JUVENILIA V2 — STEP 22
-- Importazione atleti attuali da presenze_gara1 -> v2_athletes
-- + iscrizione automatica alle gare V2 pubblicate e non archiviate
--
-- NON modifica né cancella alcun dato della vecchia gara1.
-- Gli atleti importati vengono creati come ATTIVI.
-- Lo stato nelle gare V2 parte da 'pending' (Da definire).
-- ============================================================

begin;

-- 1) Importa gli atleti che non esistono già in V2.
--    Il confronto evita duplicati sulla coppia NOME + CATEGORIA.
insert into public.v2_athletes (
    full_name,
    category,
    gender,
    is_active,
    notes
)
select
    upper(trim(p.nome)) as full_name,
    upper(trim(p.categoria)) as category,
    case
        when coalesce(p.note, '') ilike '%F%' then 'F'
        when coalesce(p.note, '') ilike '%M%' then 'M'
        else null
    end as gender,
    true as is_active,
    null as notes
from public.presenze_gara1 p
where nullif(trim(coalesce(p.nome, '')), '') is not null
  and nullif(trim(coalesce(p.categoria, '')), '') is not null
  and not exists (
      select 1
      from public.v2_athletes a
      where upper(trim(a.full_name)) = upper(trim(p.nome))
        and upper(trim(a.category)) = upper(trim(p.categoria))
  );

-- 2) Aggiunge TUTTI gli atleti attivi V2 alle gare attualmente
--    pubblicate e non archiviate, senza duplicare iscrizioni esistenti.
insert into public.v2_event_registrations (
    event_id,
    athlete_id,
    status
)
select
    e.id,
    a.id,
    'pending'
from public.v2_events e
cross join public.v2_athletes a
where e.is_published = true
  and e.is_archived = false
  and a.is_active = true
  and not exists (
      select 1
      from public.v2_event_registrations r
      where r.event_id = e.id
        and r.athlete_id = a.id
  );

commit;

-- ============================================================
-- CONTROLLO FINALE
-- ============================================================

-- Quanti atleti ci sono nella vecchia tabella?
select count(*) as totale_vecchia_gara1
from public.presenze_gara1;

-- Quanti atleti ci sono ora nell'archivio V2?
select count(*) as totale_atleti_v2
from public.v2_athletes;

-- Elenco completo V2 ordinato per categoria e nome
select
    full_name,
    category,
    gender,
    is_active
from public.v2_athletes
order by category, full_name;

-- Numero di atleti iscritti per ciascuna gara V2
select
    e.title as gara,
    count(r.id) as atleti_presenti
from public.v2_events e
left join public.v2_event_registrations r
    on r.event_id = e.id
group by e.id, e.title
order by e.created_at desc;
