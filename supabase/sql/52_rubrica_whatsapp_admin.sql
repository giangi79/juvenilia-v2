-- Rubrica privata degli amministratori per i destinatari dei riepiloghi WhatsApp.
-- Non viene trasferito automaticamente il vecchio numero fisso: i contatti si aggiungono dal pannello admin.

create table if not exists public.v2_whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now()
);

alter table public.v2_whatsapp_contacts enable row level security;
revoke all on table public.v2_whatsapp_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.v2_whatsapp_contacts to authenticated;

create policy v2_whatsapp_contacts_admin_select on public.v2_whatsapp_contacts
  for select to authenticated using ((select public.v2_is_admin()));
create policy v2_whatsapp_contacts_admin_insert on public.v2_whatsapp_contacts
  for insert to authenticated with check ((select public.v2_is_admin()));
create policy v2_whatsapp_contacts_admin_update on public.v2_whatsapp_contacts
  for update to authenticated using ((select public.v2_is_admin()))
  with check ((select public.v2_is_admin()));
create policy v2_whatsapp_contacts_admin_delete on public.v2_whatsapp_contacts
  for delete to authenticated using ((select public.v2_is_admin()));
