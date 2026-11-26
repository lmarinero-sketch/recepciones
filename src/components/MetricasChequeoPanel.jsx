import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, TrendingUp, Users, Building2, FileText, ClipboardCheck,
    Clock, Table2
} from 'lucide-react';
import {
    ComposedChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts';
import { fetchChequeoMetrics, fetchMarketingCandidates } from '../services/visitasService';
import {
    AnalyticsShell, AnalyticsKpiCard, AnalyticsCard, SegmentedControl,
    RefreshButton, AnalyticsLoader, EmptyChartState,
    ANALYTICS_PALETTE, CHART_SERIES_COLORS, TOOLTIP_STYLE, selectInputStyle,
} from './ui/AnalyticsPrimitives';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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
                if (!firstInfDateByDni[dni] || v.fecha > firstInfDateByDni[dni]) firstInfDateByDni[dni] = v.fecha;
                if (v.medico) medicoInfCounts[v.medico] = (medicoInfCounts[v.medico] || 0) + 1;
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
                if (!firstChqDateByDni[dni] || v.fecha < firstChqDateByDni[dni]) firstChqDateByDni[dni] = v.fecha;
            } else if (asis && asis.toLowerCase().includes('ausen')) {
                byMonth[month].chqAusentes.add(dni);
            }
        }

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

    let totalDiasDemora = 0;
    let countConDemoraValida = 0;
    uniqueChqPresentes.forEach(dni => {
        if (uniqueInfPresentes.has(dni)) {
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
    const result = months.map(m => {
        const curr = byMonth[m];
        const chqPres = curr.chqPresentes.size;
        const infPres = curr.infPresentes.size;
        const tasaRetornoMes = chqPres > 0 ? Math.round((infPres / chqPres) * 100) : 0;
        const [y, mo] = m.split('-');
        return {
            month: m,
            label: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y.slice(2)}`,
            labelFull: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`,
            agendados: curr.chqDnis.size,
            pacientes: chqPres,
            presentes: chqPres,
            ausentes: curr.chqAusentes.size,
            infAgendados: curr.infDnis.size,
            infPresentes: infPres,
            infAusentes: curr.infAusentes.size,
            tasaRetornoMes,
        };
    });

    const sortedOS = Object.entries(obraSocialCounts).sort((a, b) => b[1] - a[1]);
    const topOS = sortedOS.slice(0, 6).map(([name, value]) => ({ name, value }));
    const othersCount = sortedOS.slice(6).reduce((sum, [, count]) => sum + count, 0);
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
        tasaRetornoInforme,
        avgDiasInforme,
        topOS,
        topMedicosInf,
        centrosInf,
    };
}

export default function MetricasChequeoPanel({ addToast }) {
    const [rawData, setRawData] = useState([]);
    const [marketingData, setMarketingData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState('');
    const [selectedYear, setSelectedYear] = useState('todos');
    const [viewType, setViewType] = useState('comparativa');
    const [activeTab, setActiveTab] = useState('evolucion'); // 'evolucion' | 'proyeccion' | 'detalle'

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, mData] = await Promise.all([
                fetchChequeoMetrics((msg) => setProgress(msg)),
                fetchMarketingCandidates(),
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
        rawData.forEach(v => { if (v.fecha) ys.add(v.fecha.substring(0, 4)); });
        return [...ys].sort().reverse();
    }, [rawData]);

    const aggregated = useMemo(() => aggregateData(rawData, selectedYear, viewType), [rawData, selectedYear, viewType]);

    const projectionData = useMemo(() => {
        const now = new Date();
        const data = [];
        const vencidosTotales = marketingData.filter(p => p.meses_desde_ultima >= 12).length;
        const vencidosContactables = marketingData.filter(p => p.meses_desde_ultima >= 12 && p.telefono1).length;
        data.push({ name: 'Ya Vencidos', total: vencidosTotales, contactables: vencidosContactables });

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

    return (
        <AnalyticsShell
            icon={BarChart3}
            title="Métricas de Chequeos Preventivos e Informes"
            subtitle="Seguimiento de estudios realizados ((CHQ) CHEQUEO PREVENTIVO), devolución médica ((CHQ) CHEQUEO INFORME) y renovación anual."
            controls={
                <>
                    <SegmentedControl
                        value={viewType}
                        onChange={setViewType}
                        options={[
                            { id: 'comparativa', label: 'Chequeo vs. Informe' },
                            { id: 'preventivo', label: 'Solo Preventivo' },
                            { id: 'informe', label: 'Solo Informe' },
                        ]}
                    />
                    <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} style={selectInputStyle}>
                        <option value="todos">Todos los años</option>
                        {years.map(y => <option key={y} value={y}>Año {y}</option>)}
                    </select>
                    <RefreshButton onClick={loadData} loading={loading} />
                </>
            }
            tabs={[
                { id: 'evolucion', label: 'Evolución y Ranking', icon: BarChart3 },
                { id: 'proyeccion', label: 'Proyección Marketing', icon: TrendingUp },
                { id: 'detalle', label: 'Detalle Mensual', icon: Table2, badge: aggregated.months.length },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            {loading ? (
                <AnalyticsLoader text="Cargando estadísticas de chequeos e informes..." subtext={progress} />
            ) : activeTab === 'evolucion' ? (
                <>
                    {/* 4 KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <AnalyticsKpiCard
                            label="Chequeos Realizados (Presentes)"
                            value={aggregated.uniquePatients.toLocaleString('es-AR')}
                            subtext={`de ${aggregated.totalAgendados.toLocaleString('es-AR')} pacientes agendados`}
                            icon={Users}
                            accent={ANALYTICS_PALETTE.emerald}
                            bg="#ECFDF5"
                        />
                        <AnalyticsKpiCard
                            label="Consultas de Informe (CHQ INF)"
                            value={aggregated.uniqueInfPresentes.toLocaleString('es-AR')}
                            subtext={`Presentes de ${aggregated.totalInfAgendados.toLocaleString('es-AR')} agendados`}
                            icon={FileText}
                            accent={ANALYTICS_PALETTE.blue}
                            bg="#F0F9FF"
                        />
                        <AnalyticsKpiCard
                            label="Tasa de Retorno a Informe"
                            value={`${aggregated.tasaRetornoInforme}%`}
                            subtext={`${aggregated.uniqueInfPresentes.toLocaleString('es-AR')} pacientes vieron su informe médico`}
                            icon={ClipboardCheck}
                            accent={ANALYTICS_PALETTE.indigo}
                            bg="#EEF2FF"
                        />
                        <AnalyticsKpiCard
                            label="Demora Promedio al Informe"
                            value={aggregated.avgDiasInforme > 0 ? `${aggregated.avgDiasInforme} días` : '—'}
                            pill={aggregated.centrosInf.length > 0 ? aggregated.centrosInf.map(c => `${c.name.includes('SAN LUIS') ? 'SL' : 'SF'}: ${c.value}`).join(' · ') : null}
                            subtext="Días promedio entre el chequeo y la consulta de informe."
                            icon={Clock}
                            accent={ANALYTICS_PALETTE.amber}
                            bg="#FFFBEB"
                        />
                    </div>

                    {/* Gráfico Mensual + Ranking */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(300px, 1fr)', gap: '20px' }}>
                        <AnalyticsCard
                            title={
                                viewType === 'informe'
                                    ? 'Evolución Mensual de Consultas de Informe'
                                    : viewType === 'preventivo'
                                        ? 'Evolución Mensual de Chequeos Preventivos'
                                        : 'Chequeos Realizados vs. Consultas de Informe'
                            }
                            subtitle="Pacientes únicos con asistencia Presente en cada etapa del circuito preventivo"
                            explanation="Compara mensualmente cuántos pacientes completan sus estudios y cuántos concretan la consulta médica de devolución del informe."
                        >
                            {aggregated.months.length > 0 ? (
                                <div style={{ height: '280px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <ComposedChart data={aggregated.months} margin={{ top: 6, right: 10, left: -12, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} tickLine={false} axisLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                                            <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                                            {viewType !== 'informe' && (
                                                <Bar dataKey="pacientes" name="Chequeos Realizados" fill={ANALYTICS_PALETTE.emerald} radius={[5, 5, 0, 0]} maxBarSize={30} />
                                            )}
                                            {viewType !== 'preventivo' && (
                                                <Bar dataKey="infPresentes" name="Consultas de Informe" fill={ANALYTICS_PALETTE.blue} radius={[5, 5, 0, 0]} maxBarSize={30} />
                                            )}
                                            {viewType === 'informe' && (
                                                <Bar dataKey="infAusentes" name="Ausentes a Informe" fill={ANALYTICS_PALETTE.rose} radius={[5, 5, 0, 0]} maxBarSize={24} />
                                            )}
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <EmptyChartState />
                            )}
                        </AnalyticsCard>

                        <AnalyticsCard
                            title={viewType === 'preventivo' ? 'Top Obras Sociales' : 'Médicos — Consultas de Informe'}
                            subtitle={viewType === 'preventivo' ? 'Distribución de pacientes presentes por cobertura' : 'Profesionales con mayor volumen de entregas de informe'}
                        >
                            {viewType !== 'preventivo' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '295px', overflowY: 'auto' }}>
                                    {aggregated.topMedicosInf.map((m, idx) => {
                                        const maxVal = aggregated.topMedicosInf[0]?.value || 1;
                                        const pct = Math.round((m.value / maxVal) * 100);
                                        return (
                                            <div key={idx}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '210px' }}>{m.name}</span>
                                                    <span style={{ fontWeight: 700, color: '#0284C7', fontVariantNumeric: 'tabular-nums' }}>{m.value.toLocaleString('es-AR')}</span>
                                                </div>
                                                <div style={{ width: '100%', height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: '#0284C7', borderRadius: '999px' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {aggregated.topOS.map((os, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                <div style={{ width: 9, height: 9, borderRadius: 3, background: CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length], flexShrink: 0 }} />
                                                <span style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{os.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{os.value.toLocaleString('es-AR')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </AnalyticsCard>
                    </div>
                </>
            ) : activeTab === 'proyeccion' ? (
                <AnalyticsCard
                    title="Proyección de Renovación Anual de Chequeos (Próximos 6 Meses)"
                    subtitle="Pacientes que cumplen 12 meses desde su último chequeo preventivo y son candidatos a recontacto"
                    explanation="Distingue entre el total de pacientes vencidos/próximos a vencer y aquellos que cuentan con teléfono registrado para campañas de WhatsApp."
                >
                    <div style={{ height: '310px', width: '100%' }}>
                        <ResponsiveContainer>
                            <BarChart data={projectionData} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: '8px' }} />
                                <Bar dataKey="total" name="Total Pacientes que vencen" fill="#CBD5E1" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="contactables" name="Contactables (Con Teléfono)" fill={ANALYTICS_PALETTE.emerald} radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </AnalyticsCard>
            ) : (
                <AnalyticsCard
                    title={`Detalle Mensual (${aggregated.months.length} meses)`}
                    subtitle="Consolidado mes a mes entre estudios preventivos realizados y consultas de devolución de informe"
                >
                    <div style={{ overflowX: 'auto', border: '1px solid #F1F5F9', borderRadius: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                    {['Mes', 'CHQ Agendados', 'CHQ Presentes', 'Inf. Agendados', 'Inf. Presentes', 'Inf. Ausentes', '% Retorno'].map(h => (
                                        <th key={h} style={{
                                            padding: '10px 14px', textAlign: h === 'Mes' ? 'left' : 'right',
                                            fontWeight: 700, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...aggregated.months].reverse().map((m) => (
                                    <tr key={m.month} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>{m.labelFull}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>{m.agendados.toLocaleString('es-AR')}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{m.presentes.toLocaleString('es-AR')}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>{m.infAgendados.toLocaleString('es-AR')}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>{m.infPresentes.toLocaleString('es-AR')}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#F43F5E' }}>{m.infAusentes.toLocaleString('es-AR')}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                                background: m.tasaRetornoMes >= 35 ? '#E0F2FE' : '#F1F5F9',
                                                color: m.tasaRetornoMes >= 35 ? '#0369A1' : '#475569',
                                            }}>{m.tasaRetornoMes}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #E2E8F0', background: '#F8FAFC' }}>
                                    <td style={{ padding: '11px 14px', fontWeight: 800, color: '#0F172A' }}>TOTAL</td>
                                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#64748B' }}>{aggregated.totalAgendados.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#10B981' }}>{aggregated.uniquePatients.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#64748B' }}>{aggregated.totalInfAgendados.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#0284C7' }}>{aggregated.uniqueInfPresentes.toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#F43F5E' }}>{aggregated.months.reduce((s, m) => s + m.infAusentes, 0).toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#0369A1' }}>{aggregated.tasaRetornoInforme}%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </AnalyticsCard>
            )}
        </AnalyticsShell>
    );
}
