-- STEP 10 - Rifinitura configurazione gara V2
-- Eseguire con "Run without RLS".
-- Non modifica nessuna tabella del vecchio sistema.

begin;

-- Mantiene pubbliche solo le configurazioni che servono realmente alla pagina gara.
update public.v2_event_config
set is_public = true
where key in (
  'subtitle','info_box','show_companion','event_days',
  'category_costs','payment_info','document_1','document_2'
);

-- Le altre configurazioni restano private per impostazione prudenziale.
update public.v2_event_config
set is_public = false
where key not in (
  'subtitle','info_box','show_companion','event_days',
  'category_costs','payment_info','document_1','document_2'
);

commit;

select key, count(*) as records, bool_and(is_public) as public
from public.v2_event_config
group by key
order by key;
