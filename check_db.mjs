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
    const { data: messages, error } = await supabase
        .from('whatsapp_messages')
        .select('content, raw_payload')
        .ilike('content', '%plantilla%');
        
    if (error) {
        console.error("Error:", error);
        return;
    }
        
    console.log(`Found ${messages.length} messages containing "plantilla" in content.`);
    if (messages.length > 0) {
        const byType = {};
        messages.forEach(m => {
            const template = m.raw_payload?.template_name || m.content;
            byType[template] = (byType[template] || 0) + 1;
        });
        console.log('Breakdown:', byType);
        console.log('Example content:', messages[0].content);
        console.log('Example payload:', messages[0].raw_payload);
    }
}

run().catch(console.error);
