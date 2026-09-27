-- Attivare dopo aver distribuito birthday-reminder e applicato la migration 50.
-- Pianificare soltanto dopo la distribuzione della Edge Function.
-- Il cron e' in UTC: le chiamate alle 06/07 UTC coprono le 08:00 italiane
-- rispettivamente con ora legale e solare. La funzione verifica l'ora locale.
select cron.schedule(
  'juvenilia-v2-birthday-reminder',
  '0,15,30,45 6,7 * * *',
  $cron$
    select net.http_post(
      url := 'https://jnfnfszekfstuoiemkgf.supabase.co/functions/v1/birthday-reminder',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets
         where name='telegram_cron_secret' limit 1)
      ),
      body := '{}'::jsonb
    );
  $cron$
);
