import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const phone = '5492645438114';
    
    console.log('1. Borrando registros anteriores de', phone);
    await supabase.from('encuestas_preventivos').delete().eq('telefono', phone);
    
    console.log('2. Insertando nuevo registro en estado INVITADO para', phone);
    const { error: insertError } = await supabase.from('encuestas_preventivos').insert({ telefono: phone, estado: 'INVITADO' });
    if (insertError) {
        console.error('Error insertando registro:', insertError);
        return;
    }
    
    console.log('Registro creado. Solicitando envío de plantilla a BuilderBot...');
    
    // 3. Send template
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
            action: 'send_template',
            lineId: 'line_recepciones',
            number: phone,
            templateName: 'encuesta_de_satisfaccion',
            languageCode: 'es_AR',
            components: [{
                type: 'BODY',
                parameters: [{ type: 'text', text: 'Luis' }] // Test name
            }]
        })
    });
    
    const responseData = await res.json();
    console.log('Respuesta Edge Function:', responseData);
}

run().catch(console.error);
