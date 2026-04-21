import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hakysnqiryimxbwdslwe.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkOrAddUser() {
    console.log('Checking for user ggodoy@sanatorioargentino.com.ar...')
    
    // Check if user exists
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers()
    if (listError) {
        console.error('Error listing users:', listError)
        return
    }

    const user = usersData.users.find(u => u.email === 'ggodoy@sanatorioargentino.com.ar')

    if (user) {
        console.log('User exists with ID:', user.id)
        // Reset password just in case
        console.log('Updating password to 123456...')
        const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
            password: '123456',
            user_metadata: { role: 'admin_global' } // Give some permissions
        })
        if (updateError) {
            console.error('Failed to update password:', updateError)
        } else {
            console.log('Password updated successfully. Try logging in now.')
        }

        // Add to hub_perfiles if needed
        const { error: pError } = await supabase.from('hub_perfiles').upsert({
            user_id: user.id,
            display_name: 'Guillermo Godoy',
            role_id: 1, // Admin global
            activo: true
        })
        console.log('Hub profile updated:', pError || 'Success')

    } else {
        console.log('User does not exist. Creating...')
        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
            email: 'ggodoy@sanatorioargentino.com.ar',
            password: '123456',
            email_confirm: true
        })

        if (createError) {
            console.error('Error creating user:', createError)
        } else {
            console.log('User created successfully:', createData.user.id)
            
            // Add to hub_perfiles
            const { error: pError } = await supabase.from('hub_perfiles').insert({
                user_id: createData.user.id,
                display_name: 'Guillermo Godoy',
                role_id: 1,
                activo: true
            })
            console.log('Hub profile created:', pError || 'Success')
        }
    }
}

checkOrAddUser()
