import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, TrendingUp, Users, Building2, UserCheck, UserX,
    CalendarDays, Clock, FileText, ClipboardCheck, Table2
} from 'lucide-react';
import {
    ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, PieChart, Pie, Cell, Legend, ReferenceLine
} from 'recharts';
import { fetchRecordatoriosMetrics } from '../services/recordatoriosService';
import {
    AnalyticsShell, AnalyticsKpiCard, AnalyticsCard, SegmentedControl,
    RefreshButton, AnalyticsLoader, EmptyChartState,
    ANALYTICS_PALETTE, CHART_SERIES_COLORS, TOOLTIP_STYLE, selectInputStyle, dateInputStyle,
} from './ui/AnalyticsPrimitives';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

function aggregate(data, fechaDesde, fechaHasta, filtroEdad = 'todos', customMin = '', customMax = '', tipoConsulta = 'preventivo') {
    const byMonth = {};
    const osCounts = {};
    const medicoCounts = {};
    const sedeCounts = {};
    const ageCounts = { '< 14': 0, '14 - 17': 0, '18 - 50': 0, '51 - 65': 0, '66+': 0, 'Sin Dato': 0 };
    let totalPresentes = 0, totalAusentes = 0, totalPendientes = 0, filteredCount = 0;

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
                    if (!infDatesByDni[dniKey] || r.fecha > infDatesByDni[dniKey]) infDatesByDni[dniKey] = r.fecha;
                }
            } else if (r.asistencia_efectiva === 'Presente') {
                chqPresenteDnis.add(dniKey);
                if (!chqDatesByDni[dniKey] || r.fecha < chqDatesByDni[dniKey]) chqDatesByDni[dniKey] = r.fecha;
            }
        }

        if (tipoConsulta === 'preventivo' && isInf) return;
        if (tipoConsulta === 'informe' && !isInf) return;

        const key = `${r.dni || r.paciente}_${r.fecha}_${isInf ? 'INF' : 'CHQ'}`;
        if (!uniqueVisitsMap.has(key)) {
            uniqueVisitsMap.set(key, { ...r, isInf });
        } else {
            const existing = uniqueVisitsMap.get(key);
            if (r.asistencia_efectiva === 'Presente') existing.asistencia_efectiva = 'Presente';
        }
    });

    let sumDiasInforme = 0, countDiasInforme = 0;
    Object.keys(infDatesByDni).forEach(dni => {
        const fChq = chqDatesByDni[dni];
        const fInf = infDatesByDni[dni];
        if (fChq && fInf && fInf >= fChq) {
            const diff = Math.round((new Date(fInf + 'T12:00:00') - new Date(fChq + 'T12:00:00')) / (1000 * 60 * 60 * 24));
            if (diff >= 0 && diff <= 120) { sumDiasInforme += diff; countDiasInforme++; }
        }
    });
    const avgDiasAlInforme = countDiasInforme > 0 ? Math.round(sumDiasInforme / countDiasInforme) : 0;
    const tasaRetornoInforme = chqPresenteDnis.size > 0 ? Math.round((infPresenteDnis.size / chqPresenteDnis.size) * 100) : 0;

    Array.from(uniqueVisitsMap.values()).forEach(r => {
        filteredCount++;
        const asis = r.asistencia_efectiva;
        const isAusente = asis === 'Ausente' || asis === 'Ausencia justificada' || asis === 'Ausencia injustificada' || asis === 'Anulación Cita Online';

        if (asis === 'Presente') totalPresentes++;
        else if (isAusente) totalAusentes++;
        else totalPendientes++;

        const month = r.fecha.substring(0, 7);
        if (!byMonth[month]) {
            byMonth[month] = { agendados: 0, presentes: 0, ausentes: 0, pendientes: 0, chqPresentes: 0, infPresentes: 0, infAgendados: 0, infAusentes: 0 };
        }
        byMonth[month].agendados++;
        if (asis === 'Presente') byMonth[month].presentes++;
        else if (isAusente) byMonth[month].ausentes++;
        else byMonth[month].pendientes++;

        if (r.isInf) {
            byMonth[month].infAgendados++;
            if (asis === 'Presente') byMonth[month].infPresentes++;
            else if (isAusente) byMonth[month].infAusentes++;
        } else if (asis === 'Presente') {
            byMonth[month].chqPresentes++;
        }

        if (asis === 'Presente') {
            const os = r.obra_social || 'Particular/Sin OS';
            osCounts[os] = (osCounts[os] || 0) + 1;
            const sede = r.centro || 'Sin Sede';
            sedeCounts[sede] = (sedeCounts[sede] || 0) + 1;
            if (r.medico && !isExcludedMedico(r.medico)) medicoCounts[r.medico] = (medicoCounts[r.medico] || 0) + 1;

            if (r.edad !== null && r.edad !== undefined && r.edad !== '') {
                const age = parseInt(r.edad, 10);
                if (!isNaN(age)) {
                    if (age < 14) ageCounts['< 14']++;
                    else if (age <= 17) ageCounts['14 - 17']++;
                    else if (age <= 50) ageCounts['18 - 50']++;
                    else if (age <= 65) ageCounts['51 - 65']++;
                    else ageCounts['66+']++;
                } else ageCounts['Sin Dato']++;
            } else ageCounts['Sin Dato']++;
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

    const sortedOS = Object.entries(osCounts).sort((a, b) => b[1] - a[1]);
    const topOS = sortedOS.slice(0, 5).map(([name, value]) => ({ name, value }));
    const othersOS = sortedOS.slice(5).reduce((s, [, c]) => s + c, 0);
    if (othersOS > 0) topOS.push({ name: 'Otras', value: othersOS });

    const topMedicos = Object.entries(medicoCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value }));
    const topSedes = Object.entries(sedeCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

    const AGE_COLORS = { '< 14': '#0EA5E9', '14 - 17': '#6366F1', '18 - 50': '#10B981', '51 - 65': '#F59E0B', '66+': '#8B5CF6', 'Sin Dato': '#CBD5E1' };
    const ageDistribution = Object.entries(ageCounts).filter(([, value]) => value > 0).map(([name, value]) => ({ name, value, color: AGE_COLORS[name] || '#64748B' }));
    const tasaGlobal = (totalPresentes + totalAusentes) > 0 ? Math.round((totalPresentes / (totalPresentes + totalAusentes)) * 100) : 0;

    return {
        months, topOS, topMedicos, topSedes, ageDistribution,
        totalPresentes, totalAusentes, totalPendientes, total: filteredCount,
        tasaGlobal, chqPresentesCount: chqPresenteDnis.size, infPresentesCount: infPresenteDnis.size,
        infAgendadosCount: infAgendadoDnis.size, tasaRetornoInforme, avgDiasAlInforme,
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
        if (!uniqueVisitsMap.has(key)) uniqueVisitsMap.set(key, { ...r });
        else if (r.asistencia_efectiva === 'Presente') uniqueVisitsMap.get(key).asistencia_efectiva = 'Presente';
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
    return {
        fechaDesde: `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-01`,
        fechaHasta: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`,
    };
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
    const [yoyMode, setYoyMode] = useState('asistidos');
    const [tipoConsulta, setTipoConsulta] = useState('informe');
    const [activeTab, setActiveTab] = useState('asistencia'); // 'asistencia' | 'demografia' | 'detalle'

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
        rawData.forEach(v => { if (v.fecha) ys.add(v.fecha.substring(0, 4)); });
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
    const avgAgendados = useMemo(() => (agg.months.length > 0 ? Math.round(agg.total / agg.months.length) : 0), [agg.total, agg.months.length]);

    return (
        <AnalyticsShell
            icon={BarChart3}
            title="Estadísticas de Turnos: Chequeos e Informes"
            subtitle="Análisis de asistencia real, comparativa interanual 2024–2026 y perfil demográfico de pacientes en SALUS."
            controls={
                <>
                    <SegmentedControl
                        value={tipoConsulta}
                        onChange={setTipoConsulta}
                        options={[
                            { id: 'informe', label: 'Consultas Informe' },
                            { id: 'preventivo', label: 'Chequeos Preventivos' },
                            { id: 'comparativa', label: 'Comparativa' },
                        ]}
                    />
                    <RefreshButton onClick={loadData} loading={loading} />
                </>
            }
            secondaryBar={
                <>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Desde:</span>
                        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={dateInputStyle} />
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Hasta:</span>
                        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={dateInputStyle} />
                    </div>
                    <select value={filtroEdad} onChange={e => setFiltroEdad(e.target.value)} style={selectInputStyle}>
                        <option value="todos">Edad: Todas</option>
                        <option value="<14">&lt; 14 años</option>
                        <option value="14-17">14–17 años</option>
                        <option value="18-50">18–50 años</option>
                        <option value="51-65">51–65 años</option>
                        <option value="66+">66+ años</option>
                        <option value="custom">Personalizado...</option>
                    </select>
                    {filtroEdad === 'custom' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <input type="number" min="0" max="120" placeholder="Min" value={customEdadMin} onChange={e => setCustomEdadMin(e.target.value)} style={{ ...dateInputStyle, width: '54px', textAlign: 'center' }} />
                            <span style={{ color: '#94A3B8', fontSize: '0.74rem' }}>a</span>
                            <input type="number" min="0" max="120" placeholder="Max" value={customEdadMax} onChange={e => setCustomEdadMax(e.target.value)} style={{ ...dateInputStyle, width: '54px', textAlign: 'center' }} />
                        </div>
                    )}
                    <button onClick={() => { const prev = getPreviousMonthRange(); setFechaDesde(prev.fechaDesde); setFechaHasta(prev.fechaHasta); }} style={chipBtn}>Mes anterior</button>
                    <button onClick={() => { setFechaDesde('2026-01-01'); setFechaHasta('2026-12-31'); }} style={{ ...chipBtn, background: '#F0F9FF', color: '#0284C7', borderColor: '#BAE6FD' }}>Año 2026</button>
                    {(fechaDesde || fechaHasta || filtroEdad !== 'todos') && (
                        <button onClick={() => { setFechaDesde(''); setFechaHasta(''); setFiltroEdad('todos'); setCustomEdadMin(''); setCustomEdadMax(''); }} style={{ ...chipBtn, background: '#FEF2F2', color: '#DC2626', borderColor: '#FECACA' }}>
                            Todo (2024–2026)
                        </button>
                    )}
                </>
            }
            tabs={[
                { id: 'asistencia', label: 'Asistencia e Interanual', icon: TrendingUp },
                { id: 'demografia', label: 'Demografía, Coberturas y Médicos', icon: Users },
                { id: 'detalle', label: 'Detalle Mensual', icon: Table2, badge: agg.months.length },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            {loading ? (
                <AnalyticsLoader text="Cargando estadísticas de turnos..." subtext={progress} />
            ) : activeTab === 'asistencia' ? (
                <>
                    {/* 4 KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <AnalyticsKpiCard
                            label={tipoConsulta === 'informe' ? 'Informes Agendados' : tipoConsulta === 'preventivo' ? 'Chequeos Agendados' : 'Total Turnos'}
                            value={agg.total.toLocaleString('es-AR')}
                            subtext={`${agg.totalPendientes.toLocaleString('es-AR')} turnos futuros pendientes`}
                            icon={tipoConsulta === 'informe' ? FileText : CalendarDays}
                            accent={ANALYTICS_PALETTE.blue}
                            bg="#F0F9FF"
                        />
                        <AnalyticsKpiCard
                            label="Presentes (Asistieron)"
                            value={agg.totalPresentes.toLocaleString('es-AR')}
                            pill={`${agg.tasaGlobal}% asistencia`}
                            subtext="Efectividad sobre turnos con fecha ya transcurrida."
                            icon={UserCheck}
                            accent={ANALYTICS_PALETTE.emerald}
                            bg="#ECFDF5"
                        />
                        <AnalyticsKpiCard
                            label="Ausentes / Inasistencias"
                            value={agg.totalAusentes.toLocaleString('es-AR')}
                            pill={`${agg.totalPresentes + agg.totalAusentes > 0 ? 100 - agg.tasaGlobal : 0}%`}
                            subtext="Incluye ausencias justificadas, injustificadas y anulaciones."
                            icon={UserX}
                            accent={ANALYTICS_PALETTE.rose}
                            bg="#FFF1F2"
                        />
                        <AnalyticsKpiCard
                            label="Retorno a Consulta Informe"
                            value={`${agg.tasaRetornoInforme}%`}
                            pill={agg.avgDiasAlInforme > 0 ? `${agg.avgDiasAlInforme}d prom.` : null}
                            subtext={`${agg.infPresentesCount.toLocaleString('es-AR')} con Informe vs ${agg.chqPresentesCount.toLocaleString('es-AR')} con Chequeo`}
                            icon={ClipboardCheck}
                            accent={ANALYTICS_PALETTE.indigo}
                            bg="#EEF2FF"
                        />
                    </div>

                    {/* Asistencia Mensual + Tasa (%) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(320px, 1fr)', gap: '20px' }}>
                        <AnalyticsCard
                            title={tipoConsulta === 'comparativa' ? 'Chequeos vs. Consultas de Informe (Presentes)' : 'Asistencia Mensual Apilada'}
                            subtitle={tipoConsulta === 'comparativa' ? 'Comparación mes a mes entre estudios realizados y devoluciones médicas' : 'Desglose mensual en Presentes, Ausentes y Pendientes futuros'}
                            explanation="La línea punteada indica el promedio mensual del período seleccionado para identificar meses por encima o debajo de la media."
                        >
                            {agg.months.length > 0 ? (
                                <div style={{ height: '270px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        {tipoConsulta === 'comparativa' ? (
                                            <ComposedChart data={agg.months} margin={{ top: 6, right: 10, left: -12, bottom: 4 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                                                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                                <Bar dataKey="chqPresentes" name="Chequeos Realizados" fill={ANALYTICS_PALETTE.emerald} radius={[5, 5, 0, 0]} maxBarSize={30} />
                                                <Bar dataKey="infPresentes" name="Consultas Informe" fill={ANALYTICS_PALETTE.blue} radius={[5, 5, 0, 0]} maxBarSize={30} />
                                            </ComposedChart>
                                        ) : (
                                            <BarChart data={agg.months} margin={{ top: 6, right: 10, left: -12, bottom: 4 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={l => agg.months.find(m => m.label === l)?.labelFull || l} />
                                                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                                <ReferenceLine y={avgAgendados} stroke="#64748B" strokeDasharray="3 3" />
                                                <Bar dataKey="presentes" name="Presentes" stackId="a" fill={ANALYTICS_PALETTE.emerald} />
                                                <Bar dataKey="ausentes" name="Ausentes" stackId="a" fill={ANALYTICS_PALETTE.rose} />
                                                <Bar dataKey="pendientes" name="Pendientes" stackId="a" fill={ANALYTICS_PALETTE.amber} radius={[5, 5, 0, 0]} />
                                            </BarChart>
                                        )}
                                    </ResponsiveContainer>
                                </div>
                            ) : <EmptyChartState />}
                        </AnalyticsCard>

                        <AnalyticsCard
                            title="Tasa de Asistencia Mensual (%)"
                            subtitle="Porcentaje de pacientes que asistieron sobre turnos resueltos"
                            explanation="Permite evaluar si los recordatorios automáticos por WhatsApp están reduciendo el ausentismo a lo largo del tiempo."
                        >
                            {agg.months.length > 0 ? (
                                <div style={{ height: '270px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <ComposedChart data={agg.months} margin={{ top: 6, right: 10, left: -16, bottom: 4 }}>
                                            <defs>
                                                <linearGradient id="asistGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.18} />
                                                    <stop offset="100%" stopColor="#10B981" stopOpacity={0.01} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v}%`, 'Asistencia']} />
                                            <Area dataKey="tasaAsistencia" fill="url(#asistGrad)" stroke="none" />
                                            <Line type="monotone" dataKey="tasaAsistencia" stroke="#059669" strokeWidth={2.4} dot={{ r: 3.5, fill: '#10B981' }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <EmptyChartState />}
                        </AnalyticsCard>
                    </div>

                    {/* Comparativa Interanual YoY */}
                    <AnalyticsCard
                        title="Comparativa Interanual 2024–2026 (Gráfico de Líneas)"
                        subtitle="Evolución mes a mes comparando años completos (independiente del rango de fechas superior)"
                        badge={
                            <SegmentedControl
                                value={yoyMode}
                                onChange={setYoyMode}
                                options={[
                                    { id: 'agendados', label: 'Agendados' },
                                    { id: 'asistidos', label: 'Asistidos' },
                                    { id: 'ausentes', label: 'Ausentes' },
                                ]}
                            />
                        }
                        explanation="Permite comparar la estacionalidad de la demanda entre 2024, 2025 y 2026 para planificar agendas y campañas."
                    >
                        {yoyData.length > 0 ? (
                            <div style={{ height: '260px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <LineChart data={yoyData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                        <Legend wrapperStyle={{ fontSize: '0.76rem' }} />
                                        {[...years].reverse().map((year, i) => (
                                            <Line key={year} type="monotone" dataKey={year} name={`Año ${year}`} stroke={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]} strokeWidth={2.5} dot={{ r: 3.5 }} />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : <EmptyChartState />}
                    </AnalyticsCard>
                </>
            ) : activeTab === 'demografia' ? (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                        <AnalyticsCard
                            title="Histograma de Rangos Etarios"
                            subtitle="Distribución por edad de los pacientes presentes en el período"
                            explanation="Muestra qué franjas de edad tienen mayor participación efectiva en chequeos preventivos e informes."
                        >
                            {agg.ageDistribution.length > 0 ? (
                                <div style={{ height: '260px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <BarChart data={agg.ageDistribution} barCategoryGap="10%" margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} presentes`, 'Pacientes']} />
                                            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                                {agg.ageDistribution.map((entry, idx) => (
                                                    <Cell key={idx} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <EmptyChartState text="Sin datos de edad." />}
                        </AnalyticsCard>

                        <AnalyticsCard
                            title="Top Obras Sociales y Sedes (Gráfico de Torta)"
                            subtitle="Distribución de turnos presentes por cobertura médica"
                            badge={
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {agg.topSedes.map((s, idx) => (
                                        <span key={idx} style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F0F9FF', color: '#0369A1', padding: '3px 8px', borderRadius: '999px' }}>
                                            {s.name}: {s.value.toLocaleString('es-AR')}
                                        </span>
                                    ))}
                                </div>
                            }
                            explanation="Identifica las coberturas principales que traccionan la demanda en cada sede."
                        >
                            {agg.topOS.length > 0 ? (
                                <div style={{ height: '260px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie data={agg.topOS} cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={3} dataKey="value" nameKey="name">
                                                {agg.topOS.map((_e, i) => <Cell key={i} fill={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} turnos`, 'Presentes']} />
                                            <Legend wrapperStyle={{ fontSize: '0.74rem' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <EmptyChartState />}
                        </AnalyticsCard>
                    </div>

                    {agg.topMedicos.length > 0 && (
                        <AnalyticsCard
                            title={`Top Profesionales por Turnos Presentes (${agg.topMedicos.length})`}
                            subtitle="Volumen de consultas efectivamente atendidas por profesional en el período"
                        >
                            <div style={{ height: Math.max(220, agg.topMedicos.length * 32), width: '100%' }}>
                                <ResponsiveContainer>
                                    <BarChart data={agg.topMedicos} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                                        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} width={200} axisLine={false} tickLine={false} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} presentes`, 'Consultas']} />
                                        <Bar dataKey="value" fill={ANALYTICS_PALETTE.blue} radius={[0, 6, 6, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </AnalyticsCard>
                    )}
                </>
            ) : (
                <AnalyticsCard
                    title={`Detalle Mes a Mes (${agg.months.length} meses)`}
                    subtitle="Consolidado mensual de turnos agendados, presentes, ausentes y tasa de asistencia"
                >
                    <div style={{ overflowX: 'auto', border: '1px solid #F1F5F9', borderRadius: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                    {(tipoConsulta === 'comparativa'
                                        ? ['Mes', 'Chequeos Pres.', 'Informes Agendados', 'Informes Presentes', 'Informes Ausentes', '% Retorno']
                                        : ['Mes', 'Agendados', 'Presentes', 'Ausentes', 'Pendientes', 'Asistencia']
                                    ).map(h => (
                                        <th key={h} style={{
                                            padding: '10px 14px', textAlign: h === 'Mes' ? 'left' : 'right',
                                            fontWeight: 700, color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...agg.months].reverse().map(m => (
                                    <tr key={m.month} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>{m.labelFull}</td>
                                        {tipoConsulta === 'comparativa' ? (
                                            <>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{m.chqPresentes}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748B' }}>{m.infAgendados}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>{m.infPresentes}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#F43F5E' }}>{m.infAusentes}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, background: '#E0F2FE', color: '#0369A1' }}>
                                                        {m.tasaRetornoMes}%
                                                    </span>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>{m.agendados}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{m.presentes}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#F43F5E' }}>{m.ausentes}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right', color: '#F59E0B' }}>{m.pendientes}</td>
                                                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700,
                                                        background: m.tasaAsistencia >= 70 ? '#ECFDF5' : m.tasaAsistencia >= 40 ? '#FFFBEB' : '#FEF2F2',
                                                        color: m.tasaAsistencia >= 70 ? '#059669' : m.tasaAsistencia >= 40 ? '#D97706' : '#DC2626',
                                                    }}>{m.tasaAsistencia}%</span>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </AnalyticsCard>
            )}
        </AnalyticsShell>
    );
}

const chipBtn = {
    padding: '5px 10px',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    background: '#FFFFFF',
    color: '#475569',
    fontSize: '0.73rem',
    fontWeight: 600,
    cursor: 'pointer',
};
