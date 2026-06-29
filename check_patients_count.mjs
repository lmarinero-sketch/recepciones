import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase
        .from('visitas_chequeo')
        .select('telefono1_paciente')
        .gte('fecha', '2026-06-01')
        .eq('asistencia', 'Presente')
        .not('telefono1_paciente', 'is', null);
        
    if (error) console.error(error);
    
    const uniquePhones = new Set();
    data.forEach(v => {
        let phone = String(v.telefono1_paciente).replace(/\D/g, '');
        if (phone.length >= 9) uniquePhones.add(phone);
    });
    
    console.log(`Total pacientes unicos desde Junio 1: ${uniquePhones.size}`);
}

run();
