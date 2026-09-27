-- Destinazione Telegram gestita dal database. Finche' non viene impostata,
-- le Edge Function continuano a usare TELEGRAM_CHAT_ID gia' configurato.
begin;

create table if not exists public.v2_telegram_delivery_target (
  singleton boolean primary key default true check (singleton = true),
  chat_id text not null check (length(trim(chat_id)) > 0),
  updated_at timestamptz not null default now()
);
alter table public.v2_telegram_delivery_target enable row level security;
revoke all on public.v2_telegram_delivery_target from public, anon, authenticated;

create or replace function public.v2_get_telegram_delivery_chat_id()
returns text language sql stable security definer set search_path = '' as $$
  select chat_id from public.v2_telegram_delivery_target where singleton = true;
$$;
revoke all on function public.v2_get_telegram_delivery_chat_id() from public, anon, authenticated;
grant execute on function public.v2_get_telegram_delivery_chat_id() to service_role;

commit;
