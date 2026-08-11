import * as xlsx from 'xlsx';
import fs from 'fs';

const filePath = 'C:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Recepciones\\chequeos hasta el 2026.xlsx';

if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const fileBuffer = fs.readFileSync(filePath);
const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const data = xlsx.utils.sheet_to_json(sheet, { defval: null, raw: false });

console.log('Total rows:', data.length);
console.log('First 2 rows:');
console.log(JSON.stringify(data.slice(0, 2), null, 2));

