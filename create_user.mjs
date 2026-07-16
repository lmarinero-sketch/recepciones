import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  const email = 'rmarun@sanatorioargentino.com.ar';
  const password = '123456';

  console.log(`Intentando crear el usuario: ${email}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true 
  });

  if (error) {
    if (error.message.includes('already exists') || error.message.includes('email address')) {
      console.log('El usuario ya existe en auth. Actualizando contraseña...');
      
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error('Error listing users:', listError.message);
        return;
      }
      
      const user = users.find(u => u.email === email);
      if (user) {
         const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
           user.id,
           { password: password, email_confirm: true }
         );
         
         if (updateError) {
           console.error('Error actualizando usuario:', updateError.message);
         } else {
           console.log('✅ Contraseña actualizada correctamente para el usuario existente.');
         }
      } else {
         console.error('El usuario no se encontró en la lista, aunque dio error de duplicado.');
      }
    } else {
      console.error('❌ Error creando usuario:', error.message);
    }
  } else {
    console.log('✅ ¡Usuario creado con éxito en auth!');
  }
  
  // Update public user profile just in case there is one
  console.log('Verificando en base de datos publica...');
}

run();
