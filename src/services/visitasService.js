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
            .from('visitas_chequeo')
            .select('dni, paciente')
            .ilike('tipo_visita', '%CHQ%')
            .range(from, to);

        if (isMensual) {
            query = query.like('fecha', `${fecha.substring(0, 7)}%`);
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
                .from('visitas_chequeo')
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
                telefono1: v.telefono1_paciente,
                telefono2: v.telefono2_paciente,
                obra_social: v.obra_social,
                direccion: v.direccion_paciente,
                departamento: v.departamento,
                ultima_visita: v.fecha,
                visitas: [],
            };
        }
        if (!map[key].telefono1 && v.telefono1_paciente) {
            map[key].telefono1 = v.telefono1_paciente;
        }
        if (!map[key].telefono2 && v.telefono2_paciente) {
            map[key].telefono2 = v.telefono2_paciente;
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

/**
 * Obtiene valores únicos de especialidad (lazy, paginado)
 */
export async function fetchEspecialidades() {
    const all = await paginateQuery((from, to) =>
        supabase
            .from('visitas_chequeo')
            .select('especialidad')
            .not('especialidad', 'is', null)
            .range(from, to)
    );
    const unique = [...new Set(all.map(d => d.especialidad).filter(Boolean))];
    return unique.sort();
}

/**
 * Obtiene valores únicos de obra social (lazy, paginado)
 */
export async function fetchObrasSociales() {
    const all = await paginateQuery((from, to) =>
        supabase
            .from('visitas_chequeo')
            .select('obra_social')
            .not('obra_social', 'is', null)
            .range(from, to)
    );
    const unique = [...new Set(all.map(d => d.obra_social).filter(Boolean))];
    return unique.sort();
}

/**
 * Obtiene valores únicos de centro (lazy, paginado)
 */
export async function fetchCentros() {
    const all = await paginateQuery((from, to) =>
        supabase
            .from('visitas_chequeo')
            .select('centro')
            .not('centro', 'is', null)
            .range(from, to)
    );
    const unique = [...new Set(all.map(d => d.centro).filter(Boolean))];
    return unique.sort();
}

/**
 * Actualiza la asistencia de una visita
 */
export async function updateAsistencia(id, asistencia) {
    const { error } = await supabase
        .from('visitas_chequeo')
        .update({ asistencia })
        .eq('id', id);

    if (error) {
        console.error('Error actualizando asistencia:', error);
        throw error;
    }
    return true;
}
