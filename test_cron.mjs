import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

async function test() {
    try {
        console.log("Testing with ANON key...");
        let r2 = await fetch('https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/cron-encuestas', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.VITE_SUPABASE_ANON_KEY }});
        console.log('Anon auth:', r2.status);
        console.log(await r2.text());
    } catch(e) { console.error('Error anon auth', e); }
    
    try {
        console.log("Testing with SERVICE ROLE key...");
        let r3 = await fetch('https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/cron-encuestas', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }});
        console.log('Service auth:', r3.status);
        console.log(await r3.text());
    } catch(e) { console.error('Error service auth', e); }
}

test();
