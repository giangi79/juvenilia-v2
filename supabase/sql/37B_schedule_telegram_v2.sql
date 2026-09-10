-- JUVENILIA V2 — STEP 37B — CRON TELEGRAM
-- Eseguire SOLO dopo aver:
-- 1) distribuito la Edge Function telegram-dispatch
-- 2) impostato TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID e TELEGRAM_CRON_SECRET nei Secrets.
--
-- La chiave cron viene letta da Supabase Vault, mai salvata nel frontend.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists(select 1 from cron.job where jobname='juvenilia-v2-telegram-dispatch') then
    perform cron.unschedule('juvenilia-v2-telegram-dispatch');
  end if;
end $$;

select cron.schedule(
  'juvenilia-v2-telegram-dispatch',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://jnfnfszekfstuoiemkgf.supabase.co/functions/v1/telegram-dispatch',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='telegram_cron_secret' limit 1)
      ),
      body := '{"action":"process"}'::jsonb
    );
  $cron$
);

select jobid,jobname,schedule,active
from cron.job
where jobname='juvenilia-v2-telegram-dispatch';
