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
    // DB state
    const { data: dbMedicos } = await supabase.from('alq_medicos').select('*');
    const { data: dbConsultorios } = await supabase.from('alq_consultorios').select('*, sede:alq_sedes(codigo)');
    
    const dbMedicoMap = new Map();
    dbMedicos.forEach(m => dbMedicoMap.set(m.nombre_display.trim().toUpperCase(), m));
    
    const dbMedicoIdMap = new Map();
    dbMedicos.forEach(m => dbMedicoIdMap.set(m.id, m));

    const dbConsMap = new Map();
    dbConsultorios.forEach(c => {
        const key = `${c.sede?.codigo}-${c.numero}`;
        dbConsMap.set(key, c);
    });

    const { data: dbAsigJulio } = await supabase
        .from('alq_asignaciones')
        .select('*')
        .eq('periodo', '2026-07');

    // Key in DB: `${sedeCode}-${consNum}|${dia}|${franja}` -> asignacion
    const dbAsigMap = new Map();
    dbAsigJulio.forEach(a => {
        const cons = dbConsultorios.find(c => c.id === a.consultorio_id);
        const med = dbMedicoIdMap.get(a.medico_id);
        const key = `${cons?.sede?.codigo}-${cons?.numero}|${a.dia_semana}|${a.franja}`;
        dbAsigMap.set(key, { ...a, medicoName: med?.nombre_display, consKey: `${cons?.sede?.codigo}-${cons?.numero}` });
    });

    // Parse Excel
    const wb = XLSX.readFile(EXCEL_FILE);
    const excelAsigMap = new Map();

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
                    const slotKey = `${consKey}|${currentDay}|${franja}`;
                    excelAsigMap.set(slotKey, {
                        medicoDisplay,
                        consKey,
                        dia: currentDay,
                        franja,
                        sedeCode: config.sedeCode,
                        consNum,
                        esResidente: medicoDisplay.includes('RESIDEN') || medicoDisplay.includes('RESI '),
                        esRotativo: medicoDisplay.includes('ROTATIV'),
                        rawCell: cellVal
                    });
                }
            }

            if (firstCell.includes('MATRIZ') || firstCell === 'JUNIO' || firstCell === 'JULIO') break;
        }
    }

    console.log(`DB 2026-07 Total slots occupied: ${dbAsigMap.size}`);
    console.log(`Excel Total slots occupied: ${excelAsigMap.size}`);

    // Differences:
    let identical = 0;
    let modified = 0;
    let inDbNotExcel = 0;
    let inExcelNotDb = 0;

    for (const [slotKey, excelAsig] of excelAsigMap.entries()) {
        const dbAsig = dbAsigMap.get(slotKey);
        if (!dbAsig) {
            inExcelNotDb++;
            console.log(`[IN EXCEL, NOT DB] Slot: ${slotKey} -> Doctor Excel: ${excelAsig.medicoDisplay}`);
        } else {
            const dbDoctorName = dbAsig.medicoName?.trim().toUpperCase();
            const excelDoctorName = excelAsig.medicoDisplay.trim().toUpperCase();
            if (dbDoctorName === excelDoctorName) {
                identical++;
            } else {
                modified++;
                console.log(`[DOCTOR DIFFERENCE] Slot: ${slotKey} -> DB: ${dbAsig.medicoName} | Excel: ${excelAsig.medicoDisplay}`);
            }
        }
    }

    for (const [slotKey, dbAsig] of dbAsigMap.entries()) {
        if (!excelAsigMap.has(slotKey)) {
            inDbNotExcel++;
            console.log(`[IN DB, NOT EXCEL] Slot: ${slotKey} -> Doctor DB: ${dbAsig.medicoName}`);
        }
    }

    console.log(`\n--- SUMMARY OF COMPARISON ---`);
    console.log(`Identical slots: ${identical}`);
    console.log(`Modified slots (doctor changed): ${modified}`);
    console.log(`Slots in Excel but not in DB: ${inExcelNotDb}`);
    console.log(`Slots in DB but not in Excel: ${inDbNotExcel}`);
}

main().catch(console.error);
