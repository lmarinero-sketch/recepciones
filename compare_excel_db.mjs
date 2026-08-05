import XLSX from 'xlsx';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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
    // 1. Fetch DB state
    const { data: dbMedicos } = await supabase.from('alq_medicos').select('*');
    const { data: dbSedes } = await supabase.from('alq_sedes').select('*');
    const { data: dbConsultorios } = await supabase.from('alq_consultorios').select('*, sede:alq_sedes(codigo)');
    const { data: dbAsigJulio } = await supabase.from('alq_asignaciones').select('*, medico:alq_medicos(nombre_display), consultorio:alq_consultorios(numero, sede:alq_sedes(codigo))').eq('periodo', '2026-07');
    const { data: dbAsigJunio } = await supabase.from('alq_asignaciones').select('*, medico:alq_medicos(nombre_display), consultorio:alq_consultorios(numero, sede:alq_sedes(codigo))').eq('periodo', '2026-06');

    console.log(`DB Medicos count: ${dbMedicos.length}`);
    console.log(`DB Asignaciones 2026-07 count: ${dbAsigJulio.length}`);
    console.log(`DB Asignaciones 2026-06 count: ${dbAsigJunio.length}`);

    // Map DB Medicos by normalized display name
    const dbMedicoMap = new Map();
    dbMedicos.forEach(m => {
        dbMedicoMap.set(m.nombre_display.trim().toUpperCase(), m);
    });

    // 2. Parse Excel JUNIO 2026 ALQUILERES.xlsx
    const wb = XLSX.readFile(EXCEL_FILE);
    const excelAssignments = [];
    const excelMedicosSet = new Set();

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

                    excelMedicosSet.add(medicoDisplay);
                    excelAssignments.push({
                        medicoDisplay,
                        sedeCode: config.sedeCode,
                        consNum,
                        dia: currentDay,
                        franja,
                        rawCell: cellVal
                    });
                }
            }

            if (firstCell.includes('MATRIZ') || firstCell === 'JUNIO' || firstCell === 'JULIO') break;
        }
    }

    console.log(`\nExcel Unique Medicos: ${excelMedicosSet.size}`);
    console.log(`Excel Total Assignments: ${excelAssignments.length}`);

    // Check how many excel medicos exist in DB vs missing
    let matchedMedicos = 0;
    let missingMedicos = 0;
    const missingList = [];

    for (const mName of excelMedicosSet) {
        if (dbMedicoMap.has(mName)) {
            matchedMedicos++;
        } else {
            missingMedicos++;
            missingList.push(mName);
        }
    }

    console.log(`Matched Medicos in DB: ${matchedMedicos}`);
    console.log(`Missing Medicos in DB: ${missingMedicos}`);
    if (missingList.length > 0) {
        console.log('Missing Medicos list:', missingList);
    }
}

main().catch(console.error);
