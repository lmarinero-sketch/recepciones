-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Desprogramar job anterior si existía con cabeceras inválidas
SELECT cron.unschedule('job-encuestas-preventivos');

-- Programar el Job de Envío Diario de Encuestas
-- Este cron corre todos los días a las 19:00 UTC (16:00 Argentina UTC-3)
-- Utiliza el Service Role Key del proyecto hakysnqiryimxbwdslwe para autenticación sin contexto HTTP.
SELECT cron.schedule(
    'job-encuestas-preventivos',
    '0 19 * * *', -- Todos los días a las 19:00 UTC (16:00 hs San Juan)
    $$
    SELECT net.http_post(
        url:='https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/cron-encuestas',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM"}'::jsonb,
        body:='{"daysBack": 2}'::jsonb
    ) as request_id;
    $$
);
