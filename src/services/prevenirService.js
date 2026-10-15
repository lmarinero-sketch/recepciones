import { supabase } from '../lib/supabase';
import { normalizeArgentinePhone } from './builderbotApi';
import { saveOutgoingMessage } from './chatService';

export { normalizeArgentinePhone };

export const DEFAULT_SALUS_OBRAS_SOCIALES = [
    "001 - PROVINCIA",
    "004 - DAMSU",
    "005 - OSDE BINARIO",
    "024 - PODER JUDICIAL",
    "028 - IOSFA",
    "038 - AVALIAN SALUD Y BIENESTAR COOPERATIVA LIMITADA",
    "042 - PARTICULARES",
    "065 - OMINT S.A.",
    "066 - MEDICUS S.A.",
    "074 - COLMED SALUD",
    "076 - MEDIFE ASOCIACION CIVIL",
    "097 - SANIP SALUD S.A. (MEDISALUD)",
    "101 - SERVE SALUD (O.S.P.D.I.C.Y)",
    "121 - SWISS MEDICAL S.A.",
    "135 - JERARQUICOS SALUD",
    "140 - LUIS PASTEUR",
    "172 - RED DE SEGURO MEDICO S.R.L.",
    "186 - BOREAL - COBERTURA DE SALUD S.A.",
    "196 - GALENO ARGENTINA S.A.",
    "199 - O.S DE VIAJANTES VENDEDORES RA",
    "200 - ASOCIACION MUTUAL SANCOR SALUD",
    "206 - UNION PERSONAL",
    "213 - UNIMED S.A.",
    "233 - PREVENCION SALUD S.A.",
    "237 - OSPE - OBRA SOCIAL DE PETROLEROS",
    "631 - SANCOR SALUD - PLANES 800",
    "632 - OSPSA - OBRA SOCIAL DEL PERSONAL DE LA SANIDAD ARGENTINA",
    "635 - HOSPITAL DE DIA PLENIA S.R.L. (AVERA)",
    "639 - OSDEPYM",
    "641 - ITER MEDICINA S.A.",
    "642 - FEDERADA SALUD",
    "643 - NOBIS S.A.",
    "644 - OSSACRA",
    "645 - PICO - DISERIO Y ASOC. S.R.L. (HIGEA SALUD)",
    "650 - BRAMED S.R.L.",
    "654 - OSPATCA",
    "655 - OSSEG"
];

let cachedObrasSociales = null;

/**
 * Obtiene las obras sociales registradas en SALUS
 */
export async function fetchSalusObrasSociales() {
    if (cachedObrasSociales && cachedObrasSociales.length > 0) {
        return cachedObrasSociales;
    }

    try {
        const [res1, res2] = await Promise.all([
            supabase.from('visitas_chequeo').select('obra_social').not('obra_social', 'is', null).limit(10000),
            supabase.from('recepciones_visitas').select('obra_social').not('obra_social', 'is', null).limit(10000)
        ]);

        const set = new Set(DEFAULT_SALUS_OBRAS_SOCIALES);
        (res1.data || []).forEach(r => r.obra_social && set.add(r.obra_social.trim()));
        (res2.data || []).forEach(r => r.obra_social && set.add(r.obra_social.trim()));

        // Filtrar las que comiencen con código numérico (convención SALUS)
        const validList = [...set].filter(s => /^\d/.test(s)).sort((a, b) => {
            if (a.startsWith('001')) return -1;
            if (b.startsWith('001')) return 1;
            return a.localeCompare(b);
        });

        cachedObrasSociales = validList;
        return validList;
    } catch (e) {
        console.warn('Error fetching SALUS obras sociales from Supabase, using default list:', e);
        return DEFAULT_SALUS_OBRAS_SOCIALES;
    }
}

/**
 * Calcula la edad exacta en años a partir de una fecha de nacimiento YYYY-MM-DD
 * @param {string} birthDateStr - Fecha en formato 'YYYY-MM-DD'
 * @returns {number|null} - Edad en años o null si es inválida
 */
export function calculateAge(birthDateStr) {
    if (!birthDateStr) return null;
    const parts = birthDateStr.split('-');
    if (parts.length !== 3) return null;

    const birthDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age--;
    }

    return age >= 0 && age <= 125 ? age : null;
}

/**
 * Formatea un número argentino para visualización amigable
 * Ej: 5492645438114 -> +54 9 264 543-8114
 */
export function formatPhoneDisplay(phone) {
    if (!phone) return '';
    const norm = normalizeArgentinePhone(phone);
    if (norm.startsWith('549') && norm.length === 13) {
        return `+54 9 ${norm.slice(3, 6)} ${norm.slice(6, 9)}-${norm.slice(9)}`;
    }
    return phone;
}

/**
 * Valida si un teléfono argentino es potencialmente válido
 * Debe terminar con al menos 10 dígitos locales (código de área + número)
 */
export function isValidArgentinePhone(phone) {
    if (!phone) return false;
    const norm = normalizeArgentinePhone(phone);
    return norm.startsWith('549') && norm.length === 13;
}

/**
 * Guarda un prospecto captado en el Programa Prevenir
 * Permite inserción pública / anónima
 */
export async function savePrevenirLead(leadData) {
    const rawPhone = leadData.telefono ? String(leadData.telefono).trim() : '';
    const normalizedWa = normalizeArgentinePhone(rawPhone);
    const age = leadData.fecha_nacimiento ? calculateAge(leadData.fecha_nacimiento) : (leadData.edad ? parseInt(leadData.edad, 10) : null);

    const record = {
        nombre_completo: leadData.nombre_completo?.trim() || 'Sin Nombre',
        fecha_nacimiento: leadData.fecha_nacimiento || null,
        edad: age,
        telefono: rawPhone,
        telefono_wa: normalizedWa,
        dni: leadData.dni ? String(leadData.dni).replace(/\D/g, '') : null,
        obra_social: leadData.obra_social?.trim() || '001 - PROVINCIA',
        tipo_chequeo: leadData.tipo_chequeo || 'Prevenir',
        lugar_captacion: leadData.lugar_captacion || 'Obra Social Provincia',
        registrado_por: leadData.registrado_por?.trim() || 'Gisela',
        observaciones: leadData.observaciones?.trim() || null,
        estado: 'nuevo',
        mensaje_enviado: false,
    };

    const { data, error } = await supabase
        .from('programa_prevenir_leads')
        .insert(record)
        .select()
        .single();

    if (error) {
        console.error('Error guardando lead en programa_prevenir_leads:', error);
        throw error;
    }

    return data;
}

/**
 * Obtiene los prospectos del Programa Prevenir
 */
export async function fetchPrevenirLeads({ dateFilter = 'all', search = '', limit = 500 } = {}) {
    let query = supabase
        .from('programa_prevenir_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (dateFilter === 'today') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        query = query.gte('created_at', todayStart.toISOString());
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching prevenir leads:', error);
        throw error;
    }

    let results = data || [];
    if (search && search.trim()) {
        const s = search.toLowerCase().trim();
        results = results.filter(l =>
            (l.nombre_completo && l.nombre_completo.toLowerCase().includes(s)) ||
            (l.dni && l.dni.includes(s)) ||
            (l.telefono && l.telefono.includes(s)) ||
            (l.telefono_wa && l.telefono_wa.includes(s)) ||
            (l.obra_social && l.obra_social.toLowerCase().includes(s)) ||
            (l.registrado_por && l.registrado_por.toLowerCase().includes(s))
        );
    }

    return results;
}

/**
 * Actualiza un prospecto (estado, observaciones, etc.)
 */
export async function updatePrevenirLead(id, updates) {
    const { data, error } = await supabase
        .from('programa_prevenir_leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating prevenir lead:', error);
        throw error;
    }
    return data;
}

/**
 * Elimina un prospecto
 */
export async function deletePrevenirLead(id) {
    const { error } = await supabase
        .from('programa_prevenir_leads')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting prevenir lead:', error);
        throw error;
    }
    return true;
}

/**
 * Envía mensaje de WhatsApp automático o personalizado a un prospecto del Programa Prevenir
 * Usa Edge Function 'send-whatsapp' con la línea line_recepciones
 */
export async function sendPrevenirWhatsApp({ lead, customMessage = null }) {
    if (!lead || !lead.telefono_wa) {
        throw new Error('El paciente no tiene un número de WhatsApp válido');
    }

    const nombre = lead.nombre_completo ? lead.nombre_completo.split(' ')[0] : 'Estimado/a';

    const messageText = customMessage || (
        `¡Hola *${nombre}*! 👋 Te contactamos de *Sanatorio Argentino*.\n\n` +
        `Muchas gracias por acercarte a nuestro stand del *Programa Prevenir* en Obra Social Provincia. 🏥✨\n\n` +
        `Queremos acompañarte en el cuidado de tu salud preventiva. Si deseás consultar los estudios incluidos con tu cobertura de Obra Social Provincia o coordinar tu turno para el chequeo, podés responder directamente a este mensaje.\n\n` +
        `¡Que tengas un excelente día! 💙`
    );

    // Enviar via Edge Function
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
            lineId: 'line_recepciones',
            number: lead.telefono_wa,
            content: messageText,
        },
    });

    if (error) {
        console.error('Error invocando send-whatsapp:', error);
        throw new Error(error.message || 'Error al enviar mensaje por WhatsApp');
    }

    // Guardar en la bandeja de mensajería (whatsapp_messages)
    await saveOutgoingMessage({
        phone: lead.telefono_wa,
        content: messageText,
        mediaType: 'text',
        lineId: 'line_recepciones',
    }).catch(err => console.warn('Error saving outgoing message in chat:', err));

    // Actualizar estado en la tabla del lead
    await updatePrevenirLead(lead.id, {
        mensaje_enviado: true,
        fecha_mensaje_enviado: new Date().toISOString(),
        estado: 'contactado',
    }).catch(console.error);

    return { success: true, data };
}
