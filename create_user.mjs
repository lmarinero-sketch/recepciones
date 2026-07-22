import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const usuario = 'rmarun'; // Normalized username
    const nombre = 'Romina Marun'; // You can use anything or fetch if exists
    const password = '123456';
    const iniciales = 'RM';

    console.log(`Buscando usuario: ${usuario}...`);

    const { data: users, error } = await supabase
        .from('admqui_usuarios')
        .select('*')
        .eq('usuario', usuario);
        
    if (error) {
        console.error('Error fetching user:', error.message);
        return;
    }

    if (users && users.length === 0) {
        console.log(`Usuario no encontrado. Creando ${usuario}...`);
        const { data, error: createError } = await supabase.rpc('create_user', {
            p_usuario: usuario,
            p_nombre: nombre,
            p_password: password,
            p_iniciales: iniciales,
        });
        
        if (createError) {
            console.error('Error creating user:', createError.message);
        } else {
            console.log('✅ Usuario creado correctamente.');
        }
    } else {
        console.log(`Usuario ya existe. Intentando borrar y recrear para resetear password...`);
        const { error: deleteError } = await supabase
            .from('admqui_usuarios')
            .delete()
            .eq('usuario', usuario);
            
        if (deleteError) {
             console.error('Error borrando usuario:', deleteError.message);
             // Si falla borrar por foreign keys, intentaremos update si hay un rpc de reset
             console.log('Intentando actualizar password con change_password_admin...');
             const { error: resetError } = await supabase.rpc('change_password_admin', {
                 p_user_id: users[0].id,
                 p_new_password: password,
             });
             if (resetError) {
                  console.error('Error updating password via admin rpc:', resetError.message);
             } else {
                  console.log('✅ Contraseña actualizada vía admin RPC');
             }
             return;
        }
        
        console.log('Usuario borrado. Re-creando...');
        const { data, error: createError } = await supabase.rpc('create_user', {
            p_usuario: usuario,
            p_nombre: users[0].nombre || nombre,
            p_password: password,
            p_iniciales: users[0].iniciales || iniciales,
        });
        
        if (createError) {
            console.error('Error re-creating user:', createError.message);
        } else {
            console.log('✅ Usuario re-creado correctamente (contraseña reseteada).');
        }
    }
}

run().catch(console.error);
