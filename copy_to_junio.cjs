/**
 * copy_to_junio.cjs
 * 
 * Copia TODAS las asignaciones del periodo 2026-07 al periodo 2026-06,
 * manteniendo exactamente los mismos datos (médico, consultorio, día, franja, etc.)
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const PERIODO_ORIGEN = '2026-07';
const PERIODO_DESTINO = '2026-06';

async function main() {
    console.log(`\n📋 Copiando asignaciones de ${PERIODO_ORIGEN} → ${PERIODO_DESTINO}\n`);

    // 1. Verificar si ya existen asignaciones en el periodo destino
    const { count: existingCount, error: countErr } = await sb
        .from('alq_asignaciones')
        .select('*', { count: 'exact', head: true })
        .eq('periodo', PERIODO_DESTINO);

    if (countErr) throw new Error('Error contando destino: ' + countErr.message);

    if (existingCount > 0) {
        console.log(`⚠️  Ya existen ${existingCount} asignaciones en el periodo ${PERIODO_DESTINO}.`);
        console.log(`   Si querés reemplazarlas, primero borralas manualmente.`);
        console.log(`   Abortando para no duplicar datos.\n`);
        return;
    }

    // 2. Leer todas las asignaciones del periodo origen
    const { data: asignaciones, error: fetchErr } = await sb
        .from('alq_asignaciones')
        .select('medico_id, consultorio_id, dia_semana, franja, es_residente, es_rotativo, estado')
        .eq('periodo', PERIODO_ORIGEN);

    if (fetchErr) throw new Error('Error leyendo origen: ' + fetchErr.message);

    console.log(`📊 Asignaciones encontradas en ${PERIODO_ORIGEN}: ${asignaciones.length}`);

    if (asignaciones.length === 0) {
        console.log('   No hay nada que copiar.');
        return;
    }

    // 3. Preparar registros para el nuevo periodo
    const nuevas = asignaciones.map(a => ({
        medico_id: a.medico_id,
        consultorio_id: a.consultorio_id,
        dia_semana: a.dia_semana,
        franja: a.franja,
        periodo: PERIODO_DESTINO,
        es_residente: a.es_residente,
        es_rotativo: a.es_rotativo,
        estado: a.estado,
    }));

    // 4. Insertar en batches
    const batchSize = 50;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < nuevas.length; i += batchSize) {
        const batch = nuevas.slice(i, i + batchSize);
        const { data: result, error } = await sb
            .from('alq_asignaciones')
            .insert(batch)
            .select();

        if (error) {
            // Intentar uno por uno en caso de conflicto
            for (const a of batch) {
                const { error: e2 } = await sb.from('alq_asignaciones').insert(a).select();
                if (e2) {
                    errors++;
                    if (errors <= 5) console.log(`  ❌ ${e2.message.substring(0, 100)}`);
                } else {
                    inserted++;
                }
            }
        } else {
            inserted += result.length;
        }
        process.stdout.write(`\r  Insertadas: ${inserted}/${nuevas.length} (errores: ${errors})`);
    }

    console.log(`\n\n✅ Copia completada:`);
    console.log(`   Periodo origen:  ${PERIODO_ORIGEN}`);
    console.log(`   Periodo destino: ${PERIODO_DESTINO}`);
    console.log(`   Asignaciones copiadas: ${inserted}`);
    console.log(`   Errores: ${errors}\n`);
}

main().catch(e => {
    console.error('💥 Error fatal:', e.message);
    process.exit(1);
});
