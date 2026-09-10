-- STEP 15D - Correzione definitiva caricamento categorie/scadenze Admin
-- Eseguire in Supabase SQL Editor con "Run without RLS".
--
-- Dopo la correzione frontend la RPC viene chiamata SOLO quando esiste
-- una sessione Admin valida, quindi il ruolo anon non deve poterla eseguire.

revoke execute on function public.v2_admin_list_active_categories() from anon, public;
grant execute on function public.v2_admin_list_active_categories() to authenticated;

-- Verifica permessi
select
  has_function_privilege('anon',
    'public.v2_admin_list_active_categories()', 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',
    'public.v2_admin_list_active_categories()', 'EXECUTE') as authenticated_execute;
