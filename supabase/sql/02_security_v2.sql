-- Juvenilia Racing Team V2 - Step 02
-- Sicurezza e ruolo Admin
-- Presuppone che 01_database_v2.sql sia già stato eseguito.
--
-- IMPORTANTE:
-- - NON modifica le tabelle del vecchio sistema.
-- - La V2 resta ancora chiusa agli utenti anonimi.
-- - In questo step abilitiamo soltanto gli Admin autenticati via Supabase Auth.

begin;

-- ============================================================
-- 1. FUNZIONE: l'utente autenticato è un Admin V2?
-- ============================================================
create or replace function public.v2_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.v2_admin_users au
    where au.user_id = auth.uid()
  );
$$;

-- Evitiamo che anon possa richiamarla direttamente.
revoke all on function public.v2_is_admin() from public;
revoke all on function public.v2_is_admin() from anon;
grant execute on function public.v2_is_admin() to authenticated;

-- ============================================================
-- 2. PRIVILEGI DI BASE
-- ============================================================
-- Nessun accesso diretto anon alle tabelle V2.
revoke all on table public.v2_events from anon;
revoke all on table public.v2_athletes from anon;
revoke all on table public.v2_event_registrations from anon;
revoke all on table public.v2_event_timers from anon;
revoke all on table public.v2_event_config from anon;
revoke all on table public.v2_admin_users from anon;

-- Gli utenti autenticati ricevono i privilegi SQL necessari,
-- ma RLS consentirà le operazioni solo se v2_is_admin() = true.
grant select, insert, update, delete
on table public.v2_events
to authenticated;

grant select, insert, update, delete
on table public.v2_athletes
to authenticated;

grant select, insert, update, delete
on table public.v2_event_registrations
to authenticated;

grant select, insert, update, delete
on table public.v2_event_timers
to authenticated;

grant select, insert, update, delete
on table public.v2_event_config
to authenticated;

-- Gli admin potranno leggere la tabella degli admin.
-- Non concediamo INSERT/UPDATE/DELETE dal normale frontend:
-- l'aggiunta/rimozione degli admin verrà fatta con SQL controllato.
grant select
on table public.v2_admin_users
to authenticated;

-- ============================================================
-- 3. ELIMINIAMO EVENTUALI POLICY V2 PRECEDENTI
-- Lo script può così essere rieseguito senza duplicazioni.
-- ============================================================

drop policy if exists "v2_events_admin_select" on public.v2_events;
drop policy if exists "v2_events_admin_insert" on public.v2_events;
drop policy if exists "v2_events_admin_update" on public.v2_events;
drop policy if exists "v2_events_admin_delete" on public.v2_events;

drop policy if exists "v2_athletes_admin_select" on public.v2_athletes;
drop policy if exists "v2_athletes_admin_insert" on public.v2_athletes;
drop policy if exists "v2_athletes_admin_update" on public.v2_athletes;
drop policy if exists "v2_athletes_admin_delete" on public.v2_athletes;

drop policy if exists "v2_registrations_admin_select" on public.v2_event_registrations;
drop policy if exists "v2_registrations_admin_insert" on public.v2_event_registrations;
drop policy if exists "v2_registrations_admin_update" on public.v2_event_registrations;
drop policy if exists "v2_registrations_admin_delete" on public.v2_event_registrations;

drop policy if exists "v2_timers_admin_select" on public.v2_event_timers;
drop policy if exists "v2_timers_admin_insert" on public.v2_event_timers;
drop policy if exists "v2_timers_admin_update" on public.v2_event_timers;
drop policy if exists "v2_timers_admin_delete" on public.v2_event_timers;

drop policy if exists "v2_config_admin_select" on public.v2_event_config;
drop policy if exists "v2_config_admin_insert" on public.v2_event_config;
drop policy if exists "v2_config_admin_update" on public.v2_event_config;
drop policy if exists "v2_config_admin_delete" on public.v2_event_config;

drop policy if exists "v2_admin_users_admin_select" on public.v2_admin_users;

-- ============================================================
-- 4. POLICY ADMIN: EVENTS
-- ============================================================
create policy "v2_events_admin_select"
on public.v2_events
for select
to authenticated
using (public.v2_is_admin());

create policy "v2_events_admin_insert"
on public.v2_events
for insert
to authenticated
with check (public.v2_is_admin());

create policy "v2_events_admin_update"
on public.v2_events
for update
to authenticated
using (public.v2_is_admin())
with check (public.v2_is_admin());

create policy "v2_events_admin_delete"
on public.v2_events
for delete
to authenticated
using (public.v2_is_admin());

-- ============================================================
-- 5. POLICY ADMIN: ATHLETES
-- ============================================================
create policy "v2_athletes_admin_select"
on public.v2_athletes
for select
to authenticated
using (public.v2_is_admin());

create policy "v2_athletes_admin_insert"
on public.v2_athletes
for insert
to authenticated
with check (public.v2_is_admin());

create policy "v2_athletes_admin_update"
on public.v2_athletes
for update
to authenticated
using (public.v2_is_admin())
with check (public.v2_is_admin());

create policy "v2_athletes_admin_delete"
on public.v2_athletes
for delete
to authenticated
using (public.v2_is_admin());

-- ============================================================
-- 6. POLICY ADMIN: REGISTRATIONS
-- ============================================================
create policy "v2_registrations_admin_select"
on public.v2_event_registrations
for select
to authenticated
using (public.v2_is_admin());

create policy "v2_registrations_admin_insert"
on public.v2_event_registrations
for insert
to authenticated
with check (public.v2_is_admin());

create policy "v2_registrations_admin_update"
on public.v2_event_registrations
for update
to authenticated
using (public.v2_is_admin())
with check (public.v2_is_admin());

create policy "v2_registrations_admin_delete"
on public.v2_event_registrations
for delete
to authenticated
using (public.v2_is_admin());

-- ============================================================
-- 7. POLICY ADMIN: TIMERS
-- ============================================================
create policy "v2_timers_admin_select"
on public.v2_event_timers
for select
to authenticated
using (public.v2_is_admin());

create policy "v2_timers_admin_insert"
on public.v2_event_timers
for insert
to authenticated
with check (public.v2_is_admin());

create policy "v2_timers_admin_update"
on public.v2_event_timers
for update
to authenticated
using (public.v2_is_admin())
with check (public.v2_is_admin());

create policy "v2_timers_admin_delete"
on public.v2_event_timers
for delete
to authenticated
using (public.v2_is_admin());

-- ============================================================
-- 8. POLICY ADMIN: CONFIG
-- ============================================================
create policy "v2_config_admin_select"
on public.v2_event_config
for select
to authenticated
using (public.v2_is_admin());

create policy "v2_config_admin_insert"
on public.v2_event_config
for insert
to authenticated
with check (public.v2_is_admin());

create policy "v2_config_admin_update"
on public.v2_event_config
for update
to authenticated
using (public.v2_is_admin())
with check (public.v2_is_admin());

create policy "v2_config_admin_delete"
on public.v2_event_config
for delete
to authenticated
using (public.v2_is_admin());

-- ============================================================
-- 9. POLICY ADMIN: ADMIN_USERS
-- Solo lettura dal frontend.
-- L'aggiunta/rimozione degli amministratori resta un'operazione SQL.
-- ============================================================
create policy "v2_admin_users_admin_select"
on public.v2_admin_users
for select
to authenticated
using (public.v2_is_admin());

commit;
