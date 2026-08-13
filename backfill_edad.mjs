/**
 * backfill_edad.mjs — Script para asociar edades a recepciones_visitas y visitas_chequeo desde hospital_pacientes
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
});

const supabase = createClient(
    env.VITE_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY
);

const cleanDni = (d) => (d ? d.toString().replace(/\D/g, '') : '');

async function backfillTable() {
    console.log(`\n==================================================`);
    console.log(`🚀 Cargando Padrón Maestro de Edades (hospital_pacientes)...`);
    console.log(`==================================================`);

    const ageMap = new Map(); // cleanDni -> edad (int)

    let fromHp = 0;
    const PAGE_SIZE = 1000;
    let loadedHp = 0;

    while (true) {
        const { data, error } = await supabase
            .from('hospital_pacientes')
            .select('dni, edad')
            .not('edad', 'is', null)
            .not('dni', 'is', null)
            .range(fromHp, fromHp + PAGE_SIZE - 1);

        if (error) {
            console.error('Error cargando hospital_pacientes:', error.message);
            break;
        }
        if (!data || data.length === 0) break;

        for (const p of data) {
            const cd = cleanDni(p.dni);
            const numAge = parseInt(p.edad, 10);
            if (cd && cd.length >= 6 && !isNaN(numAge) && numAge >= 0 && numAge <= 120) {
                if (!ageMap.has(cd)) ageMap.set(cd, numAge);
            }
        }
        loadedHp += data.length;
        if (data.length < PAGE_SIZE) break;
        fromHp += PAGE_SIZE;

        if (fromHp % 20000 === 0) {
            console.log(`   Progreso mapa: ${loadedHp} pacientes leídos, ${ageMap.size} DNIs únicos con edad.`);
        }
    }
    console.log(`✅ Mapa cargado completo: ${loadedHp} pacientes leídos, ${ageMap.size} DNIs únicos con edad.`);

    const tables = ['recepciones_visitas', 'visitas_chequeo'];

    for (const tableName of tables) {
        console.log(`\n--------------------------------------------------`);
        console.log(`🔄 Procesando tabla: ${tableName}`);
        console.log(`--------------------------------------------------`);

        let targetRows = [];
        let from = 0;

        while (true) {
            const { data, error } = await supabase
                .from(tableName)
                .select('id, dni')
                .is('edad', null)
                .not('dni', 'is', null)
                .range(from, from + PAGE_SIZE - 1);

            if (error) {
                console.error(`Error leyendo ${tableName}:`, error.message);
                break;
            }
            if (!data || data.length === 0) break;
            targetRows = targetRows.concat(data);
            if (data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        console.log(`📊 Registros en ${tableName} pendientes de edad: ${targetRows.length}`);

        if (targetRows.length === 0) {
            console.log(`🎉 No hay registros pendientes de edad en ${tableName}.`);
            continue;
        }

        // Agrupar IDs por valor de edad
        const idsByAge = new Map(); // ageInt -> Array<id>
        let matchedCount = 0;

        for (const r of targetRows) {
            const cd = cleanDni(r.dni);
            if (cd && ageMap.has(cd)) {
                const age = ageMap.get(cd);
                if (!idsByAge.has(age)) idsByAge.set(age, []);
                idsByAge.get(age).push(r.id);
                matchedCount++;
            }
        }

        console.log(`🎯 Coincidencias encontradas: ${matchedCount} / ${targetRows.length} (${((matchedCount / targetRows.length) * 100).toFixed(1)}%)`);

        // Ejecutar actualización por lotes por edad
        let updatedTotal = 0;
        for (const [age, ids] of idsByAge.entries()) {
            const CHUNK_SIZE = 500;
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase
                    .from(tableName)
                    .update({ edad: age })
                    .in('id', chunk);

                if (error) {
                    console.error(`Error actualizando lotes para edad ${age}:`, error.message);
                } else {
                    updatedTotal += chunk.length;
                }
            }
        }

        console.log(`✅ ${updatedTotal} registros actualizados con su edad correspondiente en ${tableName}.`);
    }
}

backfillTable().catch(err => {
    console.error('💥 Error en backfill:', err);
});
