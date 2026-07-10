import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
    const parts = line.split('=');
    if (parts.length > 1) acc[parts[0].trim()] = parts.slice(1).join('=').trim();
    return acc;
}, {});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: users, error } = await supabase
        .from('admqui_usuarios')
        .select('*')
        .eq('usuario', 'gcorrea');
        
    console.log('Users found:', users);
    if (error) console.error('Error fetching users:', error);

    if (users && users.length === 0) {
        console.log("Creating user gcorrea...");
        const { data, error: createError } = await supabase.rpc('create_user', {
            p_usuario: 'gcorrea',
            p_nombre: 'Guillermo Correa',
            p_password: '123456',
            p_iniciales: 'GC',
        });
        if (createError) {
            console.error('Error creating user:', createError);
        } else {
            console.log('User created:', data);
        }
    } else if (users && users.length > 0) {
        console.log("Updating password for gcorrea to 123456...");
        const { data, error: resetError } = await supabase.rpc('change_password_admin', {
            p_user_id: users[0].id,
            p_new_password: '123456',
        });
        // Alternatively, since we don't know if change_password_admin exists, we can try to call change_password if we knew old password, or just drop and recreate.
        if (resetError) {
             console.error('Error updating password via admin rpc:', resetError);
             // try standard update? password might be hashed via pgcrypto.
             // We can check if `change_password` requires old password.
        } else {
             console.log('Password updated via admin RPC');
        }
    }
}

run().catch(console.error);
