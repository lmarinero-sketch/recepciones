import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Inicializar Supabase con SERVICE ROLE KEY para evadir RLS
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            throw new Error('Missing Supabase environment variables');
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        const { data, error } = await supabase
            .from('encuestas_preventivos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Fetch contact names from crm_contacts
        const phones = [...new Set(data.map(d => d.telefono))].filter(Boolean);
        const { data: contacts } = await supabase
            .from('crm_contacts')
            .select('phone, nombre')
            .in('phone', phones);

        const contactMap = {};
        if (contacts) {
            contacts.forEach(c => {
                contactMap[c.phone] = c.nombre;
            });
        }

        // Attach names
        const dataWithNames = data.map(d => ({
            ...d,
            nombre_paciente: contactMap[d.telefono] || 'Paciente Desconocido'
        }));

        return new Response(
            JSON.stringify({ data: dataWithNames }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
    } catch (error) {
        console.error('Error fetching metrics:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
