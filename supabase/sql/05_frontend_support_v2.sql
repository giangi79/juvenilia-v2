-- Juvenilia V2 - Step 05
-- Piccoli completamenti per il frontend definitivo.
-- NON tocca il vecchio sistema.

begin;

-- Consente all'Admin autenticato di chiamare v2_is_admin dal frontend.
grant execute on function public.v2_is_admin() to authenticated;

-- Indice utile per slug evento.
create index if not exists idx_v2_events_slug on public.v2_events(slug);

commit;
