import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, TrendingUp, Users, Calendar, Loader2, RefreshCw,
    Building2, UserCheck, UserX, CalendarDays, Clock, FileText, ClipboardCheck
} from 'lucide-react';
import {
    ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, PieChart, Pie, Cell, Legend, ReferenceLine
} from 'recharts';
import { fetchRecordatoriosMetrics } from '../services/recordatoriosService';

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const COLORS = ['#0284c7','#10b981','#f59e0b','#8b5cf6','#ec4899','#64748b'];

const isExcludedMedico = (name) => {
    if (!name) return true;
    const norm = name.toUpperCase().replace(/,/g, '').trim();
    return (
        norm.includes('PROFESIONAL CHEQUEO') ||
        norm.includes('MORALES MALEN') ||
        norm.includes('GODOY GUZMAN GISEL ALEJANDRA') ||
        norm.startsWith('QUIROFANO') ||
        norm.startsWith('MEDICO GUARDIA')
    );
};

function isInformeRow(r) {
    const tv = String(r.tipo_visita || '').toUpperCase();
    return tv.includes('INFORME') || tv.includes('CHQ INF');
}

function StatCard({ icon: Icon, label, value, sub, color, bg }) {
    return (
        <div style={{
            background: '#fff', borderRadius: '14px', padding: '16px 18px',
            border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px',
            transition: 'all .2s', cursor: 'default',
        }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.06)'; e.currentTarget.style.borderColor = color + '40'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
            <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                <Icon size={21} color={color} />
            </div>
            <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>{value}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.68rem', color: color, fontWeight: 700, marginTop: '2px' }}>{sub}</div>}
            </div>
        </div>
    );
}

function aggregate(data, fechaDesde, fechaHasta, filtroEdad = 'todos', customMin = '', customMax = '', tipoConsulta = 'preventivo') {
    const byMonth = {};
    const osCounts = {};
    const medicoCounts = {};
    const sedeCounts = {};
    const ageCounts = {
        '< 14': 0,
        '14 - 17': 0,
        '18 - 50': 0,
        '51 - 65': 0,
        '66+': 0,
        'Sin Dato': 0,
    };
    let totalPresentes = 0, totalAusentes = 0, totalPendientes = 0;
    let filteredCount = 0;

    // También calculamos métricas cruzadas de Informe vs Chequeo en el mismo rango
    const chqPresenteDnis = new Set();
    const infPresenteDnis = new Set();
    const infAgendadoDnis = new Set();
    const chqDatesByDni = {};
    const infDatesByDni = {};

    const uniqueVisitsMap = new Map();
    data.forEach(r => {
        if (!r.fecha) return;
        if (fechaDesde && r.fecha < fechaDesde) return;
        if (fechaHasta && r.fecha > fechaHasta) return;

        // Filtro por rango etario
        if (filtroEdad !== 'todos') {
            const age = r.edad !== null && r.edad !== undefined && r.edad !== '' ? parseInt(r.edad, 10) : null;
            if (age === null || isNaN(age)) return;
            if (filtroEdad === '<14' && age >= 14) return;
            if (filtroEdad === '14-17' && (age < 14 || age > 17)) return;
            if (filtroEdad === '18-50' && (age < 18 || age > 50)) return;
            if (filtroEdad === '51-65' && (age < 51 || age > 65)) return;
            if (filtroEdad === '66+' && age < 66) return;
            if (filtroEdad === 'custom') {
                const min = customMin !== '' ? parseInt(customMin, 10) : null;
                const max = customMax !== '' ? parseInt(customMax, 10) : null;
                if (min !== null && !isNaN(min) && age < min) return;
                if (max !== null && !isNaN(max) && age > max) return;
            }
        }

        const isInf = isInformeRow(r);
        const dniKey = (r.dni || r.paciente || '').toString().trim();
        if (dniKey) {
            if (isInf) {
                infAgendadoDnis.add(`${dniKey}_${r.fecha}`);
                if (r.asistencia_efectiva === 'Presente') {
                    infPresenteDnis.add(dniKey);
                    if (!infDatesByDni[dniKey] || r.fecha > infDatesByDni[dniKey]) {
                        infDatesByDni[dniKey] = r.fecha;
                    }
                }
            } else {
                if (r.asistencia_efectiva === 'Presente') {
                    chqPresenteDnis.add(dniKey);
                    if (!chqDatesByDni[dniKey] || r.fecha < chqDatesByDni[dniKey]) {
                        chqDatesByDni[dniKey] = r.fecha;
                    }
                }
            }
        }

        // Filtrar según tipoConsulta seleccionado
        if (tipoConsulta === 'preventivo' && isInf) return;
        if (tipoConsulta === 'informe' && !isInf) return;

        const key = `${r.dni || r.paciente}_${r.fecha}_${isInf ? 'INF' : 'CHQ'}`;
        if (!uniqueVisitsMap.has(key)) {
            uniqueVisitsMap.set(key, { ...r, isInf });
        } else {
            const existing = uniqueVisitsMap.get(key);
            if (r.asistencia_efectiva === 'Presente') {
                existing.asistencia_efectiva = 'Presente';
            }
        }
    });

    // Calcular días promedio entre Chequeo Preventivo y Consulta de Informe
    let sumDiasInforme = 0;
    let countDiasInforme = 0;
    Object.keys(infDatesByDni).forEach(dni => {
        const fChq = chqDatesByDni[dni];
        const fInf = infDatesByDni[dni];
        if (fChq && fInf && fInf >= fChq) {
            const diff = Math.round((new Date(fInf + 'T12:00:00') - new Date(fChq + 'T12:00:00')) / (1000 * 60 * 60 * 24));
            if (diff >= 0 && diff <= 120) {
                sumDiasInforme += diff;
                countDiasInforme++;
            }
        }
    });
    const avgDiasAlInforme = countDiasInforme > 0 ? Math.round(sumDiasInforme / countDiasInforme) : 0;
    const tasaRetornoInforme = chqPresenteDnis.size > 0
        ? Math.round((infPresenteDnis.size / chqPresenteDnis.size) * 100)
        : 0;

    const uniqueVisits = Array.from(uniqueVisitsMap.values());

    uniqueVisits.forEach(r => {
        filteredCount++;
        const asis = r.asistencia_efectiva;
        const isAusente = asis === 'Ausente' || asis === 'Ausencia justificada' || asis === 'Ausencia injustificada' || asis === 'Anulación Cita Online';

        if (asis === 'Presente') totalPresentes++;
        else if (isAusente) totalAusentes++;
        else totalPendientes++;

        const month = r.fecha.substring(0, 7);
        if (!byMonth[month]) {
            byMonth[month] = {
                agendados: 0, presentes: 0, ausentes: 0, pendientes: 0,
                chqPresentes: 0, infPresentes: 0, infAgendados: 0, infAusentes: 0
            };
        }
        byMonth[month].agendados++;
        if (asis === 'Presente') byMonth[month].presentes++;
        else if (isAusente) byMonth[month].ausentes++;
        else byMonth[month].pendientes++;

        if (r.isInf) {
            byMonth[month].infAgendados++;
            if (asis === 'Presente') byMonth[month].infPresentes++;
            else if (isAusente) byMonth[month].infAusentes++;
        } else {
            if (asis === 'Presente') byMonth[month].chqPresentes++;
        }

        if (asis === 'Presente') {
            const os = r.obra_social || 'Particular/Sin OS';
            osCounts[os] = (osCounts[os] || 0) + 1;

            const sede = r.centro || 'Sin Sede';
            sedeCounts[sede] = (sedeCounts[sede] || 0) + 1;

            if (r.medico && !isExcludedMedico(r.medico)) {
                medicoCounts[r.medico] = (medicoCounts[r.medico] || 0) + 1;
            }

            if (r.edad !== null && r.edad !== undefined && r.edad !== '') {
                const age = parseInt(r.edad, 10);
                if (!isNaN(age)) {
                    if (age < 14) ageCounts['< 14']++;
                    else if (age >= 14 && age <= 17) ageCounts['14 - 17']++;
                    else if (age >= 18 && age <= 50) ageCounts['18 - 50']++;
                    else if (age >= 51 && age <= 65) ageCounts['51 - 65']++;
                    else if (age >= 66) ageCounts['66+']++;
                } else {
                    ageCounts['Sin Dato']++;
                }
            } else {
                ageCounts['Sin Dato']++;
            }
        }
    });

    const months = Object.keys(byMonth).sort().map(m => {
        const curr = byMonth[m];
        const tasaAsistencia = curr.agendados > 0 ? Math.round((curr.presentes / (curr.presentes + curr.ausentes || 1)) * 100) : 0;
        const tasaRetornoMes = curr.chqPresentes > 0 ? Math.round((curr.infPresentes / curr.chqPresentes) * 100) : 0;
        const [y, mo] = m.split('-');
        return {
            month: m,
            label: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y.slice(2)}`,
            labelFull: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`,
            ...curr,
            tasaAsistencia,
            tasaRetornoMes,
        };
    });

    const topOS = Object.entries(osCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
    const othersOS = Object.entries(osCounts).sort((a, b) => b[1] - a[1]).slice(5).reduce((s, [, c]) => s + c, 0);
    if (othersOS > 0) topOS.push({ name: 'Otras', value: othersOS });

    const topMedicos = Object.entries(medicoCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
    const topSedes = Object.entries(sedeCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

    const AGE_COLORS = {
        '< 14': '#06b6d4',
        '14 - 17': '#3b82f6',
        '18 - 50': '#10b981',
        '51 - 65': '#f59e0b',
        '66+': '#8b5cf6',
        'Sin Dato': '#cbd5e1',
    };

    const ageDistribution = Object.entries(ageCounts)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({ name, value, color: AGE_COLORS[name] || '#64748b' }));

    const tasaGlobal = (totalPresentes + totalAusentes) > 0
        ? Math.round((totalPresentes / (totalPresentes + totalAusentes)) * 100) : 0;

    return {
        months,
        topOS,
        topMedicos,
        topSedes,
        ageDistribution,
        totalPresentes,
        totalAusentes,
        totalPendientes,
        total: filteredCount,
        tasaGlobal,
        chqPresentesCount: chqPresenteDnis.size,
        infPresentesCount: infPresenteDnis.size,
        infAgendadosCount: infAgendadoDnis.size,
        tasaRetornoInforme,
        avgDiasAlInforme,
    };
}

function aggregateYoY(data, modo = 'agendados', filtroEdad = 'todos', customMin = '', customMax = '', tipoConsulta = 'preventivo') {
    const byMonth = {};
    const uniqueVisitsMap = new Map();

    data.forEach(r => {
        if (!r.fecha) return;
        const isInf = isInformeRow(r);
        if (tipoConsulta === 'preventivo' && isInf) return;
        if (tipoConsulta === 'informe' && !isInf) return;

        const key = `${r.dni || r.paciente}_${r.fecha}_${isInf ? 'INF' : 'CHQ'}`;
        if (!uniqueVisitsMap.has(key)) {
            uniqueVisitsMap.set(key, { ...r });
        } else {
            const existing = uniqueVisitsMap.get(key);
            if (r.asistencia_efectiva === 'Presente') {
                existing.asistencia_efectiva = 'Presente';
            }
        }
    });

    Array.from(uniqueVisitsMap.values()).forEach(r => {
        const asis = r.asistencia_efectiva;
        const isAusente = asis === 'Ausente' || asis === 'Ausencia justificada' || asis === 'Ausencia injustificada' || asis === 'Anulación Cita Online';

        if (modo === 'asistidos' && asis !== 'Presente') return;
        if (modo === 'ausentes' && !isAusente) return;

        if (filtroEdad !== 'todos') {
            const age = r.edad !== null && r.edad !== undefined && r.edad !== '' ? parseInt(r.edad, 10) : null;
            if (age === null || isNaN(age)) return;
            if (filtroEdad === '<14' && age >= 14) return;
            if (filtroEdad === '14-17' && (age < 14 || age > 17)) return;
            if (filtroEdad === '18-50' && (age < 18 || age > 50)) return;
            if (filtroEdad === '51-65' && (age < 51 || age > 65)) return;
            if (filtroEdad === '66+' && age < 66) return;
            if (filtroEdad === 'custom') {
                const min = customMin !== '' ? parseInt(customMin, 10) : null;
                const max = customMax !== '' ? parseInt(customMax, 10) : null;
                if (min !== null && !isNaN(min) && age < min) return;
                if (max !== null && !isNaN(max) && age > max) return;
            }
        }

        const [y, mo] = r.fecha.split('-');
        const monthIndex = parseInt(mo, 10) - 1;
        if (monthIndex < 0 || monthIndex > 11) return;

        if (!byMonth[monthIndex]) byMonth[monthIndex] = { name: MONTH_NAMES[monthIndex], index: monthIndex };
        byMonth[monthIndex][y] = (byMonth[monthIndex][y] || 0) + 1;
    });

    return Object.values(byMonth).sort((a, b) => a.index - b.index);
}

function getPreviousMonthRange() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

    const pad = n => String(n).padStart(2, '0');
    const fechaDesde = `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-01`;
    const fechaHasta = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;

    return { fechaDesde, fechaHasta };
}

export default function MetricasRecordatoriosPanel({ addToast }) {
    const defaultDates = useMemo(() => getPreviousMonthRange(), []);
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState('');
    const [fechaDesde, setFechaDesde] = useState(defaultDates.fechaDesde);
    const [fechaHasta, setFechaHasta] = useState(defaultDates.fechaHasta);
    const [filtroEdad, setFiltroEdad] = useState('todos');
    const [customEdadMin, setCustomEdadMin] = useState('');
    const [customEdadMax, setCustomEdadMax] = useState('');
    const [yoyMode, setYoyMode] = useState('asistidos'); // agendados | asistidos | ausentes
    const [tipoConsulta, setTipoConsulta] = useState('informe'); // 'preventivo' | 'informe' | 'comparativa'

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchRecordatoriosMetrics(msg => setProgress(msg));
            setRawData(data);
            setProgress('');
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando métricas de chequeos e informes', 'error');
        } finally { setLoading(false); }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const years = useMemo(() => {
        const ys = new Set();
        rawData.forEach(v => {
            if (v.fecha) ys.add(v.fecha.substring(0, 4));
        });
        return [...ys].sort().reverse();
    }, [rawData]);

    const agg = useMemo(
        () => aggregate(rawData, fechaDesde, fechaHasta, filtroEdad, customEdadMin, customEdadMax, tipoConsulta),
        [rawData, fechaDesde, fechaHasta, filtroEdad, customEdadMin, customEdadMax, tipoConsulta]
    );
    const yoyData = useMemo(
        () => aggregateYoY(rawData, yoyMode, filtroEdad, customEdadMin, customEdadMax, tipoConsulta),
        [rawData, yoyMode, filtroEdad, customEdadMin, customEdadMax, tipoConsulta]
    );

    const avgAgendados = useMemo(() => {
        return agg.months.length > 0 ? Math.round(agg.total / agg.months.length) : 0;
    }, [agg.total, agg.months.length]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#94a3b8' }}>
                <Loader2 size={32} className="spin" />
                <span style={{ marginTop: '10px', fontSize: '0.88rem' }}>Cargando estadísticas de chequeos y consultas de informe...</span>
                {progress && <span style={{ marginTop: '4px', fontSize: '0.78rem', color: '#0284c7' }}>{progress}</span>}
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7, #0369a1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <BarChart3 size={20} color="#fff" />
                        </div>
                        Estadísticas de Turnos: Chequeos Preventivos y Consultas de Informe
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '4px 0 0 48px', maxWidth: '720px' }}>
                        Analiza la asistencia real a los estudios de <strong>(CHQ) CHEQUEO PREVENTIVO</strong> y a las consultas médicas de devolución de resultados <strong>(CHQ) CHEQUEO INFORME</strong> en SALUS.
                    </p>
                </div>

                {/* Selector de Tipo de Consulta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '3px' }}>
                        {[
                            { id: 'informe', label: '📋 Consultas de Informe (CHEQUEO INFORME)' },
                            { id: 'preventivo', label: '🏥 Chequeos Preventivos (Estudios)' },
                            { id: 'comparativa', label: '🔄 Comparativa Chequeo vs. Informe' },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTipoConsulta(t.id)}
                                style={{
                                    padding: '7px 13px',
                                    borderRadius: '7px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.77rem',
                                    fontWeight: 700,
                                    transition: 'all .15s',
                                    background: tipoConsulta === t.id ? '#0284c7' : 'transparent',
                                    color: tipoConsulta === t.id ? '#fff' : '#475569',
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <button onClick={loadData} disabled={loading} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px',
                        cursor: 'pointer', fontSize: '0.78rem', color: '#0f172a', fontWeight: 600,
                    }}><RefreshCw size={14} /> Actualizar</button>
                </div>
            </div>

            {/* Date & Age Filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', background: '#fff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Desde:</span>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{
                        padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.78rem', background: '#fff'
                    }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Hasta:</span>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{
                        padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.78rem', background: '#fff'
                    }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Rango Etario:</span>
                    <select
                        value={filtroEdad}
                        onChange={e => setFiltroEdad(e.target.value)}
                        style={{
                            padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1',
                            color: '#0f172a', fontSize: '0.78rem', background: '#fff', fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        <option value="todos">Todos los rangos</option>
                        <option value="14-17">14 - 17 años (Adolescentes)</option>
                        <option value="18-50">18 - 50 años (Adultos Jóvenes)</option>
                        <option value="51-65">51 - 65 años (Adultos)</option>
                        <option value="66+">66 en adelante (66+ años)</option>
                        <option value="<14">Menores de 14 años (&lt; 14)</option>
                        <option value="custom">Personalizado...</option>
                    </select>
                </div>
                {filtroEdad === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '4px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>De:</span>
                        <input
                            type="number" min="0" max="120" placeholder="Min" value={customEdadMin}
                            onChange={e => setCustomEdadMin(e.target.value)}
                            style={{ width: '52px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', textAlign: 'center', background: '#fff' }}
                        />
                        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>a:</span>
                        <input
                            type="number" min="0" max="120" placeholder="Max" value={customEdadMax}
                            onChange={e => setCustomEdadMax(e.target.value)}
                            style={{ width: '52px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78rem', textAlign: 'center', background: '#fff' }}
                        />
                    </div>
                )}
                <button onClick={() => {
                    const prev = getPreviousMonthRange();
                    setFechaDesde(prev.fechaDesde);
                    setFechaHasta(prev.fechaHasta);
                }} style={{
                    padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer'
                }}>Mes anterior</button>
                <button onClick={() => {
                    setFechaDesde('2026-01-01');
                    setFechaHasta('2026-12-31');
                }} style={{
                    padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#eff6ff', color: '#0284c7', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                }}>Año 2026</button>
                {(fechaDesde || fechaHasta || filtroEdad !== 'todos' || customEdadMin || customEdadMax) && (
                    <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroEdad('todos'); setCustomEdadMin(''); setCustomEdadMax(''); }} style={{
                        padding: '5px 10px', borderRadius: '6px', border: 'none', background: '#fef2f2', color: '#dc2626', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                    }}>Ver Todo el Historial (2024–2026)</button>
                )}
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '12px', marginBottom: '18px', flexShrink: 0 }}>
                <StatCard
                    icon={tipoConsulta === 'informe' ? FileText : CalendarDays}
                    label={tipoConsulta === 'informe' ? 'Turnos de Informe Agendados' : tipoConsulta === 'preventivo' ? 'Turnos de Chequeo Agendados' : 'Total Turnos (CHQ + Informe)'}
                    value={agg.total.toLocaleString()}
                    sub={tipoConsulta === 'informe' ? 'Tipo: (CHQ) CHEQUEO INFORME' : tipoConsulta === 'preventivo' ? 'Tipo: (CHQ) CHEQUEO PREVENTIVO' : `${agg.infAgendadosCount.toLocaleString()} de Informe`}
                    color="#0284c7"
                    bg="#e0f2fe"
                />
                <StatCard
                    icon={UserCheck}
                    label={tipoConsulta === 'informe' ? 'Informes Entregados (Presentes)' : 'Presentes (Asistieron)'}
                    value={agg.totalPresentes.toLocaleString()}
                    sub={`${agg.tasaGlobal}% tasa de asistencia efectiva`}
                    color="#10b981"
                    bg="#ecfdf5"
                />
                <StatCard
                    icon={UserX}
                    label="Ausentes / Inasistencias"
                    value={agg.totalAusentes.toLocaleString()}
                    sub={`${agg.totalPresentes + agg.totalAusentes > 0 ? 100 - agg.tasaGlobal : 0}% inasistencia`}
                    color="#ef4444"
                    bg="#fef2f2"
                />
                <StatCard
                    icon={ClipboardCheck}
                    label="Retorno a Consulta Informe"
                    value={`${agg.tasaRetornoInforme}%`}
                    sub={`${agg.infPresentesCount.toLocaleString()} con Informe vs ${agg.chqPresentesCount.toLocaleString()} con Chequeo`}
                    color="#8b5cf6"
                    bg="#f5f3ff"
                />
                <StatCard
                    icon={Clock}
                    label="Demora Promedio al Informe"
                    value={agg.avgDiasAlInforme > 0 ? `${agg.avgDiasAlInforme} días` : `${agg.totalPendientes} pend.`}
                    sub={agg.avgDiasAlInforme > 0 ? `Entre Chequeo y Consulta Informe (${agg.totalPendientes} futuros)` : 'Turnos futuros agendados'}
                    color="#f59e0b"
                    bg="#fffbeb"
                />
            </div>

            {/* Scrollable */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Gráfico 1: Si estamos en comparativa mostramos Chequeo vs Informe; si no, Asistencia por Mes */}
                {tipoConsulta === 'comparativa' ? (
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ClipboardCheck size={18} color="#0284c7" /> Comparativa Mensual: Chequeos Realizados vs. Consultas de Informe ((CHQ) CHEQUEO INFORME)
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 16px 0' }}>
                            Compara mes a mes cuántos pacientes realizaron su <strong style={{ color: '#10b981' }}>Chequeo Preventivo</strong> frente a cuántos asistieron a la <strong style={{ color: '#0284c7' }}>Consulta de Devolución del Informe</strong>.
                        </p>
                        {agg.months.length > 0 ? (
                            <div style={{ height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={agg.months} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 30px rgba(0,0,0,.08)' }} />
                                        <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
                                        <Bar dataKey="chqPresentes" name="Chequeos Realizados (Presentes)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={34} />
                                        <Bar dataKey="infPresentes" name="Consultas de Informe Realizadas (Presentes)" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={34} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos</div>
                        )}
                    </div>
                ) : (
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={18} color="#0284c7" />
                            {tipoConsulta === 'informe'
                                ? 'Asistencia Mensual a Consultas de Informe ((CHQ) CHEQUEO INFORME)'
                                : 'Asistencia Mensual a Chequeos Preventivos ((CHQ) CHEQUEO PREVENTIVO)'}
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 16px 0', maxWidth: '680px' }}>
                            Desglosa el volumen mensual en: <strong style={{color: '#10b981'}}>Presentes</strong> (asistieron a ver su informe), <strong style={{color: '#ef4444'}}>Ausentes</strong> (faltaron a la cita), y <strong style={{color: '#f59e0b'}}>Pendientes</strong> (turnos futuros agendados).
                        </p>
                        {agg.months.length > 0 ? (
                            <div style={{ height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={agg.months} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}
                                            formatter={(value, name) => [value, name === 'presentes' ? '✅ Presentes' : name === 'ausentes' ? '❌ Ausentes' : '⏳ Pendientes']}
                                            labelFormatter={l => agg.months.find(m => m.label === l)?.labelFull || l}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} formatter={v => v === 'presentes' ? 'Presentes' : v === 'ausentes' ? 'Ausentes' : 'Pendientes'} />
                                        <ReferenceLine y={avgAgendados} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: `Promedio Mensual: ${avgAgendados}`, fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                                        <Bar dataKey="presentes" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="ausentes" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                                        <Bar dataKey="pendientes" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos</div>
                        )}
                    </div>
                )}

                {/* Comparativa Interanual YoY */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} color={yoyMode === 'asistidos' ? '#10b981' : yoyMode === 'ausentes' ? '#ef4444' : '#0284c7'} />
                                Comparativa Interanual 2024–2026 ({tipoConsulta === 'informe' ? 'Consultas de Informe' : tipoConsulta === 'preventivo' ? 'Chequeos Preventivos' : 'Total Circuito'})
                            </h3>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0 0', maxWidth: '580px' }}>
                                Evolución mes a mes entre los años 2024, 2025 y 2026 (independiente del filtro de fechas superior).
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                            {[
                                { id: 'agendados', label: 'Turnos Agendados', color: '#0284c7' },
                                { id: 'asistidos', label: 'Turnos Asistidos (Presentes)', color: '#10b981' },
                                { id: 'ausentes', label: 'Turnos Ausentes', color: '#ef4444' },
                            ].map(b => (
                                <button
                                    key={b.id}
                                    onClick={() => setYoyMode(b.id)}
                                    style={{
                                        padding: '6px 13px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                        fontSize: '0.76rem', fontWeight: 700, transition: 'all .15s',
                                        background: yoyMode === b.id ? b.color : 'transparent',
                                        color: yoyMode === b.id ? '#fff' : '#64748b',
                                    }}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {yoyData.length > 0 ? (
                        <div style={{ height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={yoyData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}
                                        itemStyle={{ fontSize: '0.85rem', fontWeight: 600 }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
                                    {[...years].reverse().map((year, i) => (
                                        <Line key={year} type="monotone" dataKey={year} name={`Año ${year}`} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos</div>
                    )}
                </div>

                {/* Tasa de Asistencia + Rangos Etarios + Obras Sociales */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    {/* Tasa trend */}
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                            Tasa de Asistencia Mensual (%)
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 16px 0' }}>
                            Porcentaje de pacientes que asistieron sobre el total de turnos resueltos.
                        </p>
                        {agg.months.length > 0 ? (
                            <ResponsiveContainer width="100%" height={230}>
                                <ComposedChart data={agg.months} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <defs>
                                        <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,.12)' }}
                                        formatter={v => [`${v}%`, 'Tasa Asistencia']}
                                        labelFormatter={l => agg.months.find(m => m.label === l)?.labelFull || l}
                                    />
                                    <Area dataKey="tasaAsistencia" fill="url(#rateGrad)" stroke="none" />
                                    <Line dataKey="tasaAsistencia" stroke="#059669" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6, fill: '#059669' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos</div>
                        )}
                    </div>

                    {/* Rangos Etarios Pie */}
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={18} color="#ec4899" /> Distribución por Rangos Etarios
                        </h3>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 14px 0' }}>
                            Clasificación por edades de pacientes con asistencia presente.
                        </p>
                        {agg.ageDistribution.length > 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                                <div style={{ position: 'relative', height: '165px', flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={agg.ageDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value" stroke="none">
                                                {agg.ageDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip formatter={v => [`${v} turnos`, 'Presentes']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>{agg.totalPresentes}</div>
                                        <div style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 700 }}>PRESENTES</div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    {agg.ageDistribution.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', background: '#f8fafc', padding: '5px 8px', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <div style={{ width: 9, height: 9, borderRadius: 3, background: item.color, flexShrink: 0 }} />
                                                <span style={{ color: '#475569', fontWeight: 600 }}>{item.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 800, color: '#1e293b' }}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos de edad</div>}
                    </div>

                    {/* Obra Social Pie + Sedes */}
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                            Top Obras Sociales y Sedes
                        </h3>
                        {agg.topSedes.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                {agg.topSedes.map((s, idx) => (
                                    <span key={idx} style={{ fontSize: '0.72rem', fontWeight: 700, background: '#eff6ff', color: '#0369a1', padding: '4px 10px', borderRadius: '999px' }}>
                                        📍 {s.name}: {s.value.toLocaleString()} pres.
                                    </span>
                                ))}
                            </div>
                        )}
                        {agg.topOS.length > 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                                <div style={{ position: 'relative', height: '150px', flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={agg.topOS} cx="50%" cy="50%" innerRadius={46} outerRadius={68} paddingAngle={2} dataKey="value" stroke="none">
                                                {agg.topOS.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip formatter={v => [`${v} turnos`, 'Cantidad']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto' }}>
                                    {agg.topOS.map((os, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                <div style={{ width: 9, height: 9, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                                                <span style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{os.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{os.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos</div>}
                    </div>
                </div>

                {/* Top Médicos */}
                {agg.topMedicos.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Building2 size={18} color="#0284c7" />
                            {tipoConsulta === 'informe'
                                ? `Médicos que entregan Informes de Chequeo (${agg.topMedicos.length})`
                                : `Médicos / Responsables por Turnos (${agg.topMedicos.length})`}
                        </h3>
                        <div style={{ maxHeight: '380px', overflowY: 'auto', paddingRight: '6px' }}>
                            <div style={{ height: Math.max(200, agg.topMedicos.length * 34) }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={agg.topMedicos} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={210} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={v => [`${v} consultas presentes`]} />
                                        <Bar dataKey="value" fill="#0284c7" radius={[0, 4, 4, 0]} maxBarSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabla Detalle */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#334155' }}>
                            Detalle Mes a Mes — {tipoConsulta === 'informe' ? 'Consultas de Informe ((CHQ) CHEQUEO INFORME)' : tipoConsulta === 'preventivo' ? 'Chequeos Preventivos' : 'Comparativa Chequeo vs. Informe'} ({agg.months.length} meses)
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Consolidado mensual de turnos agendados, asistencias presentes e inasistencias.
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    {(tipoConsulta === 'comparativa'
                                        ? ['Mes', 'Chequeos Pres.', 'Informes Agendados', 'Informes Presentes', 'Informes Ausentes', '% Retorno a Informe']
                                        : ['Mes', 'Agendados', 'Presentes', 'Ausentes', 'Pendientes', 'Tasa Asistencia']
                                    ).map(h => (
                                        <th key={h} style={{
                                            padding: '10px 16px', textAlign: h === 'Mes' ? 'left' : 'right',
                                            fontWeight: 700, color: '#64748b', fontSize: '0.72rem',
                                            textTransform: 'uppercase', letterSpacing: '0.5px',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...agg.months].reverse().map((m, idx) => (
                                    <tr key={m.month} style={{
                                        borderBottom: '1px solid #f8fafc',
                                        background: idx % 2 === 0 ? '#fff' : '#fafbfc',
                                    }}>
                                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b' }}>{m.labelFull}</td>
                                        {tipoConsulta === 'comparativa' ? (
                                            <>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{m.chqPresentes}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>{m.infAgendados}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#0284c7', fontWeight: 700 }}>{m.infPresentes}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{m.infAusentes}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                                    <span style={{
                                                        padding: '2px 10px', borderRadius: '10px', fontSize: '0.76rem', fontWeight: 700,
                                                        background: '#e0f2fe', color: '#0369a1',
                                                    }}>{m.tasaRetornoMes}%</span>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>{m.agendados}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{m.presentes}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{m.ausentes}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{m.pendientes}</td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                                    <span style={{
                                                        padding: '2px 10px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700,
                                                        background: m.tasaAsistencia >= 70 ? '#ecfdf5' : m.tasaAsistencia >= 40 ? '#fffbeb' : '#fef2f2',
                                                        color: m.tasaAsistencia >= 70 ? '#059669' : m.tasaAsistencia >= 40 ? '#d97706' : '#dc2626',
                                                    }}>{m.tasaAsistencia}%</span>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#1e293b' }}>TOTAL</td>
                                    {tipoConsulta === 'comparativa' ? (
                                        <>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{agg.chqPresentesCount}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#64748b' }}>{agg.infAgendadosCount}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0284c7' }}>{agg.infPresentesCount}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{agg.months.reduce((s, m) => s + m.infAusentes, 0)}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <span style={{ padding: '3px 12px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800, background: '#e0f2fe', color: '#0369a1' }}>
                                                    {agg.tasaRetornoInforme}%
                                                </span>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0284c7' }}>{agg.total}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{agg.totalPresentes}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{agg.totalAusentes}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#f59e0b' }}>{agg.totalPendientes}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <span style={{
                                                    padding: '3px 12px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800,
                                                    background: '#ecfdf5', color: '#059669',
                                                }}>{agg.tasaGlobal}%</span>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
