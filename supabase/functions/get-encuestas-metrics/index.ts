import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token, x-device-token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function normalizeKey(rawPhone: string | null | undefined): string {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    // Usar los últimos 10 dígitos (ej. 2644538548) o últimos 7 como clave de cruce
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            throw new Error('Missing Supabase environment variables');
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        const { data, error } = await supabase
            .from('encuestas_preventivos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5000);

        if (error) {
            throw error;
        }

        const rows = data || [];
        const phones = [...new Set(rows.map(d => d.telefono))].filter(Boolean);

        // 1. Buscar nombres en crm_contacts (en lotes para evitar URLs largas)
        const contactMap: Record<string, string> = {};
        const keyToContactName: Record<string, string> = {};
        for (let i = 0; i < phones.length; i += 100) {
            const chunk = phones.slice(i, i + 100);
            const { data: contacts } = await supabase
                .from('crm_contacts')
                .select('phone, nombre')
                .in('phone', chunk);
            if (contacts) {
                contacts.forEach((c: any) => {
                    if (c.nombre && c.nombre !== c.phone && c.nombre.toLowerCase() !== 'unknown') {
                        contactMap[c.phone] = c.nombre;
                        const k = normalizeKey(c.phone);
                        if (k) keyToContactName[k] = c.nombre;
                    }
                });
            }
        }

        // 2. Buscar datos clínicos completos en recepciones_visitas (turnos de chequeo)
        const { data: visitas } = await supabase
            .from('recepciones_visitas')
            .select('telefono1, fecha, paciente, dni, obra_social, centro, tipo_visita, tipo_agenda')
            .not('telefono1', 'is', null)
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%,tipo_visita.ilike.%CHEQUEO%,tipo_agenda.ilike.%CHEQUEO%')
            .order('fecha', { ascending: false })
            .limit(4000);

        const visitsByKey: Record<string, any[]> = {};
        if (visitas) {
            visitas.forEach((v: any) => {
                const k = normalizeKey(v.telefono1);
                if (!k) return;
                if (!visitsByKey[k]) visitsByKey[k] = [];
                visitsByKey[k].push(v);
            });
        }

        // 3. Enriquecer cada encuesta con los datos de su visita y contacto
        const dataWithNames = rows.map((d: any) => {
            const k = normalizeKey(d.telefono);
            const candidateVisits = (k && visitsByKey[k]) ? visitsByKey[k] : [];
            const surveyDateStr = d.created_at ? d.created_at.split('T')[0] : null;

            // Elegir la visita cuya fecha sea <= fecha de la encuesta (o la más reciente disponible)
            let matchedVisit = candidateVisits.find((v: any) => !surveyDateStr || v.fecha <= surveyDateStr) || candidateVisits[0] || null;

            const rawName = matchedVisit?.paciente || contactMap[d.telefono] || (k ? keyToContactName[k] : null) || null;

            return {
                ...d,
                nombre_paciente: rawName || 'Paciente',
                dni: matchedVisit?.dni || null,
                obra_social: matchedVisit?.obra_social || null,
                centro: matchedVisit?.centro || null,
                fecha_turno: matchedVisit?.fecha || null,
                tipo_visita: matchedVisit?.tipo_visita || null,
            };
        });

        return new Response(
            JSON.stringify({ data: dataWithNames }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
    } catch (error: any) {
        console.error('Error fetching metrics:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
