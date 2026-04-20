const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

// Parsear .env manualmente
const envContent = fs.readFileSync(".env", "utf-8");
const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if(match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function cleanPhone(raw) {
    if (!raw) return null;
    const s = raw.toString().trim();
    if (s === "" || s.toUpperCase() === "NULL") return null;
    
    // Si ya es un número limpio (sin notación científica), devolverlo
    if (/^\d+$/.test(s)) return s;
    
    // Notación científica con coma (ej: 5,49265E+12)
    if (s.toUpperCase().includes("E+")) {
        try {
            const num = Number(s.replace(",", "."));
            if (!isNaN(num)) return Math.round(num).toString();
        } catch(e) {}
    }
    
    // Quitar todo lo que no sea dígito
    const digits = s.replace(/\D/g, "");
    return digits.length > 0 ? digits : null;
}

async function fixPhones() {
    console.log("===================================");
    console.log("📞 Arreglando teléfonos en visitas_chequeo...");
    console.log("===================================");

    const csvContent = fs.readFileSync("visitas.csv", "latin1");
    const lines = csvContent.split(/\r?\n/);
    const delimiter = ";";

    // Construir un mapa de (nhc + fecha + hora) -> (tel1, tel2) del CSV
    let updateBatch = [];
    let totalUpdated = 0;
    let totalErrors = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const chunks = line.split(delimiter);
        if (chunks.length < 18) continue;

        const nhc = chunks[4] ? chunks[4].trim() : null;
        let fecha_raw = chunks[1] ? chunks[1].trim() : null;
        if (fecha_raw) fecha_raw = fecha_raw.split(" ")[0];
        const hora_raw = chunks[2] ? chunks[2].trim() : null;
        
        const tel1 = cleanPhone(chunks[13]);
        const tel2 = cleanPhone(chunks[14]);

        // Solo procesar si hay al menos un teléfono
        if (!tel1 && !tel2) continue;
        if (!nhc || !fecha_raw) continue;

        // Validar que hora sea válida (no texto basura)
        if (hora_raw && !/^\d{1,2}:\d{2}/.test(hora_raw)) continue;

        updateBatch.push({ nhc, fecha: fecha_raw, hora: hora_raw, tel1, tel2 });

        if (updateBatch.length === 200) {
            const results = await processBatch(updateBatch);
            totalUpdated += results.ok;
            totalErrors += results.err;
            console.log(`✅ Procesado lote. Actualizados: ${totalUpdated} | Errores: ${totalErrors}`);
            updateBatch = [];
        }
    }

    // Procesar último lote
    if (updateBatch.length > 0) {
        const results = await processBatch(updateBatch);
        totalUpdated += results.ok;
        totalErrors += results.err;
    }

    console.log("===================================");
    console.log(`🎉 Finalizado. ${totalUpdated} registros actualizados, ${totalErrors} errores.`);
    console.log("===================================");
}

async function processBatch(batch) {
    let ok = 0;
    let err = 0;

    // Agrupar updates en una sola consulta RPC no es viable, 
    // así que hacemos updates individuales filtrados por combinación única
    for (const row of batch) {
        let query = supabase
            .from("visitas_chequeo")
            .update({
                telefono1_paciente: row.tel1,
                telefono2_paciente: row.tel2
            })
            .eq("nhc", row.nhc)
            .eq("fecha", row.fecha);

        if (row.hora) {
            query = query.eq("hora", row.hora);
        }

        const { error } = await query;
        if (error) {
            err++;
        } else {
            ok++;
        }
    }

    return { ok, err };
}

fixPhones();
