-- STEP 48: una locandina facoltativa per ogni gara pubblicata.
begin;

alter table public.v2_events add column if not exists poster_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('juvenilia-locandine', 'juvenilia-locandine', true, 8388608,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "juvenilia_posters_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'juvenilia-locandine' and (select public.v2_is_admin()));
create policy "juvenilia_posters_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'juvenilia-locandine' and (select public.v2_is_admin()));
create policy "juvenilia_posters_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'juvenilia-locandine' and (select public.v2_is_admin()));

create or replace function public.v2_get_public_poster_path(p_slug text)
returns text language sql stable security definer set search_path = public
as $$
  select e.poster_path from public.v2_events e
  where e.slug = p_slug and e.is_published = true and e.is_archived = false
  limit 1;
$$;
revoke all on function public.v2_get_public_poster_path(text) from public, anon, authenticated;
grant execute on function public.v2_get_public_poster_path(text) to anon, authenticated;

commit;
