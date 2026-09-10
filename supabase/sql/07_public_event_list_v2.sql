-- Juvenilia Racing Team V2 - STEP 07A
-- Elenco pubblico delle gare pubblicate.
-- Eseguire con "Run without RLS".
-- NON tocca il vecchio sistema.

begin;

create or replace function public.v2_list_public_events()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'slug', e.slug,
        'title', e.title,
        'description', e.description,
        'registration_deadline', e.registration_deadline
      )
      order by
        case when e.registration_deadline is null then 1 else 0 end,
        e.registration_deadline asc,
        e.created_at desc
    ),
    '[]'::jsonb
  )
  from public.v2_events e
  where e.is_published = true
    and e.is_archived = false;
$$;

revoke all on function public.v2_list_public_events() from public;
grant execute on function public.v2_list_public_events() to anon, authenticated;

commit;

select public.v2_list_public_events() as public_events;
