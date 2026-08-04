const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// 1. Cargar variables de entorno
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const isDryRun = process.argv.includes('--dry-run');

function cleanField(field) {
  if (field === null || field === undefined) return null;
  const f = field.toString().trim();
  if (f.toUpperCase() === 'NULL' || f === '') return null;
  return f;
}

function excelTimeToHHMMSS(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.toUpperCase() === 'NULL' || trimmed === '') return null;
    if (trimmed.includes(':')) return trimmed;
    const parsed = parseFloat(trimmed);
    if (!isNaN(parsed)) val = parsed;
    else return null;
  }
  if (typeof val === 'number' && !isNaN(val)) {
    const totalSeconds = Math.round(val * 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return null;
}

function cleanPhone(phone) {
  if (!phone) return null;
  let p = phone.toString().trim();
  if (p === '' || p.toUpperCase() === 'NULL') return null;

  if (p.toUpperCase().includes('E+') || p.toUpperCase().includes('E-')) {
    try {
      const num = Number(p.replace(',', '.'));
      if (!isNaN(num) && isFinite(num)) p = Math.round(num).toString();
    } catch (e) {}
  }

  const digits = p.replace(/\D/g, '');
  if (digits.length < 8) return null;

  if (digits.startsWith('264') && digits.length === 10) {
    return '549' + digits;
  }
  if (digits.startsWith('9264') && digits.length === 11) {
    return '54' + digits;
  }
  if (digits.startsWith('549')) {
    return digits;
  }
  if (digits.startsWith('54') && !digits.startsWith('549')) {
    return '549' + digits.slice(2);
  }

  return digits;
}

async function runImport() {
  console.log('====================================================');
  console.log(`🚀 IMPORTACIÓN COMERCIAL Y MARKETING: chequeos.xlsx ${isDryRun ? '( MODO SIMULACIÓN / DRY-RUN )' : '( EJECUCIÓN REAL )'}`);
  console.log('====================================================\n');

  if (!fs.existsSync('chequeos.xlsx')) {
    console.error('❌ Archivo chequeos.xlsx no encontrado en la raíz del proyecto.');
    process.exit(1);
  }

  const wb = XLSX.readFile('chequeos.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet);

  console.log(`📊 Total de filas leídas del Excel: ${rawRows.length}`);

  const visitasBatch = [];
  const contactsMap = new Map(); // phone -> { phone, name, dni, centro, obra_social, departamento, ultFecha }

  let validPhonesCount = 0;
  let invalidPhonesCount = 0;

  rawRows.forEach((r) => {
    const tipo_agenda = cleanField(r['TIPO AGENDA']);
    let fecha_raw = cleanField(r['FECHA']);
    if (fecha_raw) fecha_raw = fecha_raw.split(' ')[0];
    const hora_raw = excelTimeToHHMMSS(r['HORA']);
    const tipo_visita = cleanField(r['TIPO VISITA']);
    const nhc = cleanField(r['NHC']);
    const dni = cleanField(r['DNI']);
    const paciente = cleanField(r['PACIENTE']);
    const obra_social = cleanField(r['Obra Social']);
    const motivo = cleanField(r['MOTIVO']);
    const asistencia = cleanField(r['ASISTENCIA']);
    const medico = cleanField(r['MEDICO']);
    const departamento = cleanField(r['Departamento']);
    const rawTel = r['TELEFONO1 PACIENTE'];
    const phoneClean = cleanPhone(rawTel);
    const comentarios = cleanField(r['COMENTARIOS']);
    const especialidad = cleanField(r['ESPECIALIDAD']);
    const centro = cleanField(r['Centro']);

    visitasBatch.push({
      tipo_agenda,
      fecha: fecha_raw,
      hora: hora_raw,
      tipo_visita,
      nhc,
      dni,
      paciente,
      obra_social,
      motivo,
      asistencia,
      medico,
      departamento,
      telefono1_paciente: phoneClean || (rawTel ? String(rawTel) : null),
      comentarios,
      especialidad,
      centro
    });

    if (phoneClean && phoneClean.startsWith('549')) {
      validPhonesCount++;
      if (!contactsMap.has(phoneClean)) {
        contactsMap.set(phoneClean, {
          phone: phoneClean,
          name: paciente,
          dni: dni,
          obra_social: obra_social,
          centro: centro,
          departamento: departamento,
          ultFecha: fecha_raw
        });
      } else {
        const existing = contactsMap.get(phoneClean);
        if (fecha_raw && fecha_raw > (existing.ultFecha || '')) {
          existing.ultFecha = fecha_raw;
        }
      }
    } else {
      invalidPhonesCount++;
    }
  });

  console.log(`\n📋 Resumen de Procesamiento:`);
  console.log(`   • Registros de visitas a procesar: ${visitasBatch.length}`);
  console.log(`   • Teléfonos válidos para WhatsApp: ${validPhonesCount}`);
  console.log(`   • Teléfonos inválidos / no formateables: ${invalidPhonesCount}`);
  console.log(`   • Contactos únicos para CRM Marketing: ${contactsMap.size}`);

  if (isDryRun) {
    console.log('\n💡 Ejecución finalizada en modo simulación (--dry-run). No se hicieron cambios en la base de datos.');
    console.log('   Para ejecutar la importación real, ejecuta: node import_chequeos_marketing.cjs --run');
    return;
  }

  // --- PASO 1: Upsert en visitas_chequeo en lotes de 500 ---
  console.log('\n📥 Paso 1: Importando visitas a "visitas_chequeo"...');
  let insertedVisitas = 0;
  for (let i = 0; i < visitasBatch.length; i += 500) {
    const chunk = visitasBatch.slice(i, i + 500);
    const { error } = await supabase.from('visitas_chequeo').insert(chunk);
    if (error) {
      console.error(`   ❌ Error importando lote ${i} - ${i + chunk.length}:`, error.message);
    } else {
      insertedVisitas += chunk.length;
      console.log(`   ✅ Lote ${i + 1} a ${i + chunk.length} importado (${insertedVisitas}/${visitasBatch.length})`);
    }
  }

  // --- PASO 2: Ingesta / Actualización en crm_contacts ---
  console.log('\n👥 Paso 2: Importando contactos a la agenda CRM WhatsApp "crm_contacts"...');
  const contactsList = Array.from(contactsMap.values());
  let newContactsCount = 0;
  let updatedContactsCount = 0;

  for (let i = 0; i < contactsList.length; i += 200) {
    const chunk = contactsList.slice(i, i + 200);
    const phones = chunk.map(c => c.phone);

    const { data: existing } = await supabase
      .from('crm_contacts')
      .select('phone, notas')
      .in('phone', phones);

    const existingSet = new Set(existing ? existing.map(e => e.phone) : []);

    const toInsert = [];
    for (const c of chunk) {
      const noteText = `[Chequeo Preventivo 2025] Centro: ${c.centro || 'S/D'} | OS: ${c.obra_social || 'S/D'} | Dpto: ${c.departamento || 'S/D'} | Último CHQ: ${c.ultFecha || 'S/D'}`;
      if (!existingSet.has(c.phone)) {
        toInsert.push({
          phone: c.phone,
          nombre: c.name,
          dni: c.dni,
          notas: noteText
        });
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('crm_contacts').insert(toInsert);
      if (error) {
        console.error(`   ❌ Error insertando nuevos contactos en CRM:`, error.message);
      } else {
        newContactsCount += toInsert.length;
      }
    }
    updatedContactsCount += (chunk.length - toInsert.length);
    console.log(`   ⏳ Progreso CRM: ${Math.min(i + 200, contactsList.length)}/${contactsList.length} contactos procesados (Nuevos: ${newContactsCount}, Existentes: ${updatedContactsCount})`);
  }

  console.log('\n====================================================');
  console.log('🎉 PROCESO COMPLETADO EXITOSAMENTE');
  console.log(`   • Visitas registradas en visitas_chequeo: ${insertedVisitas}`);
  console.log(`   • Nuevos contactos agregados a crm_contacts: ${newContactsCount}`);
  console.log(`   • Contactos existentes actualizados en CRM: ${updatedContactsCount}`);
  console.log('====================================================');
}

runImport().catch(err => {
  console.error('❌ Error fatal en el proceso:', err);
});
