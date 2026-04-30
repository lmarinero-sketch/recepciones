import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDIyNzQsImV4cCI6MjA4NTYxODI3NH0.-85OS1dohc9gh4U4qBhEBlqHi9Bq7l7H6JnzcUzrCIg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function clearTemplates() {
    console.log('Fetching all templates...');
    const { data: shortcuts, error: fetchError } = await supabase
        .from('whatsapp_shortcuts')
        .select('id');
        
    if (fetchError) {
        console.error('Error fetching:', fetchError);
        return;
    }
    
    if (!shortcuts || shortcuts.length === 0) {
        console.log('No templates found.');
        return;
    }
    
    console.log(`Found ${shortcuts.length} templates. Deleting...`);
    
    for (const shortcut of shortcuts) {
        const { error: deleteError } = await supabase
            .from('whatsapp_shortcuts')
            .delete()
            .eq('id', shortcut.id);
            
        if (deleteError) {
            console.error('Error deleting ID:', shortcut.id, deleteError);
        }
    }
    
    console.log('All templates successfully deleted!');
}

clearTemplates();
