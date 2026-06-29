import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function run() {
    console.log('--- Verificando Sync de Visitas ---');
    const { count, error: countErr } = await supabase
        .from('visitas_chequeo')
        .select('*', { count: 'exact', head: true })
        .gte('fecha', '2026-05-15');
        
    if (countErr) console.error('Error al contar:', countErr);
    else console.log(`Total de visitas desde 2026-05-15: ${count}`);

    const { data, error } = await supabase
        .from('visitas_chequeo')
        .select('fecha, paciente, asistencia, tipo_visita')
        .gte('fecha', '2026-06-01')
        .order('fecha', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error al traer últimos registros:', error);
    } else {
        console.log('Últimas 5 visitas de JUNIO 2026 en adelante:');
        console.table(data);
    }
}
run();
