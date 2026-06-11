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
// El filtro local es un safety-net por si quedaron datos legacy.

/** Filtra por tipo_agenda si se especifica un filtro */
function filtrarPorTipoAgenda(rows, tipoAgendaFilter) {
    // Si no hay filtro o es 'todos', devolver todo (la tabla ya está pre-filtrada por el sync)
    if (!tipoAgendaFilter || tipoAgendaFilter === 'todos') return rows;
    return rows.filter(r => {
        if (!r.tipo_agenda) return false;
        return r.tipo_agenda.toUpperCase().trim() === tipoAgendaFilter.toUpperCase();
    });
}

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
 * @param {string} [options.tipoAgenda] - Filtro por tipo agenda (CHQ, ECO, todos)
 */
export async function fetchRecordatorios(options = {}) {
    const { fechaDesde, fechaHasta, search, centro, obraSocial, asistencia, tipoAgenda } = options;

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

    // Filtro por tipo_agenda (CHQ/ECO)
    let filtered = filtrarPorTipoAgenda(data, tipoAgenda);
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(r =>
            (r.paciente && r.paciente.toLowerCase().includes(s)) ||
            (r.dni && r.dni.includes(s)) ||
            (r.telefono1 && r.telefono1.includes(s)) ||
            (r.medico && r.medico.toLowerCase().includes(s))
        );
    }

    return filtered;
}

/**
 * Obtiene stats rápidos para el dashboard.
 */
export async function fetchRecordatoriosStats() {
    const hoy = new Date().toISOString().split('T')[0];
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const mananaStr = manana.toISOString().split('T')[0];
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const ayerStr = ayer.toISOString().split('T')[0];

    // Traer todos los datos recientes para filtrar por tipo_visita localmente
    const allData = await paginateQuery((from, to) =>
        supabase
            .from('recepciones_visitas')
            .select('fecha, asistencia, tipo_visita')
            .gte('fecha', ayerStr)
            .range(from, to)
    );

    const chq = filtrarPorTipoAgenda(allData);

    const turnosHoy = chq.filter(r => r.fecha === hoy).length;
    const turnosFuturos = chq.filter(r => r.fecha >= mananaStr).length;
    const ausentesAyer = chq.filter(r => r.fecha === ayerStr && r.asistencia === 'Ausente').length;

    return { turnosHoy, turnosFuturos, ausentesAyer };
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
 * Obtiene los tipos de agenda distintos en recepciones_visitas
 */
export async function fetchTiposAgenda() {
    const { data } = await supabase
        .from('recepciones_visitas')
        .select('tipo_agenda')
        .not('tipo_agenda', 'is', null)
        .limit(5000);

    if (data) {
        return [...new Set(data.map(d => d.tipo_agenda).filter(Boolean))].sort();
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

    const chqData = filtrarPorTipoAgenda(data);
    onProgress?.(`Procesando ${chqData.length} chequeos de ${data.length} registros...`);

    const hoy = new Date().toISOString().split('T')[0];

    const processed = chqData.map(row => ({
        ...row,
        asistencia_efectiva: row.asistencia
            ? row.asistencia
            : (row.fecha && row.fecha < hoy ? 'Ausente' : null),
    }));

    return processed;
}

/**
 * Obtiene pacientes con asistencia 'Presente' para envío de encuestas de calidad.
 * Agrupa por DNI y devuelve la visita más reciente de cada paciente.
 * 
 * @param {Object} options - { fechaDesde, fechaHasta, obraSocial, tipoAgenda }
 * @param {Function} onProgress - Callback (pages, rows, msg)
 * @returns {Promise<Array>} - Pacientes agrupados con datos de contacto
 */
export async function fetchPacientesPresentes(options = {}, onProgress = null) {
    const { fechaDesde, fechaHasta, obraSocial, tipoAgenda } = options;

    if (!fechaDesde || !fechaHasta) return [];

    if (onProgress) onProgress(0, 0, 'Buscando pacientes con asistencia presente...');

    const data = await paginateQuery((from, to) => {
        let query = supabase
            .from('recepciones_visitas')
            .select('*')
            .eq('asistencia', 'Presente')
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
            .order('fecha', { ascending: false })
            .range(from, to);

        if (obraSocial) query = query.ilike('obra_social', `%${obraSocial}%`);

        return query;
    });

    if (!data.length) return [];

    // Filtrar por tipo_agenda si se especifica
    let filtered = filtrarPorTipoAgenda(data, tipoAgenda);

    if (onProgress) onProgress(1, filtered.length, `${filtered.length} registros encontrados`);

    // Agrupar por DNI (o paciente si no hay DNI)
    const map = {};
    for (const v of filtered) {
        const key = v.dni || v.paciente || 'SIN_DATO';
        if (!map[key]) {
            map[key] = {
                dni: v.dni,
                paciente: v.paciente,
                telefono1: v.telefono1,
                telefono2: v.telefono2,
                obra_social: v.obra_social,
                departamento: v.departamento,
                centro: v.centro,
                fecha_visita: v.fecha,
                hora_visita: v.hora,
                medico: v.medico,
                especialidad: v.especialidad,
                tipo_visita: v.tipo_visita,
                tipo_agenda: v.tipo_agenda,
                visitas_presente: [],
            };
        }
        if (!map[key].telefono1 && v.telefono1) {
            map[key].telefono1 = v.telefono1;
        }
        // Keep most recent visit
        if (v.fecha > map[key].fecha_visita) {
            map[key].fecha_visita = v.fecha;
            map[key].hora_visita = v.hora;
            map[key].medico = v.medico;
        }
        map[key].visitas_presente.push({
            id: v.id,
            fecha: v.fecha,
            hora: v.hora,
            medico: v.medico,
            especialidad: v.especialidad,
            centro: v.centro,
            tipo_visita: v.tipo_visita,
        });
    }

    const pacientes = Object.values(map).map(p => ({
        ...p,
        total_visitas_presente: p.visitas_presente.length,
    }));

    // Sort by most recent visit first
    pacientes.sort((a, b) => (b.fecha_visita || '').localeCompare(a.fecha_visita || ''));

    return pacientes;
}

