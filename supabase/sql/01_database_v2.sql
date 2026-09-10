-- Juvenilia Racing Team V2 - Step 01
-- Nuovo database parallelo. NON modifica né elimina le tabelle del sistema attuale.
-- Tabelle create:
--   v2_events
--   v2_athletes
--   v2_event_registrations
--   v2_event_timers
--   v2_event_config
--   v2_admin_users

begin;

-- ------------------------------------------------------------
-- Funzione comune per aggiornare automaticamente updated_at
-- ------------------------------------------------------------
create or replace function public.v2_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 1. EVENTI / GARE
-- ------------------------------------------------------------
create table if not exists public.v2_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  registration_deadline timestamptz,
  is_published boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint v2_events_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

drop trigger if exists trg_v2_events_updated_at on public.v2_events;
create trigger trg_v2_events_updated_at
before update on public.v2_events
for each row execute function public.v2_set_updated_at();

-- ------------------------------------------------------------
-- 2. ATLETI
-- L'atleta esiste una sola volta e può essere iscritto a più gare.
-- ------------------------------------------------------------
create table if not exists public.v2_athletes (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  category text not null,
  gender text,
  birth_date date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint v2_athletes_gender_check
    check (gender is null or gender in ('M', 'F'))
);

drop trigger if exists trg_v2_athletes_updated_at on public.v2_athletes;
create trigger trg_v2_athletes_updated_at
before update on public.v2_athletes
for each row execute function public.v2_set_updated_at();

-- ------------------------------------------------------------
-- 3. ISCRIZIONI ALLA GARA
-- Una riga per coppia evento + atleta.
-- ------------------------------------------------------------
create table if not exists public.v2_event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.v2_events(id) on delete cascade,
  athlete_id uuid not null references public.v2_athletes(id) on delete cascade,

  status text not null default 'pending',
  companion_name text,
  race_day text,
  category_override text,
  is_locked boolean not null default false,

  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint v2_event_registrations_unique
    unique (event_id, athlete_id),

  constraint v2_event_registrations_status_check
    check (status in ('pending', 'yes', 'no'))
);

drop trigger if exists trg_v2_event_registrations_updated_at
on public.v2_event_registrations;

create trigger trg_v2_event_registrations_updated_at
before update on public.v2_event_registrations
for each row execute function public.v2_set_updated_at();

-- ------------------------------------------------------------
-- 4. TIMER / SCADENZE PER CATEGORIA
-- categories è un vero array PostgreSQL, non una stringa JSON.
-- ------------------------------------------------------------
create table if not exists public.v2_event_timers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.v2_events(id) on delete cascade,
  label text not null,
  deadline timestamptz not null,
  categories text[] not null default '{}',
  notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_v2_event_timers_updated_at
on public.v2_event_timers;

create trigger trg_v2_event_timers_updated_at
before update on public.v2_event_timers
for each row execute function public.v2_set_updated_at();

-- ------------------------------------------------------------
-- 5. CONFIGURAZIONE PER EVENTO
-- JSONB ci permette di salvare testo, booleani, numeri, documenti ecc.
-- ------------------------------------------------------------
create table if not exists public.v2_event_config (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.v2_events(id) on delete cascade,
  key text not null,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint v2_event_config_unique
    unique (event_id, key)
);

drop trigger if exists trg_v2_event_config_updated_at
on public.v2_event_config;

create trigger trg_v2_event_config_updated_at
before update on public.v2_event_config
for each row execute function public.v2_set_updated_at();

-- ------------------------------------------------------------
-- 6. AMMINISTRATORI
-- Collega un utente Supabase Auth ai privilegi Admin V2.
-- ------------------------------------------------------------
create table if not exists public.v2_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INDICI
-- ------------------------------------------------------------
create index if not exists idx_v2_athletes_category
  on public.v2_athletes(category);

create index if not exists idx_v2_athletes_active
  on public.v2_athletes(is_active);

create index if not exists idx_v2_registrations_event
  on public.v2_event_registrations(event_id);

create index if not exists idx_v2_registrations_athlete
  on public.v2_event_registrations(athlete_id);

create index if not exists idx_v2_registrations_status
  on public.v2_event_registrations(event_id, status);

create index if not exists idx_v2_registrations_locked
  on public.v2_event_registrations(event_id, is_locked);

create index if not exists idx_v2_timers_event
  on public.v2_event_timers(event_id);

create index if not exists idx_v2_config_event
  on public.v2_event_config(event_id);

-- ------------------------------------------------------------
-- RLS
-- La abilitiamo subito, ma NON creiamo ancora policy pubbliche.
-- Quindi la V2 nasce chiusa e sicura.
-- ------------------------------------------------------------
alter table public.v2_events enable row level security;
alter table public.v2_athletes enable row level security;
alter table public.v2_event_registrations enable row level security;
alter table public.v2_event_timers enable row level security;
alter table public.v2_event_config enable row level security;
alter table public.v2_admin_users enable row level security;

commit;
