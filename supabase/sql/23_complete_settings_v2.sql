-- JUVENILIA V2 — STEP 23
-- Allinea formalmente la nuova chiave pubblica show_info_box.
-- Non modifica il vecchio sistema.

update public.v2_event_config
set is_public = true
where key in (
  'subtitle','info_box','show_info_box','show_companion','event_days',
  'category_costs','payment_info','document_1','document_2'
);

select key, count(*) as records, bool_and(is_public) as public
from public.v2_event_config
where key in (
  'subtitle','info_box','show_info_box','show_companion','event_days',
  'category_costs','payment_info','document_1','document_2'
)
group by key
order by key;
