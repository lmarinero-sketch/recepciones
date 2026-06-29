import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const phone = '5492645438114';
    
    const { data: msgs } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(2);
        
    console.log(JSON.stringify(msgs, null, 2));
}

run().catch(console.error);
