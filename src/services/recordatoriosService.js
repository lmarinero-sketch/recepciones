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
    const filter = tipoAgendaFilter.toUpperCase().trim();
    if (filter === 'CHEQUEO' || filter === 'CHQ') {
        return rows.filter(r => {
            const ta = (r.tipo_agenda || '').toUpperCase();
            const tv = (r.tipo_visita || '').toUpperCase();
            return ta.includes('CHQ') || ta.includes('CHEQUEO') || tv.includes('CHQ') || tv.includes('CHEQUEO');
        });
    }
    return rows.filter(r => {
        if (!r.tipo_agenda) return false;
        return r.tipo_agenda.toUpperCase().trim() === filter;
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

function calcAgeFromBirthDate(bdStr) {
    if (!bdStr) return null;
    let d, m, y;
    if (typeof bdStr === 'string') {
        if (bdStr.includes('/')) {
            const parts = bdStr.split('/');
            if (parts.length === 3) {
                d = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10) - 1;
                y = parseInt(parts[2], 10);
            }
        } else if (bdStr.includes('-')) {
            const parts = bdStr.split('-');
            if (parts.length === 3) {
                y = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10) - 1;
                d = parseInt(parts[2], 10);
            }
        }
    } else if (bdStr instanceof Date) {
        y = bdStr.getFullYear();
        m = bdStr.getMonth();
        d = bdStr.getDate();
    }
    if (!y || isNaN(y) || isNaN(m) || isNaN(d)) return null;
    const today = new Date();
    let age = today.getFullYear() - y;
    const monthDiff = today.getMonth() - m;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--;
    return (age >= 0 && age <= 120) ? age : null;
}

async function persistEdadesInBackground(toPersist) {
    try {
        const idsByAge = new Map();
        for (const item of toPersist) {
            if (!idsByAge.has(item.edad)) idsByAge.set(item.edad, []);
            idsByAge.get(item.edad).push(item.id);
        }
        for (const [age, ids] of idsByAge.entries()) {
            const CHUNK = 200;
            for (let i = 0; i < ids.length; i += CHUNK) {
                const chunk = ids.slice(i, i + CHUNK);
                await supabase.from('recepciones_visitas').update({ edad: age }).in('id', chunk);
            }
        }
    } catch (e) {
        console.warn('Persistencia en background de edades (no crítico):', e);
    }
}

/**
 * Obtiene TODOS los datos de recepciones_visitas para métricas.
 * Aplica regla de negocio: si asistencia es null y fecha < hoy → Ausente.
 * Si faltan edades en los turnos, las resuelve automáticamente contra hospital_pacientes.
 */
export async function fetchRecordatoriosMetrics(onProgress) {
    onProgress?.('Descargando turnos de chequeos...');

    const data = await paginateQuery((from, to) =>
        supabase
            .from('recepciones_visitas')
            .select('*')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .order('fecha', { ascending: true })
            .range(from, to)
    );

    // Enriquecimiento de edades faltantes
    const missingDnis = [...new Set(
        data.filter(r => (r.edad === null || r.edad === undefined || r.edad === '') && r.dni)
            .map(r => r.dni.toString().trim())
    )];

    if (missingDnis.length > 0) {
        onProgress?.(`Enriqueciendo edades (${missingDnis.length} pacientes)...`);
        const ageByDni = new Map();
        const CHUNK = 150;
        for (let i = 0; i < missingDnis.length; i += CHUNK) {
            const chunk = missingDnis.slice(i, i + CHUNK);
            const { data: pacs } = await supabase
                .from('hospital_pacientes')
                .select('dni, edad, fecha_nacimiento')
                .in('dni', chunk);

            pacs?.forEach(p => {
                if (p.dni) {
                    const cd = p.dni.toString().trim();
                    let age = null;
                    if (p.edad !== null && p.edad !== undefined && p.edad !== '') {
                        const num = parseInt(p.edad, 10);
                        if (!isNaN(num) && num >= 0 && num <= 120) age = num;
                    }
                    if (age === null && p.fecha_nacimiento) {
                        age = calcAgeFromBirthDate(p.fecha_nacimiento);
                    }
                    if (age !== null) ageByDni.set(cd, age);
                }
            });
        }

        const toPersist = [];
        data.forEach(row => {
            if ((row.edad === null || row.edad === undefined || row.edad === '') && row.dni) {
                const cd = row.dni.toString().trim();
                if (ageByDni.has(cd)) {
                    const resolvedAge = ageByDni.get(cd);
                    row.edad = resolvedAge;
                    if (row.id) toPersist.push({ id: row.id, edad: resolvedAge });
                }
            }
        });

        if (toPersist.length > 0) {
            persistEdadesInBackground(toPersist);
        }
    }

    onProgress?.(`Procesando ${data.length} chequeos...`);

    const hoy = new Date().toISOString().split('T')[0];

    const processed = data.map(row => ({
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

