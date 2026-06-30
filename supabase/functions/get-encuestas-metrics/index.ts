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

        // Fetch recent visits to get the appointment date
        // Solo necesitamos los últimos 30-60 días para cubrir las encuestas recientes
        const { data: visitas } = await supabase
            .from('recepciones_visitas')
            .select('telefono1, fecha')
            .not('telefono1', 'is', null)
            .order('fecha', { ascending: false })
            .limit(1000); // Suficiente para las últimas semanas

        const visitDateMap = {};
        if (visitas) {
            visitas.forEach(v => {
                if (!v.telefono1) return;
                let phone = String(v.telefono1).replace(/\D/g, '');
                if (phone.length >= 9) {
                    if (phone.startsWith('54') && !phone.startsWith('549')) {
                        phone = '549' + phone.substring(2);
                    } else if (!phone.startsWith('54')) {
                        phone = phone.length === 10 ? '549' + phone : '549264' + phone;
                    }
                    
                    // Solo guardamos la fecha más reciente (como están ordenados descendentemente,
                    // la primera que encontremos es la más reciente o podemos simplemente asignar
                    // pero no sobreescribir si ya existe)
                    if (!visitDateMap[phone]) {
                        visitDateMap[phone] = v.fecha;
                    }
                }
            });
        }

        // Attach names and appointment dates
        const dataWithNames = data.map(d => ({
            ...d,
            nombre_paciente: contactMap[d.telefono] || 'Paciente Desconocido',
            fecha_turno: visitDateMap[d.telefono] || null
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
