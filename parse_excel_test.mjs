import XLSX from 'xlsx';
import fs from 'fs';

function inspectExcel(filename) {
    console.log(`\n========================================`);
    console.log(`FILE: ${filename}`);
    const wb = XLSX.readFile(filename);
    console.log('Sheet names:', wb.SheetNames);
    
    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        console.log(`\n--- Sheet: ${sheetName} (Rows: ${data.length}) ---`);
        console.log('First 5 rows:');
        for (let i = 0; i < Math.min(5, data.length); i++) {
            console.log(`Row ${i + 1}:`, data[i].slice(0, 10));
        }
    }
}

inspectExcel('JUNIO 2026 ALQUILERES.xlsx');
if (fs.existsSync('JULIO 2026.xlsx')) {
    inspectExcel('JULIO 2026.xlsx');
}
