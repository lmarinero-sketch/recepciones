/**
 * fix_user_names.cjs
 * Corrige nombres de usuarios gcorrea y rmarun en la DB
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
    console.log('\n🔧 Corrigiendo nombres de usuarios...\n');

    // Fix gcorrea: Guillermo → Gustavo
    const { data: d1, error: e1 } = await sb
        .from('admqui_usuarios')
        .update({ nombre: 'Gustavo Correa' })
        .eq('usuario', 'gcorrea')
        .select('id, usuario, nombre');

    if (e1) {
        console.error('❌ Error actualizando gcorrea:', e1.message);
    } else if (d1 && d1.length > 0) {
        console.log('✅ gcorrea actualizado:', d1[0].nombre);
    } else {
        console.log('⚠️  gcorrea no encontrado en admqui_usuarios');
    }

    // Fix rmarun: Roberto → Romina
    const { data: d2, error: e2 } = await sb
        .from('admqui_usuarios')
        .update({ nombre: 'Romina Marun' })
        .eq('usuario', 'rmarun')
        .select('id, usuario, nombre');

    if (e2) {
        console.error('❌ Error actualizando rmarun:', e2.message);
    } else if (d2 && d2.length > 0) {
        console.log('✅ rmarun actualizado:', d2[0].nombre);
    } else {
        console.log('⚠️  rmarun no encontrado en admqui_usuarios');
    }

    console.log('\n✅ Corrección completada.\n');
}

main().catch(e => {
    console.error('💥 Error fatal:', e.message);
    process.exit(1);
});
