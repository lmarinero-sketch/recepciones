/**
 * Servicio de Alquileres de Consultorios
 * 
 * Gestión de sedes, consultorios, médicos y asignaciones.
 * Cálculo automático de métricas, liquidación y novedades.
 */
import { supabase } from '../lib/supabase';

// =============================================
// SEDES
// =============================================

export async function fetchSedes() {
    const { data, error } = await supabase
        .from('alq_sedes')
        .select('*')
        .eq('activa', true)
        .order('orden');
    if (error) throw new Error(error.message);
    return data || [];
}

// =============================================
// CONSULTORIOS
// =============================================

export async function fetchConsultorios(sedeId = null) {
    let query = supabase
        .from('alq_consultorios')
        .select('*, sede:alq_sedes(id, nombre, codigo)')
        .order('orden');
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
}

// =============================================
// MÉDICOS
// =============================================

export async function fetchMedicos(filtro = {}) {
    let query = supabase
        .from('alq_medicos')
        .select('*')
        .order('nombre_display');
    
    if (filtro.estado) query = query.eq('estado', filtro.estado);
    if (filtro.search) query = query.ilike('nombre_display', `%${filtro.search}%`);
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
}

export async function createMedico({ nombre, apellido, nombre_display, matricula, especialidad }) {
    const { data, error } = await supabase
        .from('alq_medicos')
        .insert({ nombre, apellido, nombre_display, matricula, especialidad })
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

export async function updateMedico(id, updates) {
    const { data, error } = await supabase
        .from('alq_medicos')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

// =============================================
// NUEVOS PRESTADORES (INCORPORACIONES)
// =============================================

export async function fetchNuevosPrestadores() {
    const { data, error } = await supabase
        .from('nuevos_prestadores')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

// =============================================
// ASIGNACIONES
// =============================================

/**
 * Carga todas las asignaciones activas para una sede/periodo
 * Incluye datos del médico y consultorio para renderizar la grilla
 */
export async function fetchAsignaciones(periodo, sedeId = null) {
    let query = supabase
        .from('alq_asignaciones')
        .select(`
            *,
            medico:alq_medicos(id, nombre_display, matricula, especialidad, estado),
            consultorio:alq_consultorios(id, numero, sede_id, tipo, orden)
        `)
        .eq('periodo', periodo)
        .eq('estado', 'activo');
    
    if (sedeId) {
        query = query.eq('consultorio.sede_id', sedeId);
    }
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    // Filter out rows where consultorio is null (cross-sede filter)
    return (data || []).filter(a => a.consultorio !== null);
}

/**
 * Asigna un médico a un slot (consultorio + día + franja)
 */
export async function asignarMedico({ consultorioId, dia, franja, medicoId, periodo, esResidente = false, esRotativo = false, estadoColor = null }) {
    // Use upsert to allow replacing the doctor on an already-occupied slot
    const { data, error } = await supabase
        .from('alq_asignaciones')
        .upsert({
            medico_id: medicoId,
            consultorio_id: consultorioId,
            dia_semana: dia,
            franja,
            periodo,
            es_residente: esResidente,
            es_rotativo: esRotativo,
            estado_color: estadoColor,
            estado: 'activo',
            fecha_baja: null,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'consultorio_id,dia_semana,franja,periodo',
        })
        .select(`
            *,
            medico:alq_medicos(id, nombre_display, matricula, especialidad, estado),
            consultorio:alq_consultorios(id, numero, sede_id, tipo, orden)
        `)
        .single();
    if (error) {
        throw new Error(error.message);
    }
    return data;
}

/**
 * Actualiza el estado_color de un slot asignado
 */
export async function updateAsignacionEstadoColor(asignacionId, estadoColor) {
    const { data, error } = await supabase
        .from('alq_asignaciones')
        .update({ estado_color: estadoColor, updated_at: new Date().toISOString() })
        .eq('id', asignacionId)
        .select(`
            *,
            medico:alq_medicos(id, nombre_display, matricula, especialidad, estado),
            consultorio:alq_consultorios(id, numero, sede_id, tipo, orden)
        `)
        .single();
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Desasigna un médico (baja del slot)
 */
export async function desasignarMedico(asignacionId) {
    const { data, error } = await supabase
        .from('alq_asignaciones')
        .update({ estado: 'baja', fecha_baja: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
        .eq('id', asignacionId)
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Mueve un médico a un nuevo slot (delete viejo + insert nuevo)
 */
export async function moverMedico(asignacionId, { nuevoConsultorioId, nuevoDia, nuevaFranja, periodo }) {
    // Get current assignment
    const { data: current, error: fetchErr } = await supabase
        .from('alq_asignaciones')
        .select('*')
        .eq('id', asignacionId)
        .single();
    if (fetchErr) throw new Error(fetchErr.message);

    // Baja del slot anterior
    await desasignarMedico(asignacionId);

    // Alta en el nuevo slot
    return await asignarMedico({
        consultorioId: nuevoConsultorioId || current.consultorio_id,
        dia: nuevoDia || current.dia_semana,
        franja: nuevaFranja || current.franja,
        medicoId: current.medico_id,
        periodo: periodo || current.periodo,
        esResidente: current.es_residente,
        esRotativo: current.es_rotativo,
        estadoColor: current.estado_color,
    });
}

/**
 * Copia las asignaciones del mes anterior al mes destino.
 * Solo copia en slots que actualmente estén vacíos en el mes destino.
 */
export async function copiarMesAnterior(sedeId, periodoDestino) {
    // Calcular periodo anterior
    const [yearStr, monthStr] = periodoDestino.split('-');
    let y = parseInt(yearStr);
    let m = parseInt(monthStr);
    if (m === 1) {
        y -= 1;
        m = 12;
    } else {
        m -= 1;
    }
    const periodoAnterior = `${y}-${String(m).padStart(2, '0')}`;

    // Buscar asignaciones del mes anterior para esta sede
    const asignacionesAnteriores = await fetchAsignaciones(periodoAnterior, sedeId);
    if (asignacionesAnteriores.length === 0) {
        throw new Error('No hay datos en el mes anterior para copiar.');
    }

    // Buscar asignaciones actuales para no pisarlas
    const asignacionesActuales = await fetchAsignaciones(periodoDestino, sedeId);
    
    // Crear mapa de ocupación actual: consultorio_id -> dia -> franja -> true
    const ocupacionActual = {};
    for (const a of asignacionesActuales) {
        if (!a.consultorio_id) continue;
        if (!ocupacionActual[a.consultorio_id]) ocupacionActual[a.consultorio_id] = {};
        if (!ocupacionActual[a.consultorio_id][a.dia_semana]) ocupacionActual[a.consultorio_id][a.dia_semana] = {};
        ocupacionActual[a.consultorio_id][a.dia_semana][a.franja] = true;
    }

    // Filtrar las asignaciones anteriores que podemos insertar (slots libres)
    const asignacionesAInsertar = [];
    for (const a of asignacionesAnteriores) {
        if (!a.consultorio_id) continue;
        // Si ya está ocupado en el mes actual, no lo copiamos
        if (ocupacionActual[a.consultorio_id]?.[a.dia_semana]?.[a.franja]) continue;
        
        asignacionesAInsertar.push({
            medico_id: a.medico_id,
            consultorio_id: a.consultorio_id,
            dia_semana: a.dia_semana,
            franja: a.franja,
            periodo: periodoDestino,
            es_residente: a.es_residente || false,
            es_rotativo: a.es_rotativo || false,
            estado_color: null, // Reset color when copying to a new month
        });
    }

    if (asignacionesAInsertar.length === 0) {
        return 0; // Nada nuevo que copiar
    }

    // Insertar en bloque
    const { error } = await supabase
        .from('alq_asignaciones')
        .insert(asignacionesAInsertar);
        
    if (error) {
        console.error('Error copiando asignaciones:', error);
        throw new Error('No se pudieron copiar las asignaciones');
    }

    return asignacionesAInsertar.length;
}

// =============================================
// NOVEDADES
// =============================================

export async function fetchNovedades(periodo, sedeId = null) {
    let query = supabase
        .from('alq_novedades_log')
        .select('*, medico:alq_medicos(nombre_display), sede:alq_sedes(nombre, codigo)')
        .eq('periodo', periodo)
        .order('created_at', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
}

export async function registrarNovedad({ periodo, tipo, medicoId, sedeId, descripcion, detalle, usuario }) {
    const { data, error } = await supabase
        .from('alq_novedades_log')
        .insert({ periodo, tipo, medico_id: medicoId, sede_id: sedeId, descripcion, detalle, usuario })
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

export async function updateNovedad(id, { descripcion, observacion, usuario }) {
    // First, get the current record to update the detalle JSON safely
    const { data: current, error: fetchErr } = await supabase
        .from('alq_novedades_log')
        .select('detalle')
        .eq('id', id)
        .single();
    if (fetchErr) throw new Error(fetchErr.message);

    const newDetalle = { ...(current.detalle || {}) };
    if (observacion) {
        newDetalle.observacion = observacion;
    } else {
        delete newDetalle.observacion;
    }

    const { data, error } = await supabase
        .from('alq_novedades_log')
        .update({ descripcion, detalle: newDetalle, usuario })
        .eq('id', id)
        .select()
        .single();
    if (error) throw new Error(error.message);
    return data;
}

export async function deleteNovedad(id) {
    const { error } = await supabase
        .from('alq_novedades_log')
        .delete()
        .eq('id', id);
    if (error) throw new Error(error.message);
    return true;
}

// =============================================
// MÉTRICAS (via RPC)
// =============================================

export async function fetchMetricas(periodo) {
    const { data, error } = await supabase.rpc('alq_calcular_metricas', { p_periodo: periodo });
    if (error) throw new Error(error.message);
    return data || [];
}

// =============================================
// LIQUIDACIÓN (via RPC)
// =============================================

export async function fetchLiquidacion(periodo) {
    const { data, error } = await supabase.rpc('alq_calcular_liquidacion', { p_periodo: periodo });
    if (error) throw new Error(error.message);
    return data || [];
}

// =============================================
// HISTORIAL / PERÍODOS
// =============================================

export async function fetchPeriodos() {
    const { data, error } = await supabase
        .from('alq_periodos_snapshot')
        .select('id, periodo, cerrado, cerrado_por, cerrado_at, metricas, created_at')
        .order('periodo', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

export async function fetchSnapshot(periodo) {
    const { data, error } = await supabase
        .from('alq_periodos_snapshot')
        .select('*')
        .eq('periodo', periodo)
        .single();
    if (error) throw new Error(error.message);
    return data;
}

export async function cerrarPeriodo(periodo, usuario) {
    const { data, error } = await supabase.rpc('alq_cerrar_periodo', {
        p_periodo: periodo,
        p_usuario: usuario,
    });
    if (error) throw new Error(error.message);
    return data;
}

// =============================================
// HELPERS
// =============================================

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const FRANJAS = ['mañana', 'siesta', 'tarde'];
const DIAS_LABELS = {
    lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
    jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
};
const FRANJAS_LABELS = {
    'mañana': 'Mañana', 'siesta': 'Siesta', 'tarde': 'Tarde',
};

export { DIAS, FRANJAS, DIAS_LABELS, FRANJAS_LABELS };

/**
 * Transforma asignaciones en una estructura de grilla:
 * { [consultorioId]: { [dia]: { [franja]: asignacion } } }
 */
export function buildGrilla(asignaciones, consultorios) {
    const grilla = {};
    for (const c of consultorios) {
        grilla[c.id] = {};
        for (const dia of DIAS) {
            grilla[c.id][dia] = {};
            for (const franja of FRANJAS) {
                grilla[c.id][dia][franja] = null;
            }
        }
    }
    for (const a of asignaciones) {
        if (a.consultorio && grilla[a.consultorio.id]) {
            grilla[a.consultorio.id][a.dia_semana][a.franja] = a;
        }
    }
    return grilla;
}

/**
 * Calcula métricas rápidas en el frontend a partir de la grilla
 */
export function calcularMetricasLocal(grilla, consultorios) {
    let totalDisponible = 0;
    let totalOcupado = 0;
    const porConsultorio = {};

    for (const c of consultorios) {
        if (!c.es_alquilable) continue;
        const disponible = c.slots_disponibles || 16;
        let ocupado = 0;
        for (const dia of DIAS) {
            for (const franja of FRANJAS) {
                if (dia === 'sabado' && franja !== 'mañana') continue;
                if (grilla[c.id]?.[dia]?.[franja]) ocupado++;
            }
        }
        porConsultorio[c.id] = { disponible, ocupado, tasa: disponible > 0 ? Math.round((ocupado / disponible) * 100) : 0 };
        totalDisponible += disponible;
        totalOcupado += ocupado;
    }

    return {
        totalDisponible,
        totalOcupado,
        totalLibre: totalDisponible - totalOcupado,
        tasaGeneral: totalDisponible > 0 ? Math.round((totalOcupado / totalDisponible) * 100) : 0,
        porConsultorio,
    };
}

/**
 * Genera el texto formateado del mail de novedades para Sandra
 */
export function generarTextoMail(novedades, sedes, periodo) {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const [year, month] = periodo.split('-');
    const mesNombre = meses[parseInt(month) - 1] || month;
    
    let texto = `Hola Sandra, buen día.\n`;
    texto += `Te envío las novedades correspondientes al mes de ${mesNombre.toLowerCase()} para tener en cuenta en la liquidación médica, ordenadas por sede.\n`;
    texto += `${'─'.repeat(40)}\n`;

    for (const sede of sedes) {
        const novedadesSede = novedades.filter(n => n.sede_id === sede.id);
        if (novedadesSede.length === 0) continue;

        texto += `\n📍 SEDE ${sede.nombre.toUpperCase()}\n`;

        const altas = novedadesSede.filter(n => n.tipo === 'alta');
        const bajas = novedadesSede.filter(n => n.tipo === 'baja');
        const cambios = novedadesSede.filter(n => ['cambio_horario', 'cambio_sede', 'cambio_consultorio'].includes(n.tipo));

        const manuales = novedadesSede.filter(n => n.tipo === 'manual');

        if (altas.length > 0) {
            texto += `\nAltas / Incorporaciones\n`;
            for (const a of altas) {
                texto += `•\t${a.descripcion}\n`;
                if (a.detalle?.observacion) texto += `\tNota: ${a.detalle.observacion}\n`;
            }
        }
        if (bajas.length > 0 || cambios.length > 0) {
            texto += `\nBajas / Cambios\n`;
            for (const b of [...bajas, ...cambios]) {
                texto += `•\t${b.descripcion}\n`;
                if (b.detalle?.observacion) texto += `\tNota: ${b.detalle.observacion}\n`;
            }
        }
        if (manuales.length > 0) {
            texto += `\nOtras Novedades / Observaciones\n`;
            for (const m of manuales) {
                texto += `•\t${m.descripcion}\n`;
                if (m.detalle?.observacion) texto += `\tNota: ${m.detalle.observacion}\n`;
            }
        }
        texto += `${'─'.repeat(40)}\n`;
    }

    texto += `\nQuedo atenta ante cualquier consulta o si necesitas ampliar alguna modificación.\nSaludos,\nVale\n`;
    return texto;
}

/**
 * Obtiene el período actual en formato YYYY-MM
 */
export function getPeriodoActual() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
