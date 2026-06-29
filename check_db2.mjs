import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function run() {
    console.log('--- Buscando últimos registros en la DB ---');
    
    // Buscar los últimos 5 registros por ID (los más recientes insertados)
    const { data: latestById, error: err1 } = await supabase
        .from('visitas_chequeo')
        .select('id, fecha, paciente, tipo_visita')
        .order('id', { ascending: false })
        .limit(5);

    if (err1) console.error(err1);
    else {
        console.log('Últimos 5 registros (ordenados por ID desc):');
        console.table(latestById);
    }
}
run();
