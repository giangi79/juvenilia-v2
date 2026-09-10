-- Juvenilia Racing Team V2 - Step 03A
-- Collegamento del primo utente Supabase Auth come Admin V2.
--
-- PRIMA:
-- 1) In Supabase vai in Authentication > Users
-- 2) Crea un utente con email e password
-- 3) Sostituisci qui sotto ADMIN_EMAIL@example.com con la sua email
-- 4) Esegui lo script

do $$
declare
  v_user_id uuid;
begin
  select id
  into v_user_id
  from auth.users
  where lower(email) = lower('ADMIN_EMAIL@example.com')
  limit 1;

  if v_user_id is null then
    raise exception 'Utente Auth non trovato. Controlla l''email.';
  end if;

  insert into public.v2_admin_users (user_id, display_name)
  values (v_user_id, 'Admin Juvenilia')
  on conflict (user_id) do update
  set display_name = excluded.display_name;
end $$;

-- Verifica finale
select
  au.user_id,
  au.display_name,
  u.email,
  au.created_at
from public.v2_admin_users au
join auth.users u on u.id = au.user_id;
