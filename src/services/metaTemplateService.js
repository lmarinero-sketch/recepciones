/**
 * Meta WhatsApp Template Service
 * Obtiene y envía plantillas oficiales de WhatsApp Business API via BuilderBot Cloud
 * Estas plantillas son las aprobadas por Meta y tienen costo por envío
 */

import { supabase } from '../lib/supabase';

// Cache local
let cachedTemplates = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

/**
 * Obtiene las credenciales de line_recepciones desde whatsapp_lines
 */
async function getRecepcionesCredentials() {
    const { data, error } = await supabase
        .from('whatsapp_lines')
        .select('api_key, project_id')
        .eq('id', 'line_recepciones')
        .single();

    if (error || !data) {
        console.error('Error fetching line_recepciones credentials:', error);
        throw new Error('No se pudieron obtener las credenciales de Recepciones');
    }
    return { apiKey: data.api_key, projectId: data.project_id };
}

/**
 * Lista las plantillas aprobadas de WhatsApp Meta API
 * Endpoint: GET /api/v2/{projectId}/whatsapp-template?limit=50
 * @returns {Promise<Array>} — Lista de plantillas aprobadas
 */
export async function fetchMetaTemplates(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedTemplates && (now - cacheTimestamp) < CACHE_TTL) {
        return cachedTemplates;
    }

    try {
        const { apiKey, projectId } = await getRecepcionesCredentials();

        const response = await fetch(
            `https://app.builderbot.cloud/api/v2/${projectId}/whatsapp-template?limit=50`,
            {
                method: 'GET',
                headers: {
                    'x-api-builderbot': apiKey,
                },
            }
        );

        if (!response.ok) {
            console.error(`Meta Templates API error: ${response.status}`);
            return cachedTemplates || [];
        }

        const data = await response.json();
        // La API puede devolver { templates: [...] } o directamente un array
        const templates = Array.isArray(data) ? data : (data.templates || data.data || []);

        cachedTemplates = templates;
        cacheTimestamp = now;
        return templates;
    } catch (err) {
        console.error('Error fetching Meta templates:', err);
        return cachedTemplates || [];
    }
}

/**
 * Envía un mensaje de plantilla oficial de WhatsApp Meta API
 * Endpoint: POST /api/v2/{projectId}/whatsapp-template
 * @param {Object} params
 * @param {string} params.to — Número destino en formato internacional sin +
 * @param {string} params.templateName — Nombre de la plantilla aprobada
 * @param {string} params.languageCode — Código de idioma (ej: 'es', 'en', 'pt_BR')
 * @param {Array} [params.components] — Componentes con parámetros variables (opcional)
 * @returns {Promise<Object>} — Respuesta de la API
 */
export async function sendMetaTemplate({ to, templateName, languageCode = 'es', components = [] }) {
    try {
        const { apiKey, projectId } = await getRecepcionesCredentials();

        const body = {
            to,
            templateName,
            languageCode,
        };

        // Solo agregar components si hay parámetros
        if (components.length > 0) {
            body.components = components;
        }

        const response = await fetch(
            `https://app.builderbot.cloud/api/v2/${projectId}/whatsapp-template`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-builderbot': apiKey,
                },
                body: JSON.stringify(body),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || `Error ${response.status}`);
        }

        return data;
    } catch (err) {
        console.error('Error sending Meta template:', err);
        throw err;
    }
}

/**
 * Invalida el cache de templates
 */
export function invalidateMetaTemplateCache() {
    cachedTemplates = null;
    cacheTimestamp = 0;
}
