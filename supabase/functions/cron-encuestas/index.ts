// Supabase Edge Function: cron-encuestas
// Tarea programada para enviar automáticamente encuestas de satisfacción
// Se dispara diariamente mediante pg_cron o manualmente desde el panel de Recepciones.
// Lógica:
// 1. Busca pacientes de días recientes (por defecto últimos 2 días para cubrir fines de semana o turnos)
//    con asistencia = 'Presente' en recepciones_visitas.
// 2. Filtra turnos que tengan tipo_visita o tipo_agenda relacionado con chequeos.
// 3. Omite pacientes que ya hayan recibido una encuesta en los últimos 30 días.
// 4. Crea el registro INVITADO en encuestas_preventivos.
// 5. Envía la plantilla 'encuesta_de_satisfaccion' usando send-whatsapp.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// La línea de WhatsApp predeterminada para el envío
const DEFAULT_LINE_ID = 'line_recepciones';

Deno.serve(async (req) => {
    // Verificar que sea POST
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        let body: any = {};
        try {
            body = await req.json();
        } catch (_) {
            body = {};
        }

        const daysBack = typeof body.daysBack === 'number' ? body.daysBack : 2;
        const maxEnvios = typeof body.maxSends === 'number' ? body.maxSends : 50;

        // Calcular rango de fechas local (Argentina UTC-3)
        const today = new Date();
        today.setHours(today.getHours() - 3);

        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - daysBack);

        const startDate = body.startDate || targetDate.toISOString().split('T')[0];
        const endDate = body.endDate || today.toISOString().split('T')[0];

        console.log(`[cron-encuestas] Buscando pacientes con asistencia='Presente' entre ${startDate} y ${endDate}...`);

        // 1. Buscar visitas presentes con tipo_visita o tipo_agenda de chequeos
        const { data: visitas, error: fetchError } = await supabase
            .from('recepciones_visitas')
            .select('dni, paciente, telefono1, hora, fecha, tipo_visita, tipo_agenda')
            .gte('fecha', startDate)
            .lte('fecha', endDate)
            .eq('asistencia', 'Presente')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .not('telefono1', 'is', null)
            .order('fecha', { ascending: true });

        if (fetchError) throw fetchError;
        if (!visitas || visitas.length === 0) {
            console.log(`[cron-encuestas] No hay pacientes para enviar la encuesta en el rango seleccionado.`);
            return new Response(JSON.stringify({ ok: true, sentCount: 0, message: 'No hay pacientes pendientes en el rango' }), { status: 200 });
        }

        // Extraer teléfonos únicos y el primer nombre del paciente
        const patientsMap = new Map();
        visitas.forEach(v => {
            let phone = String(v.telefono1).replace(/\D/g, '');
            if (phone.length >= 9) {
                // Formato WhatsApp esperado por Meta y nuestra DB: 549XXXXXXXXXX
                if (phone.startsWith('54') && !phone.startsWith('549')) {
                    phone = '549' + phone.substring(2);
                } else if (!phone.startsWith('54')) {
                    phone = phone.length === 10 ? '549' + phone : '549264' + phone;
                }
                
                if (!patientsMap.has(phone)) {
                    const firstName = v.paciente ? v.paciente.split(',')[1]?.trim().split(' ')[0] || v.paciente.split(' ')[0] : 'Paciente';
                    const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                    patientsMap.set(phone, { phone, name: formattedName, fecha: v.fecha });
                }
            }
        });

        const uniquePatients = Array.from(patientsMap.values());
        console.log(`[cron-encuestas] Encontrados ${uniquePatients.length} pacientes únicos.`);

        // Límite de 30 días para no reenviar a quien ya recibió encuesta este mes
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

        let sentCount = 0;

        // 2. Procesar cada paciente
        for (const patient of uniquePatients) {
            if (sentCount >= maxEnvios) {
                console.log(`[cron-encuestas] ⚠️ Se alcanzó el límite seguro de ${maxEnvios} encuestas.`);
                break;
            }

            // REGLA INTELIGENTE: Verificar si ya tiene una encuesta en los últimos 30 días
            const { data: recentSurveys } = await supabase
                .from('encuestas_preventivos')
                .select('id, estado, created_at')
                .eq('telefono', patient.phone)
                .gte('created_at', thirtyDaysAgoStr)
                .limit(1);

            if (recentSurveys && recentSurveys.length > 0) {
                console.log(`[cron-encuestas] Paciente ${patient.phone} ya tiene una encuesta en los últimos 30 días, saltando.`);
                continue;
            }

            // Insertar INVITADO
            const { error: insertError } = await supabase
                .from('encuestas_preventivos')
                .insert({
                    telefono: patient.phone,
                    estado: 'INVITADO'
                });

            if (insertError) {
                console.error(`[cron-encuestas] Error insertando invitado ${patient.phone}:`, insertError);
                continue;
            }

            // Consumir el Edge Function send-whatsapp
            try {
                const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                    },
                    body: JSON.stringify({
                        action: 'send_template',
                        templateName: 'encuesta_de_satisfaccion',
                        languageCode: 'es_AR',
                        number: patient.phone,
                        lineId: DEFAULT_LINE_ID,
                        components: [
                            {
                                type: 'body',
                                parameters: [
                                    { type: 'text', text: patient.name }
                                ]
                            }
                        ]
                    })
                });

                if (sendRes.ok) {
                    console.log(`[cron-encuestas] ✅ Encuesta enviada a ${patient.phone} (${patient.name})`);
                    sentCount++;

                    // Registrar el envío en el chat para visibilidad del operador
                    await supabase.from('whatsapp_messages').insert({
                        phone: patient.phone,
                        direction: 'outgoing',
                        content: `✅ [Envío Encuesta Satisfacción] Plantilla enviada a ${patient.name}`,
                        media_type: 'text',
                        sender_name: 'Dora (Bot)',
                        is_read: true,
                        line_id: DEFAULT_LINE_ID
                    }).catch(e => console.error('[cron-encuestas] Error logging message:', e));

                } else {
                    const errBody = await sendRes.text();
                    console.error(`[cron-encuestas] ❌ Fallo el envío a ${patient.phone}:`, errBody);
                }
            } catch (err) {
                console.error(`[cron-encuestas] ❌ Excepción llamando a send-whatsapp para ${patient.phone}:`, err);
            }
        }

        console.log(`[cron-encuestas] Proceso finalizado. Enviadas: ${sentCount}`);

        return new Response(JSON.stringify({ 
            ok: true, 
            sentCount, 
            totalFound: uniquePatients.length,
            targetWindow: { startDate, endDate } 
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error('[cron-encuestas] Error general:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
