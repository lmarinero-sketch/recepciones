/**
 * import_alquileres.cjs
 * 
 * Importa los datos del archivo Excel de Junio 2026 a Supabase.
 * Parsea cada hoja (SSFS, SSL1, SSL2, SSL3) extrayendo:
 *   - Médicos (nombre_display, detecta duplicados)
 *   - Asignaciones (consultorio + día + franja → médico)
 * 
 * Usa la estructura:
 *   Fila de DÍA:  LUNES | CONS. 1 | CONS. 2 | ...
 *   Fila MAÑANA:  MAÑANA | ALBACAR M | ORTIZ JUAN | ...
 *   Fila SIESTA:  SIESTA | SEGOVIA | ... 
 *   Fila TARDE:   TARDE | FERREYRA | ...
 */
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const PERIODO = '2026-07';
const EXCEL_FILE = 'JUNIO 2026 ALQUILERES.xlsx';

// Sheets to parse with their sede codes
const SHEETS_CONFIG = [
    { sheet: 'SSFS', sedeCode: 'SSFS' },
    { sheet: 'SSL1', sedeCode: 'SSL1' },
    { sheet: 'SSL2', sedeCode: 'SSL2' },
    { sheet: 'SSL3', sedeCode: 'SSL3' },
];

const DIAS_MAP = {
    'LUNES': 'lunes', 'MARTES': 'martes', 'MIERCOLES': 'miercoles',
    'MIÉRCOLES': 'miercoles', 'JUEVES': 'jueves', 'VIERNES': 'viernes',
    'SABADO': 'sabado', 'SÁBADO': 'sabado',
};

const FRANJAS_MAP = {
    'MAÑANA': 'mañana', 'MANANA': 'mañana', 'MAÑANAS': 'mañana',
    'SIESTA': 'siesta', 'TARDE': 'tarde',
};

// Names to skip (not real doctors)
const SKIP_NAMES = new Set([
    '', 'PEDIATRIA', 'SUM', 'RN', 'MONITOREO', 'ROTATIVO',
    'KINE PEDIA', 'PRE  ANESTESIA', 'PRE ANESTESIA',
]);

function normalizeDisplay(name) {
    if (!name) return null;
    let n = String(name).trim().toUpperCase();
    // Remove trailing dots, extra spaces
    n = n.replace(/\.\s*$/, '').replace(/\s+/g, ' ').trim();
    // Remove matrícula numbers at end (e.g. "ALBACAR M 3507")
    n = n.replace(/\s+\d{3,5}\s*$/, '').trim();
    // Remove leading numbers
    n = n.replace(/^\d+[-–]\s*/, '').trim();
    // Remove parenthetical specialties for matching
    // but keep for display: "GIMENEZ (TR)" → keep
    if (!n || n.length < 2) return null;
    if (SKIP_NAMES.has(n)) return null;
    // Check if it's a real name (not a label)
    if (n.match(/^(CONS|CONSULTORIO|MATRIZ|DISPONIBILIDAD|OCUPACION|TASA|TOTALES|KINESIOLOGIA|ERGOMETRIA)/i)) return null;
    return n;
}



async function main() {
    console.log('📖 Leyendo Excel:', EXCEL_FILE);
    const wb = XLSX.readFile(EXCEL_FILE);
    
    // 1. Load existing sedes and consultorios
    console.log('\n📍 Cargando sedes y consultorios existentes...');
    const { data: sedes, error: sedesErr } = await sb.from('alq_sedes').select('*');
    if (sedesErr) throw new Error('Error sedes: ' + sedesErr.message);
    const { data: consultorios, error: consErr } = await sb.from('alq_consultorios').select('*, sede:alq_sedes(codigo)');
    if (consErr) throw new Error('Error consultorios: ' + consErr.message);
    
    const sedeByCode = {};
    sedes.forEach(s => sedeByCode[s.codigo] = s);
    
    const consultorioMap = {};
    consultorios.forEach(c => {
        const key = `${c.sede?.codigo}-${c.numero}`;
        consultorioMap[key] = c;
    });
    
    console.log(`  Sedes: ${sedes.length}, Consultorios: ${consultorios.length}`);
    
    // 2. Parse each sheet to extract medicos and assignments
    const allMedicos = new Map(); // nombre_display → {nombre, apellido, ...}
    const allAssignments = []; // [{medicoDisplay, consultorioKey, dia, franja}]
    
    for (const config of SHEETS_CONFIG) {
        const sheet = wb.Sheets[config.sheet];
        if (!sheet) {
            console.log(`⚠️  Hoja "${config.sheet}" no encontrada, saltando...`);
            continue;
        }
        
        console.log(`\n📋 Procesando hoja: ${config.sheet} (${config.sedeCode})`);
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        let currentDay = null;
        let consultorioNumbers = []; // Column headers for this day
        
        for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
            const row = data[rowIdx].map(c => String(c || '').trim());
            const firstCell = row[0]?.toUpperCase().trim();
            
            // Detect day header row: "LUNES | CONS. 1 | CONS. 2 | ..."
            if (DIAS_MAP[firstCell]) {
                currentDay = DIAS_MAP[firstCell];
                consultorioNumbers = [];
                for (let col = 1; col < row.length; col++) {
                    const header = row[col].toUpperCase().trim();
                    // Extract consultorio number: "CONS. 1" → "1", "CONS.4" → "4", "ERGOMETRIA" → "Ergometría", "KINESIOLOGIA" → "Kinesiología"
                    let num = null;
                    const consMatch = header.match(/CONS\.?\s*(\d+)/);
                    if (consMatch) {
                        num = consMatch[1];
                    } else if (header.includes('ERGOMETRIA') || header.includes('ERGOMETRÍA')) {
                        num = 'Ergometría';
                    } else if (header.includes('KINESIOLOGIA') || header.includes('KINESIOLOGÍA')) {
                        num = 'Kinesiología';
                    }
                    consultorioNumbers.push(num);
                }
                continue;
            }
            
            // Detect franja row: "MAÑANA | doctor1 | doctor2 | ..."
            const franjaKey = firstCell.replace(/\s+/g, '');
            if (FRANJAS_MAP[franjaKey] && currentDay && consultorioNumbers.length > 0) {
                const franja = FRANJAS_MAP[franjaKey];
                
                for (let col = 1; col < row.length && (col - 1) < consultorioNumbers.length; col++) {
                    const cellVal = row[col];
                    const consNum = consultorioNumbers[col - 1];
                    if (!consNum) continue;
                    
                    const medicoDisplay = normalizeDisplay(cellVal);
                    if (!medicoDisplay) continue;
                    
                    // Add medico to set
                    if (!allMedicos.has(medicoDisplay)) {
                        // Try to parse name
                        const parts = medicoDisplay.split(/\s+/);
                        let apellido = parts[0] || medicoDisplay;
                        let nombre = parts.slice(1).join(' ') || '';
                        // Handle common suffixes like "(TR)", "(tr)"
                        nombre = nombre.replace(/\s*\(.*?\)\s*/g, '').trim();
                        apellido = apellido.replace(/\s*\(.*?\)\s*/g, '').trim();
                        
                        allMedicos.set(medicoDisplay, {
                            nombre_display: medicoDisplay,
                            nombre: nombre || apellido,
                            apellido: apellido,
                            especialidad: null,
                        });
                    }
                    
                    const consKey = `${config.sedeCode}-${consNum}`;
                    allAssignments.push({
                        medicoDisplay,
                        consKey,
                        dia: currentDay,
                        franja,
                        sedeCode: config.sedeCode,
                        esResidente: medicoDisplay.includes('RESIDEN') || medicoDisplay.includes('RESI '),
                        esRotativo: medicoDisplay.includes('ROTATIV'),
                    });
                }
            }
            
            // Stop when we hit MATRIZ OCUPACION or JUNIO section
            if (firstCell.includes('MATRIZ') || firstCell === 'JUNIO' || firstCell === 'JULIO') {
                console.log(`  ⏹️  Detenido en fila ${rowIdx + 1}: "${firstCell}"`);
                break;
            }
        }
    }
    
    console.log(`\n👨‍⚕️ Médicos únicos encontrados: ${allMedicos.size}`);
    console.log(`📎 Asignaciones encontradas: ${allAssignments.length}`);
    
    // 3. Insert medicos
    console.log('\n📤 Insertando médicos en Supabase...');
    const medicosArr = Array.from(allMedicos.values());
    
    // Batch insert
    const batchSize = 50;
    for (let i = 0; i < medicosArr.length; i += batchSize) {
        const batch = medicosArr.slice(i, i + batchSize);
        const { data: result, error } = await sb.from('alq_medicos').insert(batch).select();
        if (error) {
            // Try one by one for duplicates
            for (const m of batch) {
                const { error: e2 } = await sb.from('alq_medicos').insert(m).select();
                if (e2) console.log(`  ⚠️  Skipping ${m.nombre_display}: ${e2.message.substring(0, 80)}`);
            }
        } else {
            console.log(`  ✅ Batch ${Math.floor(i / batchSize) + 1}: ${result.length} médicos insertados`);
        }
    }
    
    // Build medico lookup by display name
    // Re-fetch all to get IDs
    const { data: allMedicosDB } = await sb.from('alq_medicos').select('id,nombre_display');
    const medicoIdByDisplay = {};
    (allMedicosDB || []).forEach(m => medicoIdByDisplay[m.nombre_display] = m.id);
    
    console.log(`  Total médicos en DB: ${(allMedicosDB || []).length}`);
    
    // 4. Insert assignments
    console.log('\n📤 Insertando asignaciones...');
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    
    const assignBatch = [];
    for (const a of allAssignments) {
        const medicoId = medicoIdByDisplay[a.medicoDisplay];
        const cons = consultorioMap[a.consKey];
        
        if (!medicoId) {
            skipped++;
            continue;
        }
        if (!cons) {
            console.log(`  ⚠️  Consultorio no encontrado: ${a.consKey}`);
            skipped++;
            continue;
        }
        
        assignBatch.push({
            medico_id: medicoId,
            consultorio_id: cons.id,
            dia_semana: a.dia,
            franja: a.franja,
            periodo: PERIODO,
            es_residente: a.esResidente,
            es_rotativo: a.esRotativo,
        });
    }
    
    // Insert in batches
    for (let i = 0; i < assignBatch.length; i += batchSize) {
        const batch = assignBatch.slice(i, i + batchSize);
        const { data: result, error } = await sb.from('alq_asignaciones').insert(batch).select();
        if (error) {
            // Try one by one
            for (const a of batch) {
                const { error: e2 } = await sb.from('alq_asignaciones').insert(a).select();
                if (e2) {
                    if (e2.message.includes('duplicate') || e2.code === '23505') {
                        skipped++;
                    } else {
                        errors++;
                        if (errors <= 5) console.log(`\n  ❌ Error: ${e2.message.substring(0, 100)}`);
                    }
                } else {
                    inserted++;
                }
                process.stdout.write(`\r  Insertadas: ${inserted}/${assignBatch.length} (skip: ${skipped}, err: ${errors})`);
            }
        } else {
            inserted += result.length;
            process.stdout.write(`\r  Insertadas: ${inserted}/${assignBatch.length}`);
        }
    }
    
    console.log(`\n\n✅ Importación completada:`);
    console.log(`   Médicos: ${(allMedicosDB || []).length}`);
    console.log(`   Asignaciones insertadas: ${inserted}`);
    console.log(`   Saltadas/duplicadas: ${skipped}`);
    console.log(`   Errores: ${errors}`);
}

main().catch(e => {
    console.error('💥 Error fatal:', e.message);
    process.exit(1);
});
