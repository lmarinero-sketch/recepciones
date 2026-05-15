/**
 * Recordatorios Service
 * 
 * Consume la tabla `recepciones_visitas` alimentada por el sync server.
 * Muestra turnos agendados (CHQ/ECO) para hoy, futuros y pasados recientes.
 * 
 * DIFERENCIA con visitasService.js:
 * - visitasService.js → tabla `visitas_chequeo` → Marketing (pacientes de hace 1 año)
 * - recordatoriosService.js → tabla `recepciones_visitas` → Recordatorios (turnos próximos)
 */

import { supabase } from '../lib/supabase';

const PAGE_SIZE = 1000;

// NOTA: La tabla recepciones_visitas ya contiene SOLO turnos CHQ/ECO
// porque el sync-server filtra por tipo_visita en la query SQL.
// No necesitamos re-filtrar en el frontend.

/**
 * Paginación genérica para superar el límite de 1000 filas.
 */
async function paginateQuery(buildQuery) {
    let allData = [];
    let from = 0;

    while (true) {
        const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data || [];
        allData = allData.concat(rows);
        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return allData;
}

/**
 * Obtiene todos los turnos de chequeos para un rango de fechas.
 * @param {Object} options
 * @param {string} options.fechaDesde - YYYY-MM-DD
 * @param {string} options.fechaHasta - YYYY-MM-DD (inclusive)
 * @param {string} [options.search] - Búsqueda libre
 * @param {string} [options.centro] - Filtro por centro
 * @param {string} [options.obraSocial] - Filtro por obra social
 * @param {string} [options.asistencia] - Filtro por asistencia
 */
export async function fetchRecordatorios(options = {}) {
    const { fechaDesde, fechaHasta, search, centro, obraSocial, asistencia } = options;

    if (!fechaDesde || !fechaHasta) return [];

    const data = await paginateQuery((from, to) => {
        let query = supabase
            .from('recepciones_visitas')
            .select('*')
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
            .order('fecha', { ascending: true })
            .order('hora', { ascending: true })
            .range(from, to);

        if (centro) query = query.ilike('centro', `%${centro}%`);
        if (obraSocial) query = query.ilike('obra_social', `%${obraSocial}%`);
        if (asistencia) query = query.eq('asistencia', asistencia);

        return query;
    });

    // Filtro de búsqueda local
    if (search) {
        const s = search.toLowerCase();
        return data.filter(r =>
            (r.paciente && r.paciente.toLowerCase().includes(s)) ||
            (r.dni && r.dni.includes(s)) ||
            (r.telefono1 && r.telefono1.includes(s)) ||
            (r.medico && r.medico.toLowerCase().includes(s))
        );
    }

    return data;
}

/**
 * Obtiene stats rápidos para el dashboard.
 */
export async function fetchRecordatoriosStats() {
    const hoy = new Date().toISOString().split('T')[0];

    // Turnos de hoy
    const { count: turnosHoy } = await supabase
        .from('recepciones_visitas')
        .select('id', { count: 'exact', head: true })
        .eq('fecha', hoy);

    // Turnos futuros (desde mañana)
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const mananaStr = manana.toISOString().split('T')[0];

    const { count: turnosFuturos } = await supabase
        .from('recepciones_visitas')
        .select('id', { count: 'exact', head: true })
        .gte('fecha', mananaStr);

    // Ausentes de ayer
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().split('T')[0];

    const { count: ausentesAyer } = await supabase
        .from('recepciones_visitas')
        .select('id', { count: 'exact', head: true })
        .eq('fecha', ayerStr)
        .eq('asistencia', 'Ausente');

    return {
        turnosHoy: turnosHoy || 0,
        turnosFuturos: turnosFuturos || 0,
        ausentesAyer: ausentesAyer || 0,
    };
}

/**
 * Obtiene los centros disponibles en recepciones_visitas
 */
export async function fetchRecordatoriosCentros() {
    const { data } = await supabase
        .from('recepciones_visitas')
        .select('centro')
        .not('centro', 'is', null)
        .limit(5000);

    if (data) {
        return [...new Set(data.map(d => d.centro).filter(Boolean))].sort();
    }
    return [];
}

/**
 * Obtiene las obras sociales disponibles en recepciones_visitas
 */
export async function fetchRecordatoriosObrasSociales() {
    const { data } = await supabase
        .from('recepciones_visitas')
        .select('obra_social')
        .not('obra_social', 'is', null)
        .limit(10000);

    if (data) {
        return [...new Set(data.map(d => d.obra_social).filter(Boolean))].sort();
    }
    return [];
}

/**
 * Obtiene TODOS los datos de recepciones_visitas para métricas.
 * Aplica regla de negocio: si asistencia es null y fecha < hoy → Ausente.
 */
export async function fetchRecordatoriosMetrics(onProgress) {
    onProgress?.('Descargando turnos de chequeos...');

    const data = await paginateQuery((from, to) =>
        supabase
            .from('recepciones_visitas')
            .select('*')
            .order('fecha', { ascending: true })
            .range(from, to)
    );

    onProgress?.(`Procesando ${data.length} registros...`);

    const hoy = new Date().toISOString().split('T')[0];

    // Aplicar regla: null + pasado = Ausente
    const processed = data.map(row => ({
        ...row,
        asistencia_efectiva: row.asistencia
            ? row.asistencia
            : (row.fecha && row.fecha < hoy ? 'Ausente' : null),
    }));

    return processed;
}
