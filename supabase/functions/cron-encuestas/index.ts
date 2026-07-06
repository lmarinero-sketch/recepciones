// Supabase Edge Function: cron-encuestas
// Tarea programada para enviar automáticamente encuestas de satisfacción
// Se dispara diariamente mediante pg_cron o pg_net
// Lógica:
// 1. Busca pacientes del día actual (o del día anterior si corre de madrugada)
//    con asistencia = 'Presente' en visitas_chequeo.
// 2. Crea el registro INVITADO en encuestas_preventivos.
// 3. Envía la plantilla 'encuesta_de_satisfaccion' usando send-whatsapp.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// La línea de WhatsApp predeterminada para el envío
const DEFAULT_LINE_ID = 'line_recepciones';

Deno.serve(async (req) => {
    // Verificar que sea POST (requerido por pg_net / schedulers)
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Calcular la fecha actual (o la de hoy para buscar pacientes recientes)
        const today = new Date();
        // Restar algunas horas si se necesita asegurar de tomar el día local correcto (ej: Argentina UTC-3)
        today.setHours(today.getHours() - 3);
        const startDate = today.toISOString().split('T')[0];

        console.log(`[cron-encuestas] Buscando pacientes con asistencia='Presente' desde el ${startDate}...`);

        // 1. Buscar pacientes desde Junio 2026 en adelante
        const { data: visitas, error: fetchError } = await supabase
            .from('recepciones_visitas')
            .select('dni, paciente, telefono1, hora, fecha')
            .gte('fecha', startDate)
            .eq('asistencia', 'Presente')
            .ilike('tipo_visita', '%CHQ%')
            .not('telefono1', 'is', null)
            .order('fecha', { ascending: true });

        if (fetchError) throw fetchError;
        if (!visitas || visitas.length === 0) {
            console.log(`[cron-encuestas] No hay pacientes para enviar la encuesta hoy.`);
            return new Response(JSON.stringify({ ok: true, sentCount: 0 }), { status: 200 });
        }

        // Extraer teléfonos únicos y el primer nombre del paciente
        const patientsMap = new Map();
        visitas.forEach(v => {
            let phone = String(v.telefono1).replace(/\D/g, '');
            // Simple validación: si tiene más de 9 dígitos lo consideramos
            if (phone.length >= 9) {
                // Formato WhatsApp esperado por Meta y nuestra DB: 549XXXXXXXXXX
                if (phone.startsWith('54') && !phone.startsWith('549')) {
                    phone = '549' + phone.substring(2);
                } else if (!phone.startsWith('54')) {
                    // Si no tiene prefijo, asumimos 549 y área 264
                    phone = phone.length === 10 ? '549' + phone : '549264' + phone;
                }
                
                if (!patientsMap.has(phone)) {
                    // Extraer solo el primer nombre
                    const firstName = v.paciente ? v.paciente.split(',')[1]?.trim().split(' ')[0] || v.paciente.split(' ')[0] : 'Paciente';
                    // Capitalizar
                    const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                    patientsMap.set(phone, { phone, name: formattedName });
                }
            }
        });

        const uniquePatients = Array.from(patientsMap.values());
        console.log(`[cron-encuestas] Encontrados ${uniquePatients.length} pacientes únicos.`);

        const MAX_ENVIOS_DIARIOS = 50;
        let sentCount = 0;

        // 2. Procesar cada paciente
        for (const patient of uniquePatients) {
            if (sentCount >= MAX_ENVIOS_DIARIOS) {
                console.log(`[cron-encuestas] ⚠️ Se alcanzó el límite seguro diario de ${MAX_ENVIOS_DIARIOS} encuestas.`);
                break;
            }

            // REGLA RESTRICTIVA: Verificar si ya tiene una encuesta en su HISTORIAL
            // El envío automático ocurre 1 sola vez por paciente.
            // Para envíos posteriores se requiere autorización/acción manual del usuario.
            const { data: existingSurvey } = await supabase
                .from('encuestas_preventivos')
                .select('id')
                .eq('telefono', patient.phone)
                .limit(1)
                .single();

            if (existingSurvey) {
                console.log(`[cron-encuestas] REGLA RESTRICTIVA: El paciente ${patient.phone} ya tiene una encuesta previa, saltando envío automático.`);
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
            // Esto dispara la plantilla de Meta oficial
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

                    // IMPORTANTE: Registrar el envío en el chat para que Recepciones sepa que se envió
                    await supabase.from('whatsapp_messages').insert({
                        phone: patient.phone,
                        direction: 'outgoing',
                        content: `✅ [Envío Automático Exitoso] Plantilla: Encuesta de Satisfacción`,
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

        return new Response(JSON.stringify({ ok: true, sentCount }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error) {
        console.error('[cron-encuestas] Error general:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
