@echo off
set SUPABASE_ACCESS_TOKEN=sbp_094c69cc15552bc6bf46d39ee4d2b80c88bdc584
npx -y supabase@latest functions deploy whatsapp-webhook-recepciones --project-ref hakysnqiryimxbwdslwe --no-verify-jwt --use-api
pause

