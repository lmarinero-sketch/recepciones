const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// Parsear .env manualmente
const envContent = fs.readFileSync(".env", "utf-8");
const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if(match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Faltan credenciales de Supabase en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function cleanCSVField(field) {
  if (!field) return null;
  const f = field.toString().trim();
  if (f.toUpperCase() === "NULL" || f === "") return null;
  return f;
}

// Parsear teléfono: primero intenta como dígitos limpios, luego notación científica
function cleanPhone(phone) {
  if (!phone) return null;
  const p = phone.trim();
  if (p === "" || p.toUpperCase() === "NULL") return null;

  // Si ya es puramente numérico (ej: 5492646260369), devolver directo
  if (/^\d+$/.test(p)) return p;

  // Notación científica con coma (ej: 5,49264E+12) → precisión limitada pero mejor que nada
  if (p.toUpperCase().includes("E+") || p.toUpperCase().includes("E-")) {
    try {
      const num = Number(p.replace(",", "."));
      if (!isNaN(num) && isFinite(num)) return Math.round(num).toString();
    } catch(e) {}
  }

  // Quitar todo lo que no sea dígito y devolver si queda algo
  const digits = p.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

async function startImport() {
  console.log("===================================");
  console.log("🚀 Re-importación de Visitas (con teléfonos corregidos)...");
  console.log("===================================");

  // Paso 0: Vaciar tabla existente
  console.log("🗑️  Vaciando tabla visitas_chequeo...");
  const { error: delErr } = await supabase.from("visitas_chequeo").delete().neq("id", 0);
  if (delErr) {
    console.error("❌ Error vaciando tabla:", delErr.message);
    console.log("   Intentando con .gte('id', 0)...");
    await supabase.from("visitas_chequeo").delete().gte("id", 0);
  }
  console.log("✅ Tabla vaciada.");

  try {
    const csvContent = fs.readFileSync("visitas.csv", "latin1"); // Probable encoding Windows
    const lines = csvContent.split(/\r?\n/);
    if(lines.length < 2) {
         console.warn("⚠️ CSV vacío o con pocas líneas.");
         return;
    }

    // Identificar delimitador (vídeo anterior vimos que era punto y coma)
    const delimiter = ";";
    
    // Omitir el encabezado. Línea 0
    let rows = [];
    let count = 0;

    console.log(`📁 CSV leído: ${lines.length} líneas estimadas.`);

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if(!line.trim()) continue;

        const chunks = line.split(delimiter);
        if(chunks.length < 18) continue;

        const tipo_agenda = cleanCSVField(chunks[0]);
        let fecha_raw = cleanCSVField(chunks[1]);
        if(fecha_raw) fecha_raw = fecha_raw.split(" ")[0]; // "2025-01-02 00:00:00.000" -> "2025-01-02"
        const hora_raw = cleanCSVField(chunks[2]);
        const tipo_visita = cleanCSVField(chunks[3]);
        const nhc = cleanCSVField(chunks[4]);
        const dni = cleanCSVField(chunks[5]);
        const paciente = cleanCSVField(chunks[6]);
        const obra_social = cleanCSVField(chunks[7]);
        const motivo = cleanCSVField(chunks[8]);
        const asistencia = cleanCSVField(chunks[9]);
        const medico = cleanCSVField(chunks[10]);
        const direccion_paciente = cleanCSVField(chunks[11]);
        const departamento = cleanCSVField(chunks[12]);
        const telefono1_paciente = cleanPhone(chunks[13]);
        const telefono2_paciente = cleanPhone(chunks[14]);
        const comentarios = cleanCSVField(chunks[15]);
        const especialidad = cleanCSVField(chunks[16]);
        const centro = cleanCSVField(chunks[17]);

        const row = {
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
            direccion_paciente,
            departamento,
            telefono1_paciente,
            telefono2_paciente,
            comentarios,
            especialidad,
            centro
        };

        rows.push(row);
        
        // Batch upload
        if (rows.length === 500) {
            const { error } = await supabase.from("visitas_chequeo").insert(rows);
            if(error) {
                console.error("❌ Error en lote:", error);
            } else {
                count += rows.length;
                console.log(`✅ Lote importado. Total subidos: ${count}`);
            }
            rows = []; // Reset batch
        }
    }

    if (rows.length > 0) {
        const { error } = await supabase.from("visitas_chequeo").insert(rows);
        if(error) {
            console.error("❌ Error en último lote:", error.message || error);
        } else {
            count += rows.length;
            console.log(`✅ Lote final importado. Total final subidos: ${count}`);
        }
    }

    console.log("===================================");
    console.log("🎉 Importación Finalizada.");
    console.log("===================================");

  } catch (err) {
    console.error("❌ Error general:", err);
  }
}

// Iniciar script
startImport();
