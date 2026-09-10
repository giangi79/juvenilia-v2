-- Juvenilia Racing Team V2 - Step 03B
-- API pubblica sicura per la nuova applicazione.
-- Presuppone:
--   01_database_v2.sql
--   02_security_v2.sql
--   03A_first_admin_v2.sql
--
-- NON modifica il vecchio sistema.
--
-- Obiettivo:
-- - nessun accesso anon diretto alle tabelle V2
-- - lettura pubblica tramite RPC
-- - PARTECIPA / NON PARTECIPA tramite RPC
-- - accompagnatore tramite RPC
-- - controlli di blocco e scadenza eseguiti DAL DATABASE

begin;

-- ============================================================
-- 1. CONFIG: distinguiamo impostazioni pubbliche e private
-- ============================================================
alter table public.v2_event_config
add column if not exists is_public boolean not null default false;

create index if not exists idx_v2_config_public
  on public.v2_event_config(event_id, is_public);

-- ============================================================
-- 2. FUNZIONE INTERNA:
-- calcola la scadenza effettiva per un'iscrizione
--
-- Regola:
-- - considera la scadenza generale dell'evento
-- - considera i timer che includono la categoria dell'atleta
-- - se esistono più scadenze applicabili, usa la PIÙ VICINA
-- ============================================================
create or replace function public.v2_effective_registration_deadline(
  p_event_id uuid,
  p_athlete_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with athlete_data as (
    select
      coalesce(r.category_override, a.category) as category_name
    from public.v2_event_registrations r
    join public.v2_athletes a on a.id = r.athlete_id
    where r.event_id = p_event_id
      and r.athlete_id = p_athlete_id
    limit 1
  ),
  deadlines as (
    select e.registration_deadline as deadline
    from public.v2_events e
    where e.id = p_event_id
      and e.registration_deadline is not null

    union all

    select t.deadline
    from public.v2_event_timers t
    cross join athlete_data ad
    where t.event_id = p_event_id
      and (
        cardinality(t.categories) = 0
        or ad.category_name = any(t.categories)
      )
  )
  select min(deadline)
  from deadlines;
$$;

revoke all on function public.v2_effective_registration_deadline(uuid, uuid) from public;
revoke all on function public.v2_effective_registration_deadline(uuid, uuid) from anon;
revoke all on function public.v2_effective_registration_deadline(uuid, uuid) from authenticated;

-- ============================================================
-- 3. FUNZIONE INTERNA:
-- verifica che l'iscrizione pubblica sia modificabile
-- ============================================================
create or replace function public.v2_assert_registration_editable(
  p_event_id uuid,
  p_athlete_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_published boolean;
  v_event_archived boolean;
  v_locked boolean;
  v_active boolean;
  v_deadline timestamptz;
begin
  select e.is_published, e.is_archived
  into v_event_published, v_event_archived
  from public.v2_events e
  where e.id = p_event_id;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if v_event_published is not true or v_event_archived is true then
    raise exception 'EVENT_NOT_AVAILABLE';
  end if;

  select r.is_locked, a.is_active
  into v_locked, v_active
  from public.v2_event_registrations r
  join public.v2_athletes a on a.id = r.athlete_id
  where r.event_id = p_event_id
    and r.athlete_id = p_athlete_id;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if v_active is not true then
    raise exception 'ATHLETE_NOT_ACTIVE';
  end if;

  if v_locked is true then
    raise exception 'REGISTRATION_LOCKED';
  end if;

  v_deadline := public.v2_effective_registration_deadline(
    p_event_id,
    p_athlete_id
  );

  if v_deadline is not null and now() > v_deadline then
    raise exception 'REGISTRATION_DEADLINE_EXPIRED';
  end if;
end;
$$;

revoke all on function public.v2_assert_registration_editable(uuid, uuid) from public;
revoke all on function public.v2_assert_registration_editable(uuid, uuid) from anon;
revoke all on function public.v2_assert_registration_editable(uuid, uuid) from authenticated;

-- ============================================================
-- 4. LETTURA PUBBLICA DELLA GARA
--
-- Restituisce UN SOLO JSON con:
-- - dati evento
-- - configurazione marcata is_public=true
-- - timer
-- - atleti/iscrizioni visibili
--
-- Le righe bloccate non vengono mostrate al pubblico,
-- coerentemente con il comportamento del vecchio sistema.
-- ============================================================
create or replace function public.v2_get_public_event(
  p_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.v2_events%rowtype;
  v_result jsonb;
begin
  select *
  into v_event
  from public.v2_events
  where slug = p_slug
    and is_published = true
    and is_archived = false
  limit 1;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'event',
    jsonb_build_object(
      'id', v_event.id,
      'slug', v_event.slug,
      'title', v_event.title,
      'description', v_event.description,
      'registration_deadline', v_event.registration_deadline
    ),

    'config',
    coalesce(
      (
        select jsonb_object_agg(c.key, c.value)
        from public.v2_event_config c
        where c.event_id = v_event.id
          and c.is_public = true
      ),
      '{}'::jsonb
    ),

    'timers',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'label', t.label,
            'deadline', t.deadline,
            'categories', to_jsonb(t.categories)
          )
          order by t.deadline
        )
        from public.v2_event_timers t
        where t.event_id = v_event.id
      ),
      '[]'::jsonb
    ),

    'registrations',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'registration_id', r.id,
            'athlete_id', a.id,
            'full_name', a.full_name,
            'category', coalesce(r.category_override, a.category),
            'gender', a.gender,
            'birth_date', a.birth_date,
            'status', r.status,
            'companion_name', r.companion_name,
            'race_day', r.race_day,
            'effective_deadline',
              public.v2_effective_registration_deadline(
                v_event.id,
                a.id
              )
          )
          order by
            coalesce(r.category_override, a.category),
            a.full_name
        )
        from public.v2_event_registrations r
        join public.v2_athletes a
          on a.id = r.athlete_id
        where r.event_id = v_event.id
          and r.is_locked = false
          and a.is_active = true
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.v2_get_public_event(text) from public;
grant execute on function public.v2_get_public_event(text) to anon;
grant execute on function public.v2_get_public_event(text) to authenticated;

-- ============================================================
-- 5. PARTECIPA / NON PARTECIPA
--
-- p_status ammessi:
--   yes = PARTECIPA
--   no  = NON PARTECIPA
--
-- Per tornare a "nessuna scelta" useremo in seguito
-- una funzione Admin o un reset esplicito.
-- ============================================================
create or replace function public.v2_set_registration_status(
  p_event_slug text,
  p_athlete_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_registration_id uuid;
begin
  if p_status not in ('yes', 'no') then
    raise exception 'INVALID_STATUS';
  end if;

  select id
  into v_event_id
  from public.v2_events
  where slug = p_event_slug
  limit 1;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  perform public.v2_assert_registration_editable(
    v_event_id,
    p_athlete_id
  );

  update public.v2_event_registrations
  set
    status = p_status,
    responded_at = now(),
    -- se NON PARTECIPA, eliminiamo l'accompagnatore
    companion_name = case
      when p_status = 'no' then null
      else companion_name
    end
  where event_id = v_event_id
    and athlete_id = p_athlete_id
  returning id into v_registration_id;

  return jsonb_build_object(
    'ok', true,
    'registration_id', v_registration_id,
    'status', p_status
  );
end;
$$;

revoke all on function public.v2_set_registration_status(text, uuid, text) from public;
grant execute on function public.v2_set_registration_status(text, uuid, text) to anon;
grant execute on function public.v2_set_registration_status(text, uuid, text) to authenticated;

-- ============================================================
-- 6. ACCOMPAGNATORE
--
-- Regole:
-- - iscrizione modificabile
-- - atleta deve avere status = yes
-- - max 120 caratteri
-- - stringa vuota => NULL
-- ============================================================
create or replace function public.v2_set_companion(
  p_event_slug text,
  p_athlete_id uuid,
  p_companion_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_status text;
  v_clean_name text;
  v_registration_id uuid;
begin
  select id
  into v_event_id
  from public.v2_events
  where slug = p_event_slug
  limit 1;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  perform public.v2_assert_registration_editable(
    v_event_id,
    p_athlete_id
  );

  select status
  into v_status
  from public.v2_event_registrations
  where event_id = v_event_id
    and athlete_id = p_athlete_id;

  if v_status <> 'yes' then
    raise exception 'ATHLETE_NOT_PARTICIPATING';
  end if;

  v_clean_name := nullif(btrim(coalesce(p_companion_name, '')), '');

  if v_clean_name is not null and char_length(v_clean_name) > 120 then
    raise exception 'COMPANION_NAME_TOO_LONG';
  end if;

  update public.v2_event_registrations
  set companion_name = v_clean_name
  where event_id = v_event_id
    and athlete_id = p_athlete_id
  returning id into v_registration_id;

  return jsonb_build_object(
    'ok', true,
    'registration_id', v_registration_id,
    'companion_name', v_clean_name
  );
end;
$$;

revoke all on function public.v2_set_companion(text, uuid, text) from public;
grant execute on function public.v2_set_companion(text, uuid, text) to anon;
grant execute on function public.v2_set_companion(text, uuid, text) to authenticated;

-- ============================================================
-- 7. PERMESSI TABELLE
--
-- Confermiamo che anon NON possa comunque leggere/modificare
-- direttamente le tabelle.
-- ============================================================
revoke all on table public.v2_events from anon;
revoke all on table public.v2_athletes from anon;
revoke all on table public.v2_event_registrations from anon;
revoke all on table public.v2_event_timers from anon;
revoke all on table public.v2_event_config from anon;
revoke all on table public.v2_admin_users from anon;

commit;
