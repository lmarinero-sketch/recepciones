/**
 * conversionFunnelService.js
 * Cruce analítico entre WhatsApp (Meta / line_recepciones) y turnos reales en SALUS
 * (public.salus_turnos_conversion) para medir:
 *  1. Consultas Ingresadas
 *  2. Consultas Respondidas (+ tiempo mediano de primera respuesta)
 *  3. Turnos Asignados en SALUS (Conversión Real vs. Atención Integral)
 *  4. Turnos Concretados Efectivamente (Asistencia = 'Presente')
 *  + Series diarias (líneas), Tortas (asistencia y tipo), Barras (sede/obra social),
 *    Histograma de Edad y Tabla de Trazabilidad.
 */
import { supabase } from '../lib/supabase';

const AGE_BINS = [
    { key: '<18', label: '< 18', min: 0, max: 17 },
    { key: '18-29', label: '18–29', min: 18, max: 29 },
    { key: '30-39', label: '30–39', min: 30, max: 39 },
    { key: '40-49', label: '40–49', min: 40, max: 49 },
    { key: '50-59', label: '50–59', min: 50, max: 59 },
    { key: '60-69', label: '60–69', min: 60, max: 69 },
    { key: '70+', label: '70+', min: 70, max: 150 },
];

function getLast7(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length >= 7 ? d.slice(-7) : '';
}

async function fetchAllPaginated(buildQuery) {
    const all = [];
    const step = 1000;
    let from = 0;
    while (true) {
        const { data, error } = await buildQuery().range(from, from + step - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < step) break;
        from += step;
    }
    return all;
}

/**
 * Carga los datos crudos del período seleccionado (mensajes WhatsApp + turnos SALUS)
 */
export async function fetchConversionRawData({ startDate, endDate }) {
    const startIso = `${startDate}T00:00:00-03:00`;
    const endIso = `${endDate}T23:59:59-03:00`;

    // Para no perder respuestas o turnos creados hasta 30 días después del fin del período
    const endPlus30 = new Date(`${endDate}T23:59:59-03:00`);
    endPlus30.setDate(endPlus30.getDate() + 30);
    const endPlus30Iso = endPlus30.toISOString();

    const [messages, turnos] = await Promise.all([
        fetchAllPaginated(() =>
            supabase
                .from('whatsapp_messages')
                .select('phone, direction, created_at, sender_name, content')
                .eq('line_id', 'line_recepciones')
                .gte('created_at', startIso)
                .lte('created_at', endPlus30Iso)
                .order('created_at', { ascending: true })
        ),
        fetchAllPaginated(() =>
            supabase
                .from('salus_turnos_conversion')
                .select('id_visita, paciente, dni, edad, sexo, obra_social, centro, especialidad, medico, tipo_visita, categoria_turno, fecha_visita, hora_visita, fecha_creacion, usuario_creacion, asistencia, tel1_last7, tel2_last7, synced_at')
                .gte('fecha_visita', startDate)
                .order('fecha_visita', { ascending: true })
        ),
    ]);

    const lastSyncedAt = turnos.reduce((max, t) => (!max || (t.synced_at && t.synced_at > max) ? t.synced_at : max), null);

    return {
        messages,
        turnos,
        startIso,
        endIso,
        lastSyncedAt,
    };
}

/**
 * Calcula todos los KPIs, gráficos y tabla de auditoría en memoria (cambio instantáneo de filtros)
 */
export function computeConversionAnalytics(rawData, {
    startDate,
    endDate,
    attributionMode = 'strict', // 'strict' (creado post-consulta) | 'broad' (turno con fecha >= consulta)
    attributionDays = 14,
    categoriaFilter = 'all',    // 'all' | 'Chequeo Preventivo' | 'Chequeo Informe' | 'Ecografía' | 'Otros Ambulatorios'
} = {}) {
    if (!rawData) return null;
    const { messages, turnos, lastSyncedAt } = rawData;

    const startMs = new Date(`${startDate}T00:00:00-03:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59-03:00`).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
        return null;
    }
    const todayStr = new Date().toISOString().slice(0, 10);

    // Granularidad adaptativa para que el gráfico de líneas se vea impecable en 7 días, 90 días o 1+ año
    const diffDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
    const seriesGranularity = diffDays <= 45 ? 'diaria' : diffDays <= 120 ? 'semanal' : 'mensual';
    const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const getBucketKeyAndLabel = (dateStr) => {
        if (seriesGranularity === 'mensual') {
            const [y, m] = dateStr.split('-');
            const mIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
            return { key: `${y}-${m}`, label: `${MONTH_SHORT[mIdx]} ${y.slice(2)}` };
        }
        if (seriesGranularity === 'semanal') {
            const d = new Date(`${dateStr}T12:00:00`);
            const day = d.getDay(); // 0=Dom..6=Sab
            const diffToMon = (day === 0 ? -6 : 1 - day);
            d.setDate(d.getDate() + diffToMon);
            const wkKey = d.toISOString().slice(0, 10);
            const wkLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            return { key: wkKey, label: `Sem ${wkLabel}` };
        }
        const [, m, dd] = dateStr.split('-');
        return { key: dateStr, label: `${dd}/${m}` };
    };

    // 1. Agrupar mensajes por teléfono
    const byPhone = new Map();
    for (const m of messages) {
        const ts = new Date(m.created_at).getTime();
        const phone = m.phone;
        if (!byPhone.has(phone)) {
            byPhone.set(phone, {
                phone,
                last7: getLast7(phone),
                senderName: '',
                incInPeriod: [],
                outAll: [],
            });
        }
        const entry = byPhone.get(phone);
        if (m.direction === 'incoming') {
            if (m.sender_name && !entry.senderName) entry.senderName = m.sender_name;
            if (ts >= startMs && ts <= endMs) {
                entry.incInPeriod.push({ ts, created_at: m.created_at, content: m.content });
            }
        } else {
            const isBot = (m.sender_name || '').includes('Dora') || (m.content || '').includes('Encuesta de Satisfacción');
            if (!isBot) {
                const isTpl = (m.content || '').includes('[Plantilla');
                entry.outAll.push({ ts, created_at: m.created_at, isTpl, sender_name: m.sender_name });
            }
        }
    }

    // 2. Indexar turnos SALUS por tel1_last7 y tel2_last7 (aplicando filtro de categoría)
    const turnosByLast7 = new Map();
    for (const t of turnos) {
        if (categoriaFilter !== 'all' && t.categoria_turno !== categoriaFilter) continue;
        if (t.tel1_last7) {
            if (!turnosByLast7.has(t.tel1_last7)) turnosByLast7.set(t.tel1_last7, []);
            turnosByLast7.get(t.tel1_last7).push(t);
        }
        if (t.tel2_last7 && t.tel2_last7 !== t.tel1_last7) {
            if (!turnosByLast7.has(t.tel2_last7)) turnosByLast7.set(t.tel2_last7, []);
            turnosByLast7.get(t.tel2_last7).push(t);
        }
    }

    // 3. Evaluar cada consulta ingresada
    const rows = [];
    const frtMinutesList = [];
    const dailyMap = new Map();

    // Inicializar buckets del período según granularidad (diaria / semanal / mensual) con tope de seguridad
    const curDay = new Date(`${startDate}T12:00:00`);
    const endDay = new Date(`${endDate}T12:00:00`);
    let safetyCounter = 0;
    while (curDay <= endDay && safetyCounter < 2000) {
        safetyCounter++;
        const isoDay = curDay.toISOString().slice(0, 10);
        const { key, label } = getBucketKeyAndLabel(isoDay);
        if (!dailyMap.has(key)) {
            dailyMap.set(key, {
                dateKey: key,
                label,
                ingresadas: 0,
                respondidas: 0,
                asignados: 0,
                concretados: 0,
            });
        }
        curDay.setDate(curDay.getDate() + 1);
    }

    const windowMs = attributionDays * 24 * 60 * 60 * 1000;

    let totalIngresadas = 0;
    let totalRespondidas = 0;
    let totalRespondidasHumano = 0;
    let totalAsignados = 0;
    let totalConcretados = 0;
    let totalFuturosPendientes = 0;
    let totalAusentes = 0;

    // Distribuciones sobre turnos asignados (a nivel de paciente único + turnos)
    const asistenciaCounts = {
        Presente: 0,
        'Futuro Pendiente': 0,
        'Ausencia Justificada': 0,
        'Ausencia Injustificada': 0,
        'Otro / Sin marcar': 0,
    };
    const tipoTurnoCounts = {};
    const sedeMap = {};
    const obraSocialMap = {};
    const ageBins = AGE_BINS.map(b => ({ ...b, asignados: 0, concretados: 0 }));
    const edadesConcretados = [];
    const edadesAsignados = [];
    const sexoCounts = { Mujer: 0, Hombre: 0, 'Sin dato': 0 };

    for (const entry of byPhone.values()) {
        if (entry.incInPeriod.length === 0) continue;
        totalIngresadas++;

        const firstInc = entry.incInPeriod[0];
        const firstIncDate = new Date(firstInc.ts).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' });

        // Buscar primera respuesta posterior al ingreso
        const firstReply = entry.outAll.find(o => o.ts >= firstInc.ts);
        const firstHumanReply = entry.outAll.find(o => o.ts >= firstInc.ts && !o.isTpl);
        const respondida = Boolean(firstReply);
        if (respondida) {
            totalRespondidas++;
            const diffMin = Math.round((firstReply.ts - firstInc.ts) / 60000);
            if (diffMin >= 0 && diffMin <= 60 * 72) frtMinutesList.push(diffMin);
        }
        if (firstHumanReply) totalRespondidasHumano++;

        // Cruce con turnos SALUS
        const candidateTurnos = entry.last7 ? (turnosByLast7.get(entry.last7) || []) : [];
        const matchedTurnos = candidateTurnos.filter(t => {
            if (attributionMode === 'strict') {
                if (!t.fecha_creacion) return false;
                const creacionMs = new Date(t.fecha_creacion).getTime();
                // Permitir margen de -10 min por relojes / creación simultánea
                return creacionMs >= (firstInc.ts - 10 * 60 * 1000) && creacionMs <= (firstInc.ts + windowMs);
            }
            // Modo amplio: turno con fecha >= fecha de consulta y dentro de +60 días
            const visitaMs = new Date(`${t.fecha_visita}T23:59:59-03:00`).getTime();
            return t.fecha_visita >= firstIncDate && visitaMs <= (firstInc.ts + 60 * 24 * 60 * 60 * 1000);
        });

        // Deduplicar turnos por id_visita
        const uniqueTurnos = [...new Map(matchedTurnos.map(t => [t.id_visita, t])).values()];
        const hasTurno = uniqueTurnos.length > 0;

        let estadoPaciente = 'Sin turno';
        let bestTurno = null;

        if (hasTurno) {
            totalAsignados++;
            // Priorizar Presente > Futuro Pendiente > más reciente
            const presenteTurno = uniqueTurnos.find(t => (t.asistencia || '').toLowerCase() === 'presente');
            const futuroTurno = uniqueTurnos.find(t => t.fecha_visita >= todayStr);
            bestTurno = presenteTurno || futuroTurno || uniqueTurnos[0];

            const asistNorm = (bestTurno.asistencia || '').trim().toLowerCase();
            if (presenteTurno) {
                totalConcretados++;
                estadoPaciente = 'Concretado';
                asistenciaCounts.Presente++;
            } else if (bestTurno.fecha_visita >= todayStr) {
                totalFuturosPendientes++;
                estadoPaciente = 'Pendiente Futuro';
                asistenciaCounts['Futuro Pendiente']++;
            } else if (asistNorm.includes('justificada') && !asistNorm.includes('injustificada')) {
                totalAusentes++;
                estadoPaciente = 'Ausencia Justificada';
                asistenciaCounts['Ausencia Justificada']++;
            } else if (asistNorm.includes('injustificada')) {
                totalAusentes++;
                estadoPaciente = 'Ausencia Injustificada';
                asistenciaCounts['Ausencia Injustificada']++;
            } else {
                totalAusentes++;
                estadoPaciente = 'Ausente / Sin marcar';
                asistenciaCounts['Otro / Sin marcar']++;
            }

            // Tipo de turno (por turno principal)
            const cat = bestTurno.categoria_turno || 'Otros Ambulatorios';
            tipoTurnoCounts[cat] = (tipoTurnoCounts[cat] || 0) + 1;

            // Sede
            const sedeRaw = (bestTurno.centro || 'Sin sede').trim();
            const sedeName = sedeRaw.toUpperCase().includes('SANTA FE') ? 'Sede Santa Fe'
                : sedeRaw.toUpperCase().includes('SAN LUIS') ? 'Sede San Luis'
                : sedeRaw;
            if (!sedeMap[sedeName]) sedeMap[sedeName] = { sede: sedeName, asignados: 0, concretados: 0 };
            sedeMap[sedeName].asignados++;
            if (presenteTurno) sedeMap[sedeName].concretados++;

            // Obra Social
            const osRaw = (bestTurno.obra_social || 'Particular / Sin dato').replace(/^\d+\s*-\s*/, '').trim();
            if (!obraSocialMap[osRaw]) obraSocialMap[osRaw] = { obraSocial: osRaw, asignados: 0, concretados: 0 };
            obraSocialMap[osRaw].asignados++;
            if (presenteTurno) obraSocialMap[osRaw].concretados++;

            // Edad & Sexo (para Histograma de Edad)
            if (typeof bestTurno.edad === 'number' && bestTurno.edad >= 0 && bestTurno.edad <= 120) {
                edadesAsignados.push(bestTurno.edad);
                if (presenteTurno) edadesConcretados.push(bestTurno.edad);
                const bin = ageBins.find(b => bestTurno.edad >= b.min && bestTurno.edad <= b.max);
                if (bin) {
                    bin.asignados++;
                    if (presenteTurno) bin.concretados++;
                }
            }
            const sx = (bestTurno.sexo || '').toLowerCase();
            if (sx.includes('mujer') || sx === 'f') sexoCounts.Mujer++;
            else if (sx.includes('hombre') || sx.includes('masc') || sx === 'm') sexoCounts.Hombre++;
            else sexoCounts['Sin dato']++;
        }

        // Acumular serie temporal según granularidad adaptativa
        const { key: bucketKey } = getBucketKeyAndLabel(firstIncDate);
        if (dailyMap.has(bucketKey)) {
            const d = dailyMap.get(bucketKey);
            d.ingresadas++;
            if (respondida) d.respondidas++;
            if (hasTurno) d.asignados++;
            if (estadoPaciente === 'Concretado') d.concretados++;
        }

        const sortedUniqueTurnos = [...uniqueTurnos].sort((a, b) =>
            `${a.fecha_visita || ''} ${a.hora_visita || ''}`.localeCompare(`${b.fecha_visita || ''} ${b.hora_visita || ''}`)
        );
        const allCandidateTurnos = [...new Map(candidateTurnos.map(t => [t.id_visita, t])).values()].sort((a, b) =>
            `${a.fecha_visita || ''} ${a.hora_visita || ''}`.localeCompare(`${b.fecha_visita || ''} ${b.hora_visita || ''}`)
        );

        rows.push({
            phone: entry.phone,
            paciente: bestTurno?.paciente || entry.senderName || entry.phone,
            dni: bestTurno?.dni || '',
            edad: bestTurno?.edad ?? null,
            fechaConsulta: firstInc.created_at,
            respondida,
            frtMinutes: firstReply ? Math.round((firstReply.ts - firstInc.ts) / 60000) : null,
            tieneTurno: hasTurno,
            fechaCreacionTurno: bestTurno?.fecha_creacion || null,
            fechaVisita: bestTurno?.fecha_visita || null,
            horaVisita: bestTurno?.hora_visita || null,
            tipoTurno: bestTurno?.categoria_turno || '—',
            tipoVisitaDetalle: bestTurno?.tipo_visita || '—',
            obraSocial: bestTurno?.obra_social || '—',
            centro: bestTurno?.centro || '—',
            usuarioCreacion: bestTurno?.usuario_creacion || '—',
            estadoPaciente,
            cantidadTurnos: uniqueTurnos.length,
            turnosDetalle: sortedUniqueTurnos,
            allTurnosPaciente: allCandidateTurnos,
        });
    }

    // Calcular medianas y promedios
    const median = (arr) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
    };

    const medianFrtMinutes = median(frtMinutesList);
    const avgAge = edadesAsignados.length
        ? Math.round((edadesAsignados.reduce((a, b) => a + b, 0) / edadesAsignados.length) * 10) / 10
        : 0;
    const medianAge = median(edadesAsignados);
    const topAgeBin = [...ageBins].sort((a, b) => b.asignados - a.asignados)[0] || null;

    const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    // Tasa de concreción efectiva (excluyendo futuros pendientes para mostrar efectividad real sobre turnos ya vencidos)
    const turnosYaVencidos = Math.max(0, totalAsignados - totalFuturosPendientes);

    return {
        lastSyncedAt,
        kpis: {
            ingresadas: totalIngresadas,
            respondidas: totalRespondidas,
            respondidasHumano: totalRespondidasHumano,
            asignados: totalAsignados,
            concretados: totalConcretados,
            futurosPendientes: totalFuturosPendientes,
            ausentes: totalAusentes,
            tasaRespuesta: pct(totalRespondidas, totalIngresadas),
            tasaConversionSobreIngresadas: pct(totalAsignados, totalIngresadas),
            tasaConversionSobreRespondidas: pct(totalAsignados, totalRespondidas),
            tasaConcrecionSobreAsignados: pct(totalConcretados, totalAsignados),
            tasaConcrecionSobreVencidos: pct(totalConcretados, turnosYaVencidos),
            medianFrtMinutes,
        },
        funnelData: [
            { stage: '1. Ingresadas', count: totalIngresadas, pct: 100, fill: '#0284C7' },
            { stage: '2. Respondidas', count: totalRespondidas, pct: pct(totalRespondidas, totalIngresadas), fill: '#6366F1' },
            { stage: '3. Turno Asignado', count: totalAsignados, pct: pct(totalAsignados, totalIngresadas), fill: '#0EA5E9' },
            { stage: '4. Concretados', count: totalConcretados, pct: pct(totalConcretados, totalIngresadas), fill: '#10B981' },
        ],
        dailySeries: [...dailyMap.values()],
        seriesGranularity,
        asistenciaPie: Object.entries(asistenciaCounts)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({ name, value })),
        tipoTurnoPie: Object.entries(tipoTurnoCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value),
        sedeBars: Object.values(sedeMap).sort((a, b) => b.asignados - a.asignados),
        obraSocialBars: Object.values(obraSocialMap)
            .sort((a, b) => b.asignados - a.asignados)
            .slice(0, 8),
        ageHistogram: ageBins,
        demographics: {
            avgAge,
            medianAge,
            topAgeBin,
            totalConEdad: edadesAsignados.length,
            sexoPie: Object.entries(sexoCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })),
        },
        auditRows: rows.sort((a, b) => new Date(b.fechaConsulta) - new Date(a.fechaConsulta)),
    };
}
