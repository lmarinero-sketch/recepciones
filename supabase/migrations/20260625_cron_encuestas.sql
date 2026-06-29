-- Habilitar la extensión pg_net si no está habilitada
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Habilitar la extensión pg_cron si no está habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Programar el Job de Envío de Encuestas
-- Este cron corre todos los días a las 16:00 (hora del servidor/UTC-3)
-- Asegúrate de que tu base de datos esté en la zona horaria correcta,
-- de lo contrario, ajusta la hora de '0 16 * * *' según corresponda (ej. UTC: '0 19 * * *')

SELECT cron.schedule(
    'job-encuestas-preventivos',
    '0 19 * * *', -- Todos los días a las 19:00 UTC (16:00 Argentina UTC-3)
    $$
    SELECT net.http_post(
        url:='https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/cron-encuestas',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.claim.role', true) || '"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
    $$
);
