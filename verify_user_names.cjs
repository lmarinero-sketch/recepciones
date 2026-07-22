/**
 * verify_user_names.cjs — Verifica los nombres actuales en la DB
 */
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
    const { data, error } = await sb
        .from('admqui_usuarios')
        .select('id, usuario, nombre, iniciales')
        .in('usuario', ['gcorrea', 'rmarun']);

    if (error) throw error;
    console.log('\n📋 Usuarios en DB:\n');
    data.forEach(u => console.log(`  ${u.usuario} → ${u.nombre} (${u.iniciales})`));
    console.log('');
}

main().catch(e => console.error('Error:', e.message));
