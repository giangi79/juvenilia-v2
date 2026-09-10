-- STEP 15B - Fix sicuro caricamento categorie nel pannello Scadenze
-- Eseguire con "Run without RLS".
-- Non concede accesso anonimo diretto a v2_athletes.

create or replace function public.v2_admin_list_active_categories()
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_categories text[];
begin
  if not public.v2_is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct trim(category) order by trim(category)), '{}'::text[])
  into v_categories
  from public.v2_athletes
  where is_active = true
    and category is not null
    and trim(category) <> '';

  return v_categories;
end;
$$;

revoke all on function public.v2_admin_list_active_categories() from public, anon;
grant execute on function public.v2_admin_list_active_categories() to authenticated;
