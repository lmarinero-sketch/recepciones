import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: dbAsigJulio } = await supabase
        .from('alq_asignaciones')
        .select('id, periodo, medico_id, consultorio_id, dia_semana, franja, medico:alq_medicos(nombre_display), consultorio:alq_consultorios(numero, sede:alq_sedes(codigo))')
        .eq('periodo', '2026-07');

    console.log(`Actual count in 2026-07: ${dbAsigJulio.length}`);

    // Check specific slot: SSFS-14 | lunes | siesta
    const slot = dbAsigJulio.find(a => a.consultorio?.sede?.codigo === 'SSFS' && a.consultorio?.numero === '14' && a.dia_semana === 'lunes' && a.franja === 'siesta');
    console.log('Slot SSFS-14|lunes|siesta in DB:', slot);
}

check().catch(console.error);
