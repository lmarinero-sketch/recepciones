/**
 * Helper para ejecutar migraciones SQL usando las variables del .env
 * Uso: node run_migration.cjs <archivo.sql>
 */
const fs = require('fs');
const path = require('path');

// Load .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.trim().match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_PROJECT_REF = env.SUPABASE_PROJECT_REF;

async function runMigration(sqlFile) {
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log(`\n📦 Ejecutando migración: ${sqlFile}`);
    console.log(`   Proyecto: ${SUPABASE_PROJECT_REF}`);
    console.log(`   SQL length: ${sql.length} chars\n`);

    const resp = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ query: sql }),
    });

    if (resp.ok) {
        const data = await resp.json();
        console.log('✅ Migración ejecutada exitosamente');
        if (Array.isArray(data) && data.length > 0) {
            console.log('   Resultado:', JSON.stringify(data).substring(0, 200));
        }
    } else {
        const errText = await resp.text();
        console.error('❌ Error en migración:', errText.substring(0, 500));
        process.exit(1);
    }
}

const sqlFile = process.argv[2];
if (!sqlFile) {
    console.error('Uso: node run_migration.cjs <archivo.sql>');
    process.exit(1);
}

runMigration(sqlFile).catch(e => {
    console.error('💥 Error fatal:', e.message);
    process.exit(1);
});
