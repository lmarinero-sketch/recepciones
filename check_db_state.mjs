import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function run() {
    console.log('--- Buscando en recepciones_visitas ---');
    const { data: latest, error: err1 } = await supabase
        .from('recepciones_visitas')
        .select('*')
        .limit(5);

    if (err1) console.error('Error recepciones_visitas:', err1);
    else {
        console.log('--- recepciones_visitas ---');
        console.table(latest);
    }
    
    // Y vamos a revisar si insertó en la tabla de turnos o algo así
    const { data: latest2, error: err2 } = await supabase
        .from('visitas_chequeo')
        .select('id, fecha, paciente')
        .limit(5);
        
    if (err2) console.error('Error visitas_chequeo:', err2);
    else {
        console.log('--- visitas_chequeo ---');
        console.table(latest2);
    }
}
run();
