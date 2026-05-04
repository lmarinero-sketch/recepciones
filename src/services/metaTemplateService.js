/**
 * Meta WhatsApp Template Service
 * Obtiene y envía plantillas oficiales de WhatsApp Business API via BuilderBot Cloud
 * Usa Supabase Edge Function como proxy para evitar CORS del navegador
 * 
 * ARQUITECTURA:
 * Browser → Supabase Edge Function (send-whatsapp) → BuilderBot Cloud API
 * O: Browser → supabase.rpc('fetch_meta_templates') → pg_net → BuilderBot API
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
 * Usa la Edge Function send-whatsapp como proxy para evitar CORS
 * @returns {Promise<Array>} — Lista de plantillas aprobadas
 */
export async function fetchMetaTemplates(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedTemplates && (now - cacheTimestamp) < CACHE_TTL) {
        return cachedTemplates;
    }

    try {
        const { apiKey, projectId } = await getRecepcionesCredentials();

        // Usar la Edge Function como proxy server-side para evitar CORS
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                action: 'list_templates',
                lineId: 'line_recepciones',
            },
        });

        if (error) {
            console.error('Edge Function error:', error);
            // Fallback: intentar fetch directo (funciona si no hay CORS o en dev)
            return await fetchMetaTemplatesDirect(apiKey, projectId);
        }

        const templates = data?.templates || data?.data || [];
        cachedTemplates = templates;
        cacheTimestamp = now;
        return templates;
    } catch (err) {
        console.error('Error fetching Meta templates:', err);
        // Fallback: intentar fetch directo
        try {
            const { apiKey, projectId } = await getRecepcionesCredentials();
            return await fetchMetaTemplatesDirect(apiKey, projectId);
        } catch (e) {
            return cachedTemplates || [];
        }
    }
}

/**
 * Fetch directo a BuilderBot API (funciona server-side o si CORS está habilitado)
 */
async function fetchMetaTemplatesDirect(apiKey, projectId) {
    const response = await fetch(
        `https://app.builderbot.cloud/api/v2/${projectId}/whatsapp-template?limit=50`,
        {
            method: 'GET',
            headers: { 'x-api-builderbot': apiKey },
        }
    );

    if (!response.ok) {
        console.error(`Meta Templates API error: ${response.status}`);
        return cachedTemplates || [];
    }

    const result = await response.json();
    const templates = result?.data || (Array.isArray(result) ? result : []);
    cachedTemplates = templates;
    cacheTimestamp = Date.now();
    return templates;
}

/**
 * Envía un mensaje de plantilla oficial de WhatsApp Meta API
 * Usa la Edge Function send-whatsapp como proxy
 * @param {Object} params
 * @param {string} params.to — Número destino en formato internacional sin +
 * @param {string} params.templateName — Nombre de la plantilla aprobada
 * @param {string} params.languageCode — Código de idioma (ej: 'es', 'es_AR')
 * @param {Array} [params.components] — Componentes con parámetros variables
 * @returns {Promise<Object>} — Respuesta de la API
 */
export async function sendMetaTemplate({ to, templateName, languageCode = 'es', components = [] }) {
    try {
        // Intentar via Edge Function (proxy sin CORS)
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
            body: {
                action: 'send_template',
                lineId: 'line_recepciones',
                number: to,
                templateName,
                languageCode,
                components,
            },
        });

        if (error) {
            console.error('Edge Function error, trying direct:', error);
            // Fallback: llamada directa
            return await sendMetaTemplateDirect({ to, templateName, languageCode, components });
        }

        return data;
    } catch (err) {
        console.error('Error sending Meta template:', err);
        throw err;
    }
}

/**
 * Envío directo a BuilderBot API
 */
async function sendMetaTemplateDirect({ to, templateName, languageCode, components }) {
    const { apiKey, projectId } = await getRecepcionesCredentials();

    const body = { to, templateName, languageCode };
    if (components.length > 0) body.components = components;

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
    if (!response.ok) throw new Error(data.message || data.error || `Error ${response.status}`);
    return data;
}

/**
 * Invalida el cache de templates
 */
export function invalidateMetaTemplateCache() {
    cachedTemplates = null;
    cacheTimestamp = 0;
}
