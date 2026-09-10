-- STEP 14 - Hardening sicurezza V2
-- Eseguire con "Run without RLS".
-- NON modifica il vecchio sistema e NON cambia il flusso utente della V2.

begin;

-- 1. RLS deve restare attivo su tutte le tabelle V2.
alter table public.v2_events enable row level security;
alter table public.v2_athletes enable row level security;
alter table public.v2_event_registrations enable row level security;
alter table public.v2_event_timers enable row level security;
alter table public.v2_event_config enable row level security;
alter table public.v2_admin_users enable row level security;

-- 2. Nessun accesso diretto anon alle tabelle.
revoke all on table public.v2_events from anon;
revoke all on table public.v2_athletes from anon;
revoke all on table public.v2_event_registrations from anon;
revoke all on table public.v2_event_timers from anon;
revoke all on table public.v2_event_config from anon;
revoke all on table public.v2_admin_users from anon;

-- 3. L'utente autenticato può lavorare sulle tabelle, ma le policy RLS Admin
--    già create continuano a decidere chi può effettivamente leggere/modificare.
grant select,insert,update,delete on
  public.v2_events,
  public.v2_athletes,
  public.v2_event_registrations,
  public.v2_event_timers,
  public.v2_event_config
to authenticated;

-- 4. La tabella degli amministratori non deve essere modificabile dal frontend.
revoke insert,update,delete on public.v2_admin_users from anon, authenticated;
grant select on public.v2_admin_users to authenticated;

-- 5. Funzioni pubbliche: solo quelle necessarie alla pagina pubblica.
revoke all on function public.v2_get_public_event(text) from public;
grant execute on function public.v2_get_public_event(text) to anon, authenticated;

revoke all on function public.v2_list_public_events() from public;
grant execute on function public.v2_list_public_events() to anon, authenticated;

revoke all on function public.v2_set_registration_status(text,uuid,text) from public;
grant execute on function public.v2_set_registration_status(text,uuid,text) to anon, authenticated;

revoke all on function public.v2_set_companion(text,uuid,text) from public;
grant execute on function public.v2_set_companion(text,uuid,text) to anon, authenticated;

-- 6. Funzioni amministrative: mai anonime.
revoke all on function public.v2_is_admin() from public, anon;
grant execute on function public.v2_is_admin() to authenticated;

revoke all on function public.v2_sync_active_athlete_to_events(uuid) from public, anon;
grant execute on function public.v2_sync_active_athlete_to_events(uuid) to authenticated;

-- 7. Le funzioni interne di scadenza non devono essere chiamabili dal client.
revoke all on function public.v2_effective_registration_deadline(uuid,uuid) from public, anon, authenticated;
revoke all on function public.v2_assert_registration_editable(uuid,uuid) from public, anon, authenticated;

commit;

-- CONTROLLO FINALE: deve restituire tutte le tabelle V2 con RLS = true.
select relname as tabella, relrowsecurity as rls_attivo
from pg_class
where relname in (
  'v2_events','v2_athletes','v2_event_registrations',
  'v2_event_timers','v2_event_config','v2_admin_users'
)
order by relname;
