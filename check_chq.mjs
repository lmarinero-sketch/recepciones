import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data: chqVisits, error } = await supabase
        .from('recepciones_visitas')
        .select('*')
        .ilike('tipo_visita', '%CHQ%')
        .limit(1);

    if (error) console.error(error);
    else {
        console.log(chqVisits);
    }
}
run();
