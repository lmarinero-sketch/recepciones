import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Faltan variables de entorno");
    process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
    const { data, error } = await supabase.from('admqui_usuarios').select('*');
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Usuarios en admqui_usuarios:", data.map(u => u.usuario));
    }
}
main();
