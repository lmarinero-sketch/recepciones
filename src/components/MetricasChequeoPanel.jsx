import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, TrendingUp, Users, Calendar, Loader2, RefreshCw,
    ArrowUpRight, ArrowDownRight, Minus, Building2, Activity, CalendarCheck,
    FileText, ClipboardCheck, Clock, UserCheck
} from 'lucide-react';
import {
    ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { fetchChequeoMetrics, fetchMarketingCandidates } from '../services/visitasService';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORS = ['#0284c7', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#64748b'];

function isInformeVisit(v) {
    const tv = String(v.tipo_visita || '').toUpperCase();
    return tv.includes('INFORME') || tv.includes('CHQ INF');
}

function aggregateData(data, selectedYear, viewType = 'comparativa') {
    const byMonth = {};
    const uniqueChqAll = new Set();
    const uniqueChqPresentes = new Set();
    const uniqueInfAll = new Set();
    const uniqueInfPresentes = new Set();
    const obraSocialCounts = {};
    const medicoInfCounts = {};
    const centroInfCounts = {};

    // Para calcular demora promedio en días entre Chequeo Preventivo y Consulta de Informe por DNI
    const firstChqDateByDni = {};
    const firstInfDateByDni = {};

    const hoy = new Date().toISOString().split('T')[0];

    data.forEach(v => {
        if (!v.fecha) return;
        const dni = (v.dni || v.paciente || '').toString().trim();
        if (!dni) return;
        if (selectedYear !== 'todos' && !v.fecha.startsWith(selectedYear)) return;

        const isInf = isInformeVisit(v);
        const asis = v.asistencia || (v.fecha < hoy ? 'Ausente' : null);
        const month = v.fecha.substring(0, 7);

        if (!byMonth[month]) {
            byMonth[month] = {
                chqDnis: new Set(),
                chqPresentes: new Set(),
                chqAusentes: new Set(),
                infDnis: new Set(),
                infPresentes: new Set(),
                infAusentes: new Set(),
            };
        }

        if (isInf) {
            uniqueInfAll.add(dni);
            byMonth[month].infDnis.add(dni);
            if (asis === 'Presente') {
                byMonth[month].infPresentes.add(dni);
                uniqueInfPresentes.add(dni);
                if (!firstInfDateByDni[dni] || v.fecha > firstInfDateByDni[dni]) {
                    firstInfDateByDni[dni] = v.fecha;
                }
                if (v.medico) {
                    medicoInfCounts[v.medico] = (medicoInfCounts[v.medico] || 0) + 1;
                }
                const c = v.centro || 'Sin Sede';
                centroInfCounts[c] = (centroInfCounts[c] || 0) + 1;
            } else if (asis && asis.toLowerCase().includes('ausen')) {
                byMonth[month].infAusentes.add(dni);
            }
        } else {
            uniqueChqAll.add(dni);
            byMonth[month].chqDnis.add(dni);
            if (asis === 'Presente') {
                byMonth[month].chqPresentes.add(dni);
                uniqueChqPresentes.add(dni);
                if (!firstChqDateByDni[dni] || v.fecha < firstChqDateByDni[dni]) {
                    firstChqDateByDni[dni] = v.fecha;
                }
            } else if (asis && asis.toLowerCase().includes('ausen')) {
                byMonth[month].chqAusentes.add(dni);
            }
        }

        // Conteo de Obra Social según la vista activa
        if (asis === 'Presente') {
            if ((viewType === 'informe' && isInf) || (viewType !== 'informe' && !isInf)) {
                const osKey = `${dni}_${isInf ? 'INF' : 'CHQ'}`;
                if (!obraSocialCounts._seen) obraSocialCounts._seen = new Set();
                if (!obraSocialCounts._seen.has(osKey)) {
                    obraSocialCounts._seen.add(osKey);
                    const os = v.obra_social || 'Particular/Sin OS';
                    obraSocialCounts[os] = (obraSocialCounts[os] || 0) + 1;
                }
            }
        }
    });

    delete obraSocialCounts._seen;

    // Calcular cuántos pacientes con Chequeo Presente asistieron también a Consulta de Informe
    let pacientesConAmbos = 0;
    let totalDiasDemora = 0;
    let countConDemoraValida = 0;

    uniqueChqPresentes.forEach(dni => {
        if (uniqueInfPresentes.has(dni)) {
            pacientesConAmbos++;
            const fChq = firstChqDateByDni[dni];
            const fInf = firstInfDateByDni[dni];
            if (fChq && fInf && fInf >= fChq) {
                const diff = Math.round((new Date(fInf + 'T12:00:00') - new Date(fChq + 'T12:00:00')) / (1000 * 60 * 60 * 24));
                if (diff >= 0 && diff <= 120) {
                    totalDiasDemora += diff;
                    countConDemoraValida++;
                }
            }
        }
    });

    const avgDiasInforme = countConDemoraValida > 0 ? Math.round(totalDiasDemora / countConDemoraValida) : 0;
    const tasaRetornoInforme = uniqueChqPresentes.size > 0
        ? Math.round((uniqueInfPresentes.size / uniqueChqPresentes.size) * 100)
        : 0;

    const months = Object.keys(byMonth).sort();
    const result = months.map((m, idx) => {
        const prev = idx > 0 ? byMonth[months[idx - 1]] : null;
        const curr = byMonth[m];

        const chqPres = curr.chqPresentes.size;
        const infPres = curr.infPresentes.size;
        const activeVal = viewType === 'informe' ? infPres : chqPres;
        const prevVal = prev ? (viewType === 'informe' ? prev.infPresentes.size : prev.chqPresentes.size) : 0;
        const change = prev && prevVal > 0 ? ((activeVal - prevVal) / prevVal * 100) : 0;
        const tasaRetornoMes = chqPres > 0 ? Math.round((infPres / chqPres) * 100) : 0;

        const [y, mo] = m.split('-');
        return {
            month: m,
            label: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y.slice(2)}`,
            labelFull: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`,
            year: y,
            agendados: curr.chqDnis.size,
            pacientes: chqPres,
            presentes: chqPres,
            ausentes: curr.chqAusentes.size,
            infAgendados: curr.infDnis.size,
            infPresentes: infPres,
            infAusentes: curr.infAusentes.size,
            tasaRetornoMes,
            change: Math.round(change),
        };
    });

    const sortedOS = Object.entries(obraSocialCounts).sort((a, b) => b[1] - a[1]);
    const topOS = sortedOS.slice(0, 5).map(([name, value]) => ({ name, value }));
    const othersCount = sortedOS.slice(5).reduce((sum, [, count]) => sum + count, 0);
    if (othersCount > 0) topOS.push({ name: 'Otras', value: othersCount });

    const topMedicosInf = Object.entries(medicoInfCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value }));

    const centrosInf = Object.entries(centroInfCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }));

    return {
        months: result,
        uniquePatients: uniqueChqPresentes.size,
        totalAgendados: uniqueChqAll.size,
        uniqueInfPresentes: uniqueInfPresentes.size,
        totalInfAgendados: uniqueInfAll.size,
        pacientesConAmbos,
        tasaRetornoInforme,
        avgDiasInforme,
        topOS,
        topMedicosInf,
        centrosInf,
    };
}

function StatCard({ icon: Icon, label, value, sub, color, bg }) {
    return (
        <div style={{
            background: '#fff', borderRadius: '12px', padding: '16px 18px',
            border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px',
            transition: 'all .2s', cursor: 'default',
        }}>
            <div style={{
                width: '44px', height: '44px', borderRadius: '10px',
                background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                <Icon size={21} color={color} />
            </div>
            <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
                <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>{label}</div>
                {sub && <div style={{ fontSize: '0.69rem', color: color, fontWeight: 700, marginTop: '2px' }}>{sub}</div>}
            </div>
        </div>
    );
}

export default function MetricasChequeoPanel({ addToast }) {
    const [rawData, setRawData] = useState([]);
    const [marketingData, setMarketingData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState('');
    const [selectedYear, setSelectedYear] = useState('todos');
    const [viewType, setViewType] = useState('comparativa'); // 'comparativa' | 'preventivo' | 'informe'

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, mData] = await Promise.all([
                fetchChequeoMetrics((msg) => setProgress(msg)),
                fetchMarketingCandidates()
            ]);
            setRawData(data);
            setMarketingData(mData);
            setProgress('');
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando métricas', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const years = useMemo(() => {
        const ys = new Set();
        rawData.forEach(v => {
            if (v.fecha) ys.add(v.fecha.substring(0, 4));
        });
        return [...ys].sort().reverse();
    }, [rawData]);

    const aggregated = useMemo(() => aggregateData(rawData, selectedYear, viewType), [rawData, selectedYear, viewType]);

    const projectionData = useMemo(() => {
        const now = new Date();
        const data = [];
        const vencidosTotales = marketingData.filter(p => p.meses_desde_ultima >= 12).length;
        const vencidosContactables = marketingData.filter(p => p.meses_desde_ultima >= 12 && p.telefono1).length;
        data.push({
            name: 'Ya Vencidos (Hoy)',
            total: vencidosTotales,
            contactables: vencidosContactables,
        });

        for (let i = 1; i <= 6; i++) {
            const targetMeses = 12 - i;
            const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const label = `${MONTH_NAMES[targetDate.getMonth()]} ${targetDate.getFullYear().toString().slice(2)}`;
            const countTotales = marketingData.filter(p => p.meses_desde_ultima === targetMeses).length;
            const countContactables = marketingData.filter(p => p.meses_desde_ultima === targetMeses && p.telefono1).length;
            data.push({ name: label, total: countTotales, contactables: countContactables });
        }
        return data;
    }, [marketingData]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#94a3b8' }}>
                <Loader2 size={32} className="spin" />
                <span style={{ marginTop: '10px', fontSize: '0.88rem' }}>Cargando estadísticas de chequeos e informes...</span>
                {progress && <span style={{ marginTop: '4px', fontSize: '0.78rem', color: '#0284c7' }}>{progress}</span>}
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{
                        fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: 0,
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '38px', height: '38px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <BarChart3 size={20} color="#fff" />
                        </div>
                        Estadísticas de Chequeos Preventivos y Consultas de Informe
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '4px 0 0 48px', maxWidth: '720px' }}>
                        Seguimiento integral de <strong>(CHQ) CHEQUEO PREVENTIVO</strong> (realización de estudios) y <strong>(CHQ) CHEQUEO INFORME</strong> (consulta médica de devolución de resultados en SALUS).
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Selector de Vista */}
                    <div style={{ display: 'flex', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '3px' }}>
                        {[
                            { id: 'comparativa', label: '🔄 Chequeo vs. Informe' },
                            { id: 'preventivo', label: '🏥 Solo Chequeo Preventivo' },
                            { id: 'informe', label: '📋 Solo Consulta Informe (CHQ INF)' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setViewType(tab.id)}
                                style={{
                                    padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    fontSize: '0.76rem', fontWeight: 700, transition: 'all .15s',
                                    background: viewType === tab.id ? '#0284c7' : 'transparent',
                                    color: viewType === tab.id ? '#fff' : '#475569',
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <button onClick={loadData} disabled={loading} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px',
                        cursor: 'pointer', fontSize: '0.78rem', color: '#0f172a', fontWeight: 600,
                    }}>
                        <RefreshCw size={14} /> Actualizar
                    </button>
                </div>
            </div>

            {/* Year Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                    onClick={() => setSelectedYear('todos')}
                    style={{
                        padding: '5px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                        fontSize: '0.76rem', fontWeight: 700,
                        background: selectedYear === 'todos' ? '#0f172a' : '#e2e8f0',
                        color: selectedYear === 'todos' ? '#fff' : '#475569',
                    }}
                >Todos los años</button>
                {years.map(y => (
                    <button key={y} onClick={() => setSelectedYear(y)} style={{
                        padding: '5px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                        fontSize: '0.76rem', fontWeight: 700,
                        background: selectedYear === y ? '#0284c7' : '#e2e8f0',
                        color: selectedYear === y ? '#fff' : '#475569',
                    }}>{y}</button>
                ))}
            </div>

            {/* 5 KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '18px', flexShrink: 0 }}>
                <StatCard
                    icon={Users}
                    label="Chequeos Realizados (Presentes)"
                    value={aggregated.uniquePatients.toLocaleString()}
                    sub={`de ${aggregated.totalAgendados.toLocaleString()} pacientes agendados`}
                    color="#10b981"
                    bg="#ecfdf5"
                />
                <StatCard
                    icon={FileText}
                    label="Consultas de Informe (CHQ INF)"
                    value={aggregated.uniqueInfPresentes.toLocaleString()}
                    sub={`Presentes de ${aggregated.totalInfAgendados.toLocaleString()} agendados`}
                    color="#0284c7"
                    bg="#e0f2fe"
                />
                <StatCard
                    icon={ClipboardCheck}
                    label="Tasa de Retorno a Informe"
                    value={`${aggregated.tasaRetornoInforme}%`}
                    sub={`${aggregated.uniqueInfPresentes.toLocaleString()} vieron su informe médico`}
                    color="#8b5cf6"
                    bg="#f5f3ff"
                />
                <StatCard
                    icon={Clock}
                    label="Demora Promedio al Informe"
                    value={aggregated.avgDiasInforme > 0 ? `${aggregated.avgDiasInforme} días` : '—'}
                    sub="Entre el Chequeo y la Consulta Informe"
                    color="#f59e0b"
                    bg="#fffbeb"
                />
                <StatCard
                    icon={Building2}
                    label="Sedes de Informe (Presentes)"
                    value={aggregated.centrosInf.map(c => `${c.name.includes('SAN LUIS') ? 'San Luis' : 'Sta Fe'}: ${c.value}`).join(' · ') || '—'}
                    sub="Distribución por sede de devolución"
                    color="#0f766e"
                    bg="#ccfbf1"
                />
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '18px' }}>
                    {/* Main Monthly Comparison Chart */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                                    {viewType === 'informe'
                                        ? 'Evolución Mensual de Consultas de Informe ((CHQ) CHEQUEO INFORME)'
                                        : viewType === 'preventivo'
                                            ? 'Evolución Mensual de Chequeos Preventivos Realizados'
                                            : 'Comparativa Mensual: Chequeos Realizados vs. Consultas de Informe (Presentes)'}
                                </h3>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '3px 0 0 0' }}>
                                    Pacientes únicos con asistencia <strong>Presente</strong> en cada etapa del circuito preventivo.
                                </p>
                            </div>
                        </div>

                        {aggregated.months.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <ComposedChart data={aggregated.months} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                                    {viewType !== 'informe' && (
                                        <Bar dataKey="pacientes" name="Chequeos Realizados (Presentes)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                    )}
                                    {viewType !== 'preventivo' && (
                                        <Bar dataKey="infPresentes" name="Consultas de Informe (Presentes)" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={32} />
                                    )}
                                    {viewType === 'informe' && (
                                        <Bar dataKey="infAusentes" name="Ausentes a Informe" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={24} />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                Sin datos para el período seleccionado
                            </div>
                        )}
                    </div>

                    {/* Top Médicos de Informe / Top Obras Sociales */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                            {viewType === 'preventivo' ? 'Top Obras Sociales (Chequeo)' : 'Médicos — Consultas de Informe'}
                        </h3>
                        <p style={{ fontSize: '0.73rem', color: '#64748b', margin: '0 0 14px 0' }}>
                            {viewType === 'preventivo'
                                ? 'Distribución por cobertura médica'
                                : 'Profesionales con mayor volumen de entregas de informe ((CHQ) CHEQUEO INFORME Presente)'}
                        </p>

                        {viewType !== 'preventivo' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
                                {aggregated.topMedicosInf.map((m, idx) => {
                                    const maxVal = aggregated.topMedicosInf[0]?.value || 1;
                                    const pct = Math.round((m.value / maxVal) * 100);
                                    return (
                                        <div key={idx}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '210px' }}>{m.name}</span>
                                                <span style={{ fontWeight: 800, color: '#0284c7' }}>{m.value.toLocaleString()} inf.</span>
                                            </div>
                                            <div style={{ width: '100%', height: '7px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: '#0284c7', borderRadius: '4px' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
                                {aggregated.topOS.map((os, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[idx % COLORS.length], flexShrink: 0 }} />
                                            <span style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{os.name}</span>
                                        </div>
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{os.value.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Proyección de Marketing */}
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={18} color="#f59e0b" />
                            Proyección de Renovación Anual de Chequeos (Marketing)
                        </h3>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            Pacientes que cumplen 12 meses desde su último chequeo preventivo
                        </span>
                    </div>
                    <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={projectionData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                                <Bar dataKey="total" name="Total Pacientes que vencen" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="contactables" name="Contactables (Con Teléfono)" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Monthly Table including Consultas de Informe */}
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#334155' }}>
                            Detalle Mensual: Chequeos Preventivos y Consultas de Informe ({aggregated.months.length} meses)
                        </h3>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                            Comparativa mes a mes entre estudios realizados y devolución médica del informe
                        </span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    {[
                                        'Mes',
                                        'CHQ Agendados',
                                        'CHQ Realizados (Pres.)',
                                        'Informes Agendados',
                                        'Informes Realizados (Pres.)',
                                        'Informes Ausentes',
                                        '% Retorno a Informe',
                                    ].map(h => (
                                        <th key={h} style={{
                                            padding: '10px 14px', textAlign: h === 'Mes' ? 'left' : 'right',
                                            fontWeight: 700, color: '#64748b', fontSize: '0.71rem',
                                            textTransform: 'uppercase', letterSpacing: '0.4px',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...aggregated.months].reverse().map((m, idx) => (
                                    <tr key={m.month} style={{
                                        borderBottom: '1px solid #f8fafc',
                                        background: idx % 2 === 0 ? '#fff' : '#fafbfc',
                                    }}>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{m.labelFull}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>{m.agendados.toLocaleString()}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{m.presentes.toLocaleString()}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>{m.infAgendados.toLocaleString()}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>{m.infPresentes.toLocaleString()}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#ef4444' }}>{m.infAusentes.toLocaleString()}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '999px', fontSize: '0.73rem', fontWeight: 700,
                                                background: m.tasaRetornoMes >= 35 ? '#e0f2fe' : '#f1f5f9',
                                                color: m.tasaRetornoMes >= 35 ? '#0369a1' : '#475569',
                                            }}>
                                                {m.tasaRetornoMes}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0f172a' }}>TOTAL</td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>
                                        {aggregated.totalAgendados.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                                        {aggregated.uniquePatients.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>
                                        {aggregated.totalInfAgendados.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0284c7' }}>
                                        {aggregated.uniqueInfPresentes.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                                        {aggregated.months.reduce((s, m) => s + m.infAusentes, 0).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0369a1' }}>
                                        {aggregated.tasaRetornoInforme}%
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
