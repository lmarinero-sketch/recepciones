/**
 * update_alquileres_julio.cjs
 * 
 * Actualiza las asignaciones del período 2026-07 en Supabase tomando
 * JUNIO 2026 ALQUILERES.xlsx como base de verdad y conservando los médicos existentes.
 */
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const PERIODO = '2026-07';
const EXCEL_FILE = 'JUNIO 2026 ALQUILERES.xlsx';

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

const SKIP_NAMES = new Set([
    '', 'PEDIATRIA', 'SUM', 'RN', 'MONITOREO', 'ROTATIVO',
    'KINE PEDIA', 'PRE  ANESTESIA', 'PRE ANESTESIA',
]);

function normalizeDisplay(name) {
    if (!name) return null;
    let n = String(name).trim().toUpperCase();
    n = n.replace(/\.\s*$/, '').replace(/\s+/g, ' ').trim();
    n = n.replace(/\s+\d{3,5}\s*$/, '').trim();
    n = n.replace(/^\d+[-–]\s*/, '').trim();
    if (!n || n.length < 2) return null;
    if (SKIP_NAMES.has(n)) return null;
    if (n.match(/^(CONS|CONSULTORIO|MATRIZ|DISPONIBILIDAD|OCUPACION|TASA|TOTALES|KINESIOLOGIA|ERGOMETRIA)/i)) return null;
    return n;
}

async function main() {
    console.log(`🚀 Iniciando actualización del período ${PERIODO} desde Excel: ${EXCEL_FILE}`);

    // 1. Cargar datos existentes de DB
    const { data: dbMedicos, error: medErr } = await sb.from('alq_medicos').select('*');
    if (medErr) throw new Error('Error al cargar médicos: ' + medErr.message);

    const { data: dbConsultorios, error: consErr } = await sb.from('alq_consultorios').select('*, sede:alq_sedes(codigo)');
    if (consErr) throw new Error('Error al cargar consultorios: ' + consErr.message);

    const medicoByDisplay = new Map();
    dbMedicos.forEach(m => medicoByDisplay.set(m.nombre_display.trim().toUpperCase(), m));

    const consultorioMap = new Map();
    dbConsultorios.forEach(c => {
        const key = `${c.sede?.codigo}-${c.numero}`;
        consultorioMap.set(key, c);
    });

    console.log(`   Médicos cargados en DB: ${dbMedicos.length}`);
    console.log(`   Consultorios cargados: ${dbConsultorios.length}`);

    // 2. Parsear Excel
    const wb = XLSX.readFile(EXCEL_FILE);
    const excelAssignments = [];
    const validSlotKeys = new Set();

    for (const config of SHEETS_CONFIG) {
        const sheet = wb.Sheets[config.sheet];
        if (!sheet) continue;
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        let currentDay = null;
        let consultorioNumbers = [];

        for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
            const row = data[rowIdx].map(c => String(c || '').trim());
            const firstCell = row[0]?.toUpperCase().trim();

            if (DIAS_MAP[firstCell]) {
                currentDay = DIAS_MAP[firstCell];
                consultorioNumbers = [];
                for (let col = 1; col < row.length; col++) {
                    const header = row[col].toUpperCase().trim();
                    let num = null;
                    const consMatch = header.match(/CONS\.?\s*(\d+)/);
                    if (consMatch) num = consMatch[1];
                    else if (header.includes('ERGOMETRIA') || header.includes('ERGOMETRÍA')) num = 'Ergometría';
                    else if (header.includes('KINESIOLOGIA') || header.includes('KINESIOLOGÍA')) num = 'Kinesiología';
                    consultorioNumbers.push(num);
                }
                continue;
            }

            const franjaKey = firstCell.replace(/\s+/g, '');
            if (FRANJAS_MAP[franjaKey] && currentDay && consultorioNumbers.length > 0) {
                const franja = FRANJAS_MAP[franjaKey];
                for (let col = 1; col < row.length && (col - 1) < consultorioNumbers.length; col++) {
                    const cellVal = row[col];
                    const consNum = consultorioNumbers[col - 1];
                    if (!consNum) continue;

                    const medicoDisplay = normalizeDisplay(cellVal);
                    if (!medicoDisplay) continue;

                    const consKey = `${config.sedeCode}-${consNum}`;
                    const consultorio = consultorioMap.get(consKey);
                    if (!consultorio) {
                        console.log(`⚠️ Consultorio no encontrado: ${consKey}`);
                        continue;
                    }

                    const medico = medicoByDisplay.get(medicoDisplay);
                    if (!medico) {
                        console.log(`⚠️ Médico no encontrado en DB: "${medicoDisplay}"`);
                        continue;
                    }

                    const slotKey = `${consultorio.id}|${currentDay}|${franja}`;
                    validSlotKeys.add(slotKey);

                    excelAssignments.push({
                        consultorio_id: consultorio.id,
                        medico_id: medico.id,
                        dia_semana: currentDay,
                        franja,
                        periodo: PERIODO,
                        es_residente: medicoDisplay.includes('RESIDEN') || medicoDisplay.includes('RESI '),
                        es_rotativo: medicoDisplay.includes('ROTATIV'),
                        estado: 'activo'
                    });
                }
            }

            if (firstCell.includes('MATRIZ') || firstCell === 'JUNIO' || firstCell === 'JULIO') break;
        }
    }

    console.log(`   Asignaciones a procesar desde Excel: ${excelAssignments.length}`);

    // 3. Obtener asignaciones actuales de 2026-07 en DB
    const { data: currentDbAsig, error: currentErr } = await sb
        .from('alq_asignaciones')
        .select('*')
        .eq('periodo', PERIODO);
    if (currentErr) throw new Error('Error al obtener asignaciones actuales: ' + currentErr.message);

    console.log(`   Asignaciones actuales en DB para ${PERIODO}: ${currentDbAsig.length}`);

    // 4. Upsert de las asignaciones de Excel
    console.log('\n📤 Aplicando upsert de asignaciones del Excel...');
    const { error: upsertErr } = await sb
        .from('alq_asignaciones')
        .upsert(excelAssignments, { onConflict: 'consultorio_id,dia_semana,franja,periodo' });

    if (upsertErr) {
        throw new Error('Error en upsert: ' + upsertErr.message);
    }
    console.log('   ✅ Upsert completado con éxito.');

    // 5. Eliminar o dar de baja slots en DB que no existen en el Excel para 2026-07
    const toRemove = currentDbAsig.filter(a => {
        const slotKey = `${a.consultorio_id}|${a.dia_semana}|${a.franja}`;
        return !validSlotKeys.has(slotKey);
    });

    if (toRemove.length > 0) {
        console.log(`\n🗑️ Eliminando ${toRemove.length} asignaciones sobrantes en DB que no están en el Excel...`);
        const idsToRemove = toRemove.map(a => a.id);
        const { error: delErr } = await sb
            .from('alq_asignaciones')
            .delete()
            .in('id', idsToRemove);

        if (delErr) {
            throw new Error('Error eliminando asignaciones sobrantes: ' + delErr.message);
        }
        console.log('   ✅ Asignaciones sobrantes eliminadas.');
    } else {
        console.log('   Sintetizado: No había asignaciones sobrantes por eliminar.');
    }

    console.log(`\n🎉 Sincronización finalizada para el período ${PERIODO}.`);
}

main().catch(e => {
    console.error('💥 Error fatal:', e.message);
    process.exit(1);
});
