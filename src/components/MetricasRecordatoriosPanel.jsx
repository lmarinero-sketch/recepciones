import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, TrendingUp, Users, Calendar, Loader2, RefreshCw,
    ArrowUpRight, ArrowDownRight, Minus, Building2, UserCheck, UserX,
    CalendarDays, Bell, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import {
    ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, PieChart, Pie, Cell, Legend, ReferenceLine
} from 'recharts';
import { fetchRecordatoriosMetrics } from '../services/recordatoriosService';

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const COLORS = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ec4899','#64748b'];

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

function StatCard({ icon: Icon, label, value, sub, color, bg }) {
    return (
        <div style={{
            background: '#fff', borderRadius: '14px', padding: '18px 20px',
            border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px',
            transition: 'all .2s', cursor: 'default',
        }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.06)'; e.currentTarget.style.borderColor = color + '40'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
        >
            <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                <Icon size={22} color={color} />
            </div>
            <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>{value}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.68rem', color: color, fontWeight: 600, marginTop: '1px' }}>{sub}</div>}
            </div>
        </div>
    );
}

function aggregate(data, fechaDesde, fechaHasta, filtroEdad = 'todos') {
    const byMonth = {};
    const osCounts = {};
    const medicoCounts = {};
    const ageCounts = {
        '14 - 18': 0,
        '19 - 50': 0,
        '51 - 65': 0,
        '66+': 0,
        'Sin Dato': 0,
    };
    let totalPresentes = 0, totalAusentes = 0, totalPendientes = 0;
    let filteredCount = 0;

    // Agrupar registros por Visita Única de Paciente (DNI + Fecha) para no duplicar prácticas (Lab, Eco, etc.)
    const uniqueVisitsMap = new Map();
    data.forEach(r => {
        if (!r.fecha) return;
        if (fechaDesde && r.fecha < fechaDesde) return;
        if (fechaHasta && r.fecha > fechaHasta) return;

        // Filtro por rango etario
        if (filtroEdad !== 'todos') {
            const age = r.edad !== null && r.edad !== undefined && r.edad !== '' ? parseInt(r.edad, 10) : null;
            if (age === null || isNaN(age)) return;
            if (filtroEdad === '14-18' && (age < 14 || age > 18)) return;
            if (filtroEdad === '19-50' && (age < 19 || age > 50)) return;
            if (filtroEdad === '51-65' && (age < 51 || age > 65)) return;
            if (filtroEdad === '66+' && age < 66) return;
        }

        const key = `${r.dni || r.paciente}_${r.fecha}`;
        if (!uniqueVisitsMap.has(key)) {
            uniqueVisitsMap.set(key, { ...r });
        } else {
            const existing = uniqueVisitsMap.get(key);
            if (r.asistencia_efectiva === 'Presente') {
                existing.asistencia_efectiva = 'Presente';
            }
        }
    });

    const uniqueVisits = Array.from(uniqueVisitsMap.values());

    uniqueVisits.forEach(r => {
        filteredCount++;
        const asis = r.asistencia_efectiva;
        const isAusente = asis === 'Ausente' || asis === 'Ausencia justificada' || asis === 'Ausencia injustificada' || asis === 'Anulación Cita Online';

        if (asis === 'Presente') totalPresentes++;
        else if (isAusente) totalAusentes++;
        else totalPendientes++;

        const month = r.fecha.substring(0, 7);
        if (!byMonth[month]) byMonth[month] = { agendados: 0, presentes: 0, ausentes: 0, pendientes: 0 };
        byMonth[month].agendados++;
        if (asis === 'Presente') byMonth[month].presentes++;
        else if (isAusente) byMonth[month].ausentes++;
        else byMonth[month].pendientes++;

        // Contar Obras Sociales, Médicos y Rangos Etarios SOLAMENTE para turnos con Asistencia === 'Presente'
        if (asis === 'Presente') {
            const os = r.obra_social || 'Particular/Sin OS';
            osCounts[os] = (osCounts[os] || 0) + 1;

            if (r.medico && !isExcludedMedico(r.medico)) {
                medicoCounts[r.medico] = (medicoCounts[r.medico] || 0) + 1;
            }

            // Conteo por rango etario (Solo pacientes con Asistencia Presente, excluyendo menores de 14 años por especificación médica)
            if (r.edad !== null && r.edad !== undefined && r.edad !== '') {
                const age = parseInt(r.edad, 10);
                if (!isNaN(age)) {
                    if (age >= 14 && age <= 18) ageCounts['14 - 18']++;
                    else if (age >= 19 && age <= 50) ageCounts['19 - 50']++;
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

    const months = Object.keys(byMonth).sort().map((m, idx, arr) => {
        const curr = byMonth[m];
        const tasaAsistencia = curr.agendados > 0 ? Math.round((curr.presentes / (curr.presentes + curr.ausentes || 1)) * 100) : 0;
        const [y, mo] = m.split('-');
        return {
            month: m,
            label: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y.slice(2)}`,
            labelFull: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`,
            ...curr, tasaAsistencia,
        };
    });

    const topOS = Object.entries(osCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
    const othersOS = Object.entries(osCounts).sort((a, b) => b[1] - a[1]).slice(5).reduce((s, [, c]) => s + c, 0);
    if (othersOS > 0) topOS.push({ name: 'Otras', value: othersOS });

    const topMedicos = Object.entries(medicoCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

    const AGE_COLORS = {
        '14 - 18': '#3b82f6',
        '19 - 50': '#10b981',
        '51 - 65': '#f59e0b',
        '66+': '#8b5cf6',
        'Sin Dato': '#cbd5e1',
    };

    const ageDistribution = Object.entries(ageCounts)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({ name, value, color: AGE_COLORS[name] || '#64748b' }));

    const tasaGlobal = (totalPresentes + totalAusentes) > 0
        ? Math.round((totalPresentes / (totalPresentes + totalAusentes)) * 100) : 0;

    return { months, topOS, topMedicos, ageDistribution, totalPresentes, totalAusentes, totalPendientes, total: filteredCount, tasaGlobal };
}

function aggregateYoY(data, modo = 'agendados') {
    const byMonth = {};
    const uniqueVisitsMap = new Map();
    
    // Filtramos únicas por paciente+fecha
    data.forEach(r => {
        if (!r.fecha) return;
        const key = `${r.dni || r.paciente}_${r.fecha}`;
        if (!uniqueVisitsMap.has(key)) {
            uniqueVisitsMap.set(key, { ...r });
        } else {
            const existing = uniqueVisitsMap.get(key);
            if (r.asistencia_efectiva === 'Presente') {
                existing.asistencia_efectiva = 'Presente';
            }
        }
    });

    // Agrupamos por mes y año según el modo seleccionado
    Array.from(uniqueVisitsMap.values()).forEach(r => {
        const asis = r.asistencia_efectiva;
        const isAusente = asis === 'Ausente' || asis === 'Ausencia justificada' || asis === 'Ausencia injustificada' || asis === 'Anulación Cita Online';

        if (modo === 'asistidos' && asis !== 'Presente') return;
        if (modo === 'ausentes' && !isAusente) return;

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
    const [yoyMode, setYoyMode] = useState('agendados'); // agendados | asistidos | ausentes

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchRecordatoriosMetrics(msg => setProgress(msg));
            setRawData(data);
            setProgress('');
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando métricas de recordatorios', 'error');
        } finally { setLoading(false); }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // Extraer años disponibles
    const years = useMemo(() => {
        const ys = new Set();
        rawData.forEach(v => {
            if (v.fecha) ys.add(v.fecha.substring(0, 4));
        });
        return [...ys].sort().reverse();
    }, [rawData]);

    const agg = useMemo(() => aggregate(rawData, fechaDesde, fechaHasta, filtroEdad), [rawData, fechaDesde, fechaHasta, filtroEdad]);
    const yoyData = useMemo(() => aggregateYoY(rawData, yoyMode), [rawData, yoyMode]); // YoY con filtro por estado
    
    const avgAgendados = useMemo(() => {
        return agg.months.length > 0 ? Math.round(agg.total / agg.months.length) : 0;
    }, [agg.total, agg.months.length]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#94a3b8' }}>
                <Loader2 size={32} className="spin" />
                <span style={{ marginTop: '10px', fontSize: '0.88rem' }}>Cargando métricas...</span>
                {progress && <span style={{ marginTop: '4px', fontSize: '0.78rem', color: '#f59e0b' }}>{progress}</span>}
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexShrink: 0 }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <BarChart3 size={20} color="#fff" />
                        </div>
                        Métricas de Recordatorios
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px', maxWidth: '600px', lineHeight: 1.5 }}>
                        Analiza la efectividad del sistema comparando la <strong>Asistencia Real</strong> frente a todos los turnos dados. Te ayuda a entender cuántos pacientes efectivamente acuden a su cita después de recibir el recordatorio.
                    </p>
                </div>
                <button onClick={loadData} disabled={loading} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                    background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                    cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600,
                }}><RefreshCw size={14} /> Actualizar</button>
            </div>

            {/* Date & Age Filters */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Desde:</span>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={{
                        padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '0.8rem', background: '#fff'
                    }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Hasta:</span>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={{
                        padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '0.8rem', background: '#fff'
                    }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Rango Etario:</span>
                    <select
                        value={filtroEdad}
                        onChange={e => setFiltroEdad(e.target.value)}
                        style={{
                            padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                            color: '#1e293b', fontSize: '0.8rem', background: '#fff', fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        <option value="todos">Todos los rangos (≥ 14 años)</option>
                        <option value="14-18">14 - 18 años</option>
                        <option value="19-50">19 - 50 años</option>
                        <option value="51-65">51 - 65 años</option>
                        <option value="66+">66 en adelante (66+ años)</option>
                    </select>
                </div>
                <button onClick={() => {
                    const prev = getPreviousMonthRange();
                    setFechaDesde(prev.fechaDesde);
                    setFechaHasta(prev.fechaHasta);
                    setFiltroEdad('todos');
                }} style={{
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                }}>Mes anterior (Por defecto)</button>
                {(fechaDesde || fechaHasta || filtroEdad !== 'todos') && (
                    <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroEdad('todos'); }} style={{
                        padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#fef2f2', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                    }}>Ver todo / Limpiar</button>
                )}
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px', flexShrink: 0 }}>
                <StatCard icon={CalendarDays} label="Total Turnos" value={agg.total.toLocaleString()} color="#3b82f6" bg="#eff6ff" />
                <StatCard icon={UserCheck} label="Presentes" value={agg.totalPresentes.toLocaleString()} sub={`${agg.tasaGlobal}% tasa de asistencia`} color="#10b981" bg="#ecfdf5" />
                <StatCard icon={UserX} label="Ausentes" value={agg.totalAusentes.toLocaleString()} sub={`${100 - agg.tasaGlobal}% inasistencia`} color="#ef4444" bg="#fef2f2" />
                <StatCard icon={Clock} label="Pendientes (Futuros)" value={agg.totalPendientes.toLocaleString()} color="#f59e0b" bg="#fffbeb" />
                <StatCard icon={Calendar} label="Meses con Datos" value={agg.months.length} color="#8b5cf6" bg="#f5f3ff" />
            </div>

            {/* Scrollable */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Asistencia por Mes — Stacked Bar */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={18} color="#f59e0b" /> Asistencia por Mes
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 16px 0', maxWidth: '600px' }}>
                        Desglosa el volumen total de turnos agendados por mes en tres estados: <strong style={{color: '#10b981'}}>Presentes</strong> (cumplieron), <strong style={{color: '#ef4444'}}>Ausentes</strong> (faltaron), y <strong style={{color: '#f59e0b'}}>Pendientes</strong> (citas futuras o sin resolver).
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
                                    <ReferenceLine y={avgAgendados} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: `Promedio Total: ${avgAgendados}`, fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
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

                {/* Comparativa Interanual YoY */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={18} color={yoyMode === 'asistidos' ? '#10b981' : yoyMode === 'ausentes' ? '#ef4444' : '#3b82f6'} />
                                Comparativa Interanual ({yoyMode === 'asistidos' ? 'Turnos Asistidos / Presentes' : yoyMode === 'ausentes' ? 'Turnos Ausentes' : 'Volumen de Turnos Agendados'})
                            </h3>
                            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0 0', maxWidth: '550px' }}>
                                {yoyMode === 'asistidos'
                                    ? 'Analiza la cantidad de pacientes que asistieron de manera efectiva (Presentes) mes a mes entre los diferentes años.'
                                    : yoyMode === 'ausentes'
                                    ? 'Analiza la cantidad de inasistencias o ausencias registradas mes a mes entre los diferentes años.'
                                    : 'Analiza el volumen total de turnos agendados mes a mes entre los diferentes años.'}
                            </p>
                        </div>

                        {/* Botones de Selección */}
                        <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                            <button
                                onClick={() => setYoyMode('agendados')}
                                style={{
                                    padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                    fontSize: '0.78rem', fontWeight: 700, transition: 'all .15s',
                                    background: yoyMode === 'agendados' ? '#3b82f6' : 'transparent',
                                    color: yoyMode === 'agendados' ? '#fff' : '#64748b',
                                    boxShadow: yoyMode === 'agendados' ? '0 2px 6px rgba(59,130,246,.3)' : 'none',
                                }}
                            >
                                Turnos Agendados
                            </button>
                            <button
                                onClick={() => setYoyMode('asistidos')}
                                style={{
                                    padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                    fontSize: '0.78rem', fontWeight: 700, transition: 'all .15s',
                                    background: yoyMode === 'asistidos' ? '#10b981' : 'transparent',
                                    color: yoyMode === 'asistidos' ? '#fff' : '#64748b',
                                    boxShadow: yoyMode === 'asistidos' ? '0 2px 6px rgba(16,185,129,.3)' : 'none',
                                }}
                            >
                                Turnos Asistidos
                            </button>
                            <button
                                onClick={() => setYoyMode('ausentes')}
                                style={{
                                    padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                    fontSize: '0.78rem', fontWeight: 700, transition: 'all .15s',
                                    background: yoyMode === 'ausentes' ? '#ef4444' : 'transparent',
                                    color: yoyMode === 'ausentes' ? '#fff' : '#64748b',
                                    boxShadow: yoyMode === 'ausentes' ? '0 2px 6px rgba(239,68,68,.3)' : 'none',
                                }}
                            >
                                Turnos Ausentes
                            </button>
                        </div>
                    </div>
                    {yoyData.length > 0 ? (
                        <div style={{ height: 300 }}>
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
                        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos</div>
                    )}
                </div>

                {/* Tasa de Asistencia Trend + Obra Social Pie */}
                <div style={{ display: 'flex', gap: '20px' }}>
                    {/* Tasa trend */}
                    <div style={{ flex: 2, background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                            Tasa de Asistencia por Mes (%)
                        </h3>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 16px 0' }}>
                            Evolución del porcentaje de cumplimiento (Presentes sobre el total de resueltos). 
                        </p>
                        {agg.months.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
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
                            <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos</div>
                        )}
                    </div>

                {/* Row: Distribución Etaria + Obra Social */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Rangos Etarios Pie */}
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={18} color="#ec4899" /> Distribución por Rangos Etarios
                        </h3>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 16px 0' }}>
                            Clasificación por edades de pacientes con asistencia presente.
                        </p>
                        {agg.ageDistribution.length > 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                                <div style={{ position: 'relative', height: '180px', flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={agg.ageDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={78} paddingAngle={3} dataKey="value" stroke="none">
                                                {agg.ageDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip formatter={v => [`${v} turnos`, 'Presentes']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{agg.totalPresentes}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>PRESENTES</div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', overflowY: 'auto' }}>
                                    {agg.ageDistribution.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: 10, height: 10, borderRadius: 3, background: item.color, flexShrink: 0 }} />
                                                <span style={{ color: '#475569', fontWeight: 600 }}>{item.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 800, color: '#1e293b' }}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Sin datos de edad</div>}
                    </div>

                    {/* Obra Social Pie */}
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>Top Obras Sociales</h3>
                        {agg.topOS.length > 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                                <div style={{ position: 'relative', height: '180px', flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={agg.topOS} cx="50%" cy="50%" innerRadius={55} outerRadius={78} paddingAngle={2} dataKey="value" stroke="none">
                                                {agg.topOS.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip formatter={v => [`${v} turnos`, 'Cantidad']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{agg.totalPresentes}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>PRESENTES</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
                                    {agg.topOS.map((os, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
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
                </div>

                {/* Top Médicos */}
                {agg.topMedicos.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Building2 size={18} color="#8b5cf6" /> Médicos / Responsables por Turnos ({agg.topMedicos.length})
                        </h3>
                        <div style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '6px' }}>
                            <div style={{ height: Math.max(220, agg.topMedicos.length * 36) }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={agg.topMedicos} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={180} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={v => [`${v} turnos`]} />
                                        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabla Detalle */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#475569' }}>
                            Detalle Mes a Mes ({agg.months.length} meses)
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Tabla que consolida de forma exacta los totales por estado.
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    {['Mes', 'Agendados', 'Presentes', 'Ausentes', 'Pendientes', 'Tasa Asistencia'].map(h => (
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
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}
                                    >
                                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b' }}>{m.labelFull}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>{m.agendados}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{m.presentes}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{m.ausentes}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{m.pendientes}</td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                            <span style={{
                                                padding: '2px 10px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700,
                                                background: m.tasaAsistencia >= 70 ? '#ecfdf5' : m.tasaAsistencia >= 40 ? '#fffbeb' : '#fef2f2',
                                                color: m.tasaAsistencia >= 70 ? '#059669' : m.tasaAsistencia >= 40 ? '#d97706' : '#dc2626',
                                            }}>{m.tasaAsistencia}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#1e293b' }}>TOTAL</td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#3b82f6' }}>{agg.total}</td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{agg.totalPresentes}</td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{agg.totalAusentes}</td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#f59e0b' }}>{agg.totalPendientes}</td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                        <span style={{
                                            padding: '3px 12px', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 800,
                                            background: '#ecfdf5', color: '#059669',
                                        }}>{agg.tasaGlobal}%</span>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
