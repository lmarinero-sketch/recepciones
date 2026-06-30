/**
 * Visitas/Chequeo Service
 * 
 * Estrategia optimizada en 2 pasos:
 * 1) Buscar pacientes con visita tipo CHQ (Chequeo Preventivo) en la fecha objetivo
 * 2) Traer TODO el historial de esos pacientes (todas sus visitas hasta hoy)
 */

import { supabase } from '../lib/supabase';

const PAGE_SIZE = 1000;

/**
 * Pagina una query de Supabase para superar el límite de 1000 filas.
 */
async function paginateQuery(buildQuery, onProgress = null) {
    let allData = [];
    let from = 0;
    let keepGoing = true;

    while (keepGoing) {
        const query = buildQuery(from, from + PAGE_SIZE - 1);
        const { data, error } = await query;
        if (error) {
            console.error('Error fetching page:', error);
            throw error;
        }

        const rows = data || [];
        allData = allData.concat(rows);
        from += PAGE_SIZE;

        if (onProgress) {
            onProgress(Math.ceil(from / PAGE_SIZE), allData.length);
        }

        if (rows.length < PAGE_SIZE) {
            keepGoing = false;
        }
    }

    return allData;
}

/**
 * PASO 1: Busca DNIs de pacientes con visitas tipo CHQ en la fecha dada.
 * @param {string} fecha - Fecha en formato YYYY-MM-DD
 * @param {boolean} isMensual - Si es true, busca por el mes (YYYY-MM)
 * @param {string} obraSocial - Filtro opcional por obra social
 * @returns {Promise<string[]>} - Lista de DNIs únicos
 */
async function fetchChequeosDNIs(fecha, isMensual, obraSocial) {
    const data = await paginateQuery((from, to) => {
        let query = supabase
            .from('recepciones_visitas')
            .select('dni, paciente')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .range(from, to);

        if (isMensual) {
            const yearMonth = fecha.substring(0, 7); // YYYY-MM
            const firstDay = `${yearMonth}-01`;
            const d = new Date(firstDay + 'T00:00:00');
            d.setMonth(d.getMonth() + 1);
            const nextMonthFirstDay = d.toISOString().split('T')[0];

            query = query.gte('fecha', firstDay).lt('fecha', nextMonthFirstDay);
        } else {
            query = query.eq('fecha', fecha);
        }

        if (obraSocial) {
            query = query.ilike('obra_social', `%${obraSocial}%`);
        }

        return query;
    });

    // Extraer DNIs únicos (usando paciente como fallback)
    const seen = new Set();
    const results = [];
    for (const row of data) {
        const key = row.dni || row.paciente;
        if (key && !seen.has(key)) {
            seen.add(key);
            results.push({ dni: row.dni, paciente: row.paciente });
        }
    }
    return results;
}

/**
 * PASO 2: Trae TODAS las visitas de una lista de DNIs.
 * @param {string[]} dnis - Lista de DNIs a buscar
 * @param {Function} onProgress - Callback de progreso
 * @returns {Promise<Array>} - Todas las visitas de esos pacientes
 */
async function fetchVisitasByDNIs(dnis, onProgress = null) {
    if (!dnis.length) return [];

    // Supabase .in() soporta hasta ~300 items, fragmentamos si es necesario
    const CHUNK_SIZE = 200;
    let allData = [];
    let pageCount = 0;

    for (let i = 0; i < dnis.length; i += CHUNK_SIZE) {
        const chunk = dnis.slice(i, i + CHUNK_SIZE);
        const chunkData = await paginateQuery((from, to) =>
            supabase
                .from('recepciones_visitas')
                .select('*')
                .in('dni', chunk)
                .order('fecha', { ascending: false })
                .range(from, to),
            (pages, rows) => {
                pageCount++;
                if (onProgress) onProgress(pageCount, allData.length + rows);
            }
        );
        allData = allData.concat(chunkData);
    }

    return allData;
}

/**
 * Agrupa visitas por paciente (DNI).
 */
function agruparPorPaciente(data) {
    const map = {};
    data.forEach(v => {
        const key = v.dni || v.paciente || 'SIN_DATO';
        if (!map[key]) {
            map[key] = {
                dni: v.dni,
                paciente: v.paciente,
                telefono1: v.telefono1,
                telefono2: v.telefono2,
                obra_social: v.obra_social,
                direccion: v.direccion,
                departamento: v.departamento,
                ultima_visita: v.fecha,
                visitas: [],
            };
        }
        if (!map[key].telefono1 && v.telefono1) {
            map[key].telefono1 = v.telefono1;
        }
        if (!map[key].telefono2 && v.telefono2) {
            map[key].telefono2 = v.telefono2;
        }

        map[key].visitas.push({
            id: v.id,
            fecha: v.fecha,
            hora: v.hora,
            tipo_agenda: v.tipo_agenda,
            tipo_visita: v.tipo_visita,
            especialidad: v.especialidad,
            medico: v.medico,
            asistencia: v.asistencia,
            motivo: v.motivo,
            centro: v.centro,
            nhc: v.nhc,
            comentarios: v.comentarios,
        });
    });

    return Object.values(map).map(p => ({
        ...p,
        total_visitas: p.visitas.length,
        // Marcar la fecha del chequeo que los trajo a esta lista
        fecha_chequeo: p.visitas.find(v =>
            v.tipo_visita && v.tipo_visita.toUpperCase().includes('CHQ')
        )?.fecha || p.ultima_visita,
    }));
}

/**
 * Flujo principal: Obtiene pacientes con CHQ en la fecha indicada,
 * luego trae todo su historial.
 * 
 * @param {Object} options - { targetDate, search, isMensual, obraSocial }
 * @param {Function} onProgress - Callback (pages, rows) para UI
 * @returns {Promise<Array>} - Pacientes agrupados con todas sus visitas
 */
export async function fetchPacientesChequeo(options = {}, onProgress = null) {
    const { targetDate, search, isMensual, obraSocial } = options;

    if (!targetDate) {
        return [];
    }

    // PASO 1: Encontrar DNIs con CHQ en la fecha objetivo
    if (onProgress) onProgress(0, 0, 'Buscando chequeos preventivos...');
    const chequeoPatients = await fetchChequeosDNIs(targetDate, isMensual, obraSocial);

    if (!chequeoPatients.length) {
        return [];
    }

    const dnis = chequeoPatients.map(p => p.dni).filter(Boolean);

    // PASO 2: Traer TODAS las visitas de esos pacientes
    if (onProgress) onProgress(0, 0, `Cargando historial de ${dnis.length} pacientes...`);
    const allVisitas = await fetchVisitasByDNIs(dnis, (pages, rows) => {
        if (onProgress) onProgress(pages, rows, `Historial: ${rows.toLocaleString()} visitas...`);
    });

    // Agrupar
    let pacientes = agruparPorPaciente(allVisitas);

    // Filtro de búsqueda de texto libre
    if (search) {
        const s = search.toLowerCase();
        pacientes = pacientes.filter(p =>
            (p.paciente && p.paciente.toLowerCase().includes(s)) ||
            (p.dni && p.dni.includes(s)) ||
            (p.telefono1 && p.telefono1.includes(s))
        );
    }

    // Ordenar por total de visitas descendente
    pacientes.sort((a, b) => b.total_visitas - a.total_visitas);

    return pacientes;
}

export async function fetchEspecialidades() {
    // Intentar traer los datos más recientes para no descargar millones de registros
    const { data } = await supabase
        .from('recepciones_visitas')
        .select('especialidad')
        .not('especialidad', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10000);
    
    if (data) {
        const unique = [...new Set(data.map(d => d.especialidad).filter(Boolean))];
        return unique.sort();
    }
    return [];
}

export async function fetchObrasSociales() {
    // Evitamos descargar toda la base usando limit.
    // Lo ideal en el futuro es crear una RPC en Supabase: supabase.rpc('get_obras_sociales')
    const { data } = await supabase
        .from('recepciones_visitas')
        .select('obra_social')
        .not('obra_social', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20000); // Traemos los últimos 20k registros para sacar obras sociales recientes
        
    if (data) {
        const unique = [...new Set(data.map(d => d.obra_social).filter(Boolean))];
        return unique.sort();
    }
    return [];
}

export async function fetchCentros() {
    const { data } = await supabase
        .from('recepciones_visitas')
        .select('centro')
        .not('centro', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10000);
        
    if (data) {
        const unique = [...new Set(data.map(d => d.centro).filter(Boolean))];
        return unique.sort();
    }
    return [];
}

/**
 * Actualiza la asistencia de una visita
 */
export async function updateAsistencia(id, asistencia) {
    const { error } = await supabase
        .from('recepciones_visitas')
        .update({ asistencia })
        .eq('id', id);

    if (error) {
        console.error('Error actualizando asistencia:', error);
        throw error;
    }
    return true;
}

/**
 * Fetch all CHQ visits for metrics aggregation (minimal fields).
 * Returns raw records for client-side aggregation.
 */
export async function fetchChequeoMetrics(onProgress = null) {
    if (onProgress) onProgress('Cargando datos de chequeos...');

    const data = await paginateQuery((from, to) => {
        return supabase
            .from('recepciones_visitas')
            .select('fecha, dni, obra_social, centro, asistencia')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .not('fecha', 'is', null)
            .range(from, to);
    }, (pages, rows) => {
        if (onProgress) onProgress(`Cargando... ${rows.toLocaleString()} registros`);
    });

    return data;
}

/**
 * Fetch candidates for marketing outreach.
 * Returns patients grouped by DNI with their last CHQ date and months since.
 */
export async function fetchMarketingCandidates(onProgress = null) {
    if (onProgress) onProgress('Analizando pacientes...');

    const data = await paginateQuery((from, to) => {
        return supabase
            .from('recepciones_visitas')
            .select('fecha, dni, paciente, telefono1, telefono2, obra_social, departamento, centro')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .not('fecha', 'is', null)
            .not('dni', 'is', null)
            .range(from, to);
    }, (pages, rows) => {
        if (onProgress) onProgress(`Cargando... ${rows.toLocaleString()} registros`);
    });

    // Group by DNI, find last CHQ date
    const byDNI = {};
    data.forEach(v => {
        if (!v.dni) return;
        if (!byDNI[v.dni]) {
            byDNI[v.dni] = {
                dni: v.dni,
                paciente: v.paciente,
                telefono1: v.telefono1,
                telefono2: v.telefono2,
                obra_social: v.obra_social,
                departamento: v.departamento,
                centro: v.centro,
                ultima_chq: v.fecha,
                total_chq: 0,
            };
        }
        byDNI[v.dni].total_chq++;
        if (!byDNI[v.dni].telefono1 && v.telefono1) {
            byDNI[v.dni].telefono1 = v.telefono1;
        }
        if (v.fecha > byDNI[v.dni].ultima_chq) {
            byDNI[v.dni].ultima_chq = v.fecha;
        }
    });

    const now = new Date();
    const candidates = Object.values(byDNI).map(p => {
        const lastDate = new Date(p.ultima_chq + 'T00:00:00');
        const monthsSince = (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
        return { ...p, meses_desde_ultima: monthsSince };
    });

    candidates.sort((a, b) => b.meses_desde_ultima - a.meses_desde_ultima);
    return candidates;
}

/**
 * Fetch patients with CHQ visits where asistencia = 'presente'.
 * Used by the Encuestas de Calidad panel for post-checkup survey sending.
 * 
 * @param {Object} options - { fechaDesde, fechaHasta, obraSocial }
 * @param {Function} onProgress - Callback (pages, rows, msg)
 * @returns {Promise<Array>} - Patients grouped by DNI with visit details
 */
export async function fetchPacientesConAsistencia(options = {}, onProgress = null) {
    const { fechaDesde, fechaHasta, obraSocial } = options;

    if (!fechaDesde || !fechaHasta) return [];

    if (onProgress) onProgress(0, 0, 'Buscando pacientes con asistencia presente...');

    // Query: CHQ visits with asistencia = 'presente' in date range
    const data = await paginateQuery((from, to) => {
        let query = supabase
            .from('recepciones_visitas')
            .select('*')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .eq('asistencia', 'presente')
            .gte('fecha', fechaDesde)
            .lte('fecha', fechaHasta)
            .order('fecha', { ascending: false })
            .range(from, to);

        if (obraSocial) {
            query = query.ilike('obra_social', `%${obraSocial}%`);
        }

        return query;
    }, (pages, rows) => {
        if (onProgress) onProgress(pages, rows, `Cargando... ${rows.toLocaleString()} registros`);
    });

    if (!data.length) return [];

    // Group by DNI
    const map = {};
    data.forEach(v => {
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
                visitas_presente: [],
            };
        }
        if (!map[key].telefono1 && v.telefono1) {
            map[key].telefono1 = v.telefono1;
        }
        // Keep the most recent visit date
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
        });
    });

    const pacientes = Object.values(map).map(p => ({
        ...p,
        total_visitas_presente: p.visitas_presente.length,
    }));

    // Sort by most recent visit first
    pacientes.sort((a, b) => (b.fecha_visita || '').localeCompare(a.fecha_visita || ''));

    return pacientes;
}

/**
 * Fetch list of phones that have already received the satisfaction survey.
 */
export async function fetchEncuestasPreventivos() {
    const { data } = await supabase
        .from('encuestas_preventivos')
        .select('telefono, estado');
    return data || [];
}

/**
 * Inserta un nuevo registro de encuesta en estado INVITADO.
 */
export async function crearEncuestaPreventivo(telefono) {
    const { data, error } = await supabase
        .from('encuestas_preventivos')
        .insert({
            telefono,
            estado: 'INVITADO'
        });
    if (error) {
        console.error('Error creando encuesta:', error);
        throw error;
    }
    return data;
}

/**
 * Fetch all survey responses mapped with detailed metrics
 */
export async function fetchDetalleEncuestas() {
    const { data } = await supabase
        .from('encuestas_preventivos')
        .select('*')
        .order('created_at', { ascending: false });
    return data || [];
}

