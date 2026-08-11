import fs from 'fs';
import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const filePath = 'C:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Recepciones\\chequeos hasta el 2026.xlsx';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY);

function cleanString(str) {
    if (str === null || str === undefined) return null;
    const trimmed = String(str).trim();
    if (trimmed.toUpperCase() === 'NULL') return null;
    if (trimmed === '') return null;
    return trimmed;
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    // Extract YYYY-MM-DD from 'YYYY-MM-DD HH:MM:SS.MMM'
    const parts = String(dateStr).split(' ');
    return parts[0];
}

async function run() {
    console.log('Reading Excel file...');
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // raw: false to get formatted dates/strings if possible, though date strings look like '2024-02-08 ...'
    const data = xlsx.utils.sheet_to_json(sheet, { defval: null, raw: false });
    
    console.log(`Found ${data.length} rows to process.`);

    const records = data.map(row => {
        return {
            tipo_agenda: cleanString(row['TIPO AGENDA']),
            fecha: formatDate(cleanString(row['FECHA'])),
            hora: cleanString(row['HORA']),
            tipo_visita: cleanString(row['TIPO VISITA']),
            nhc: cleanString(row['NHC']),
            dni: cleanString(row['DNI']),
            paciente: cleanString(row['PACIENTE']),
            obra_social: cleanString(row['Obra Social']),
            motivo: cleanString(row['MOTIVO']),
            asistencia: cleanString(row['ASISTENCIA']),
            medico: cleanString(row['MEDICO']),
            direccion: cleanString(row['DIRECCION PACIENTE']),
            departamento: cleanString(row['Departamento']),
            telefono1: cleanString(row['TELEFONO1 PACIENTE']),
            telefono2: cleanString(row['TELEFONO2 PACIENTE']),
            comentarios: cleanString(row['COMENTARIOS']),
            especialidad: cleanString(row['ESPECIALIDAD']),
            centro: cleanString(row['Centro']),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
    }).filter(r => r.fecha); // Skip if no valid date

    console.log(`Prepared ${records.length} valid records for insertion.`);

    // Delete existing records from 2024 to early 2026 just to be safe? 
    // The user said there are 0 records in 2024. Earliest is April 2026.
    // The excel is "hasta marzo 2026". So there should be no overlap, but let's just insert directly.
    
    const BATCH_SIZE = 1000;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        console.log(`Inserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(records.length / BATCH_SIZE)}...`);
        
        const { error } = await supabase.from('recepciones_visitas').insert(batch);
        
        if (error) {
            console.error('Error inserting batch:', error);
            // Don't stop completely, but log it
        }
    }
    
    console.log('Import completed.');
}

run();
