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
    const startDate = '2026-06-01';
    console.log(`Buscando pacientes con asistencia='Presente' desde el ${startDate}...`);

    const { data: visitas, error: fetchError } = await supabase
        .from('recepciones_visitas')
        .select('dni, paciente, telefono1, hora, fecha')
        .gte('fecha', startDate)
        .eq('asistencia', 'Presente')
        .ilike('tipo_visita', '%CHQ%')
        .not('telefono1', 'is', null)
        .order('fecha', { ascending: true });

    if (fetchError) {
        console.error(fetchError);
        return;
    }

    if (!visitas || visitas.length === 0) {
        console.log(`No hay pacientes.`);
        return;
    }

    const patientsMap = new Map();
    visitas.forEach(v => {
        let phone = String(v.telefono1).replace(/\D/g, '');
        if (phone.length >= 9) {
            if (phone.startsWith('54') && !phone.startsWith('549')) {
                phone = '549' + phone.substring(2);
            } else if (!phone.startsWith('54')) {
                phone = phone.length === 10 ? '549' + phone : '549264' + phone;
            }
            if (!patientsMap.has(phone)) {
                const firstName = v.paciente ? v.paciente.split(',')[1]?.trim().split(' ')[0] || v.paciente.split(' ')[0] : 'Paciente';
                const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                patientsMap.set(phone, { phone, name: formattedName, rawPaciente: v.paciente });
            }
        }
    });

    const uniquePatients = Array.from(patientsMap.values());
    console.log(`Encontrados ${uniquePatients.length} pacientes únicos para encuestar.`);
    console.log('Muestra de los primeros 5:');
    console.table(uniquePatients.slice(0, 5));
}

run();
