import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- ALQ PERIODOS EN ASIGNACIONES ---');
    const { data: asignaciones, error: asigErr } = await supabase
        .from('alq_asignaciones')
        .select('id, periodo, medico_id, consultorio_id, dia_semana, franja, es_residente, es_rotativo, estado');
    
    if (asigErr) {
        console.error('Error fetch asignaciones:', asigErr);
        return;
    }

    const periodCounts = {};
    asignaciones.forEach(a => {
        periodCounts[a.periodo] = (periodCounts[a.periodo] || 0) + 1;
    });
    console.log('Conteo por periodo:', periodCounts);

    console.log('\n--- ALQ MEDICOS ---');
    const { data: medicos, error: medErr } = await supabase
        .from('alq_medicos')
        .select('*');
    
    if (medErr) {
        console.error('Error fetch medicos:', medErr);
        return;
    }
    console.log(`Total medicos: ${medicos.length}`);
    if (medicos.length > 0) {
        console.log('Campos medico (ejemplo):', Object.keys(medicos[0]));
        console.log('Muestra medicos (primeros 5):', medicos.slice(0, 5).map(m => ({ id: m.id, nombre_display: m.nombre_display, nombre: m.nombre, apellido: m.apellido, especialidad: m.especialidad })));
    }

    console.log('\n--- ALQ SEDES ---');
    const { data: sedes } = await supabase.from('alq_sedes').select('*');
    console.log('Sedes:', sedes);

    console.log('\n--- ALQ CONSULTORIOS ---');
    const { data: consultorios } = await supabase.from('alq_consultorios').select('id, numero, sede:alq_sedes(codigo)');
    console.log(`Total consultorios: ${consultorios.length}`);
}

run().catch(console.error);
