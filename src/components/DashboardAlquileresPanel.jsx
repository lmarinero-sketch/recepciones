/**
 * DashboardAlquileresPanel — Dashboard ejecutivo de ocupación de consultorios
 * Unificado bajo el sistema de diseño analítico ("Menos es más" — Figma SaaS / Calidad-QOAG)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    BarChart3, Calendar, ChevronLeft, ChevronRight,
    Building2, Users, Home, ArrowUpRight, LayoutDashboard
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    fetchSedes, fetchConsultorios, fetchAsignaciones,
    buildGrilla, calcularMetricasLocal, fetchMedicos,
    fetchNovedades, getPeriodoActual,
} from '../services/alquileresService';
import {
    AnalyticsShell, AnalyticsKpiCard, AnalyticsCard,
    RefreshButton, AnalyticsLoader, EmptyChartState,
    ANALYTICS_PALETTE, TOOLTIP_STYLE,
} from './ui/AnalyticsPrimitives';

function parsePeriodo(p) { const [y, m] = p.split('-').map(Number); return { year: y, month: m }; }
function formatPeriodo(p) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const { year, month } = parsePeriodo(p);
    return `${meses[month - 1]} ${year}`;
}
function shiftPeriodo(p, delta) {
    const { year, month } = parsePeriodo(p);
    const d = new Date(year, month - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardAlquileresPanel({ addToast }) {
    const [periodo, setPeriodo] = useState(getPeriodoActual());
    const [loading, setLoading] = useState(true);
    const [sedes, setSedes] = useState([]);
    const [metricsPerSede, setMetricsPerSede] = useState({});
    const [totalMedicos, setTotalMedicos] = useState(0);
    const [novedadesCount, setNovedadesCount] = useState({ alta: 0, baja: 0 });
    const [franjaDistrib, setFranjaDistrib] = useState({ mañana: 0, siesta: 0, tarde: 0 });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const sedesData = await fetchSedes();
            setSedes(sedesData);

            const allMetrics = {};
            const globalFranjas = { mañana: 0, siesta: 0, tarde: 0 };

            for (const sede of sedesData) {
                const [cons, asig] = await Promise.all([
                    fetchConsultorios(sede.id),
                    fetchAsignaciones(periodo, sede.id),
                ]);
                const grilla = buildGrilla(asig, cons);
                const metrics = calcularMetricasLocal(grilla, cons);
                allMetrics[sede.id] = { ...metrics, nombre: sede.nombre, codigo: sede.codigo, consultorios: cons };
                asig.forEach(a => {
                    if (globalFranjas[a.franja] !== undefined) globalFranjas[a.franja]++;
                });
            }

            setMetricsPerSede(allMetrics);
            setFranjaDistrib(globalFranjas);

            const [medicos, novedades] = await Promise.all([
                fetchMedicos({ estado: 'activo' }),
                fetchNovedades(periodo),
            ]);
            setTotalMedicos(medicos.length);

            const nc = { alta: 0, baja: 0 };
            novedades.forEach(n => { if (nc[n.tipo] !== undefined) nc[n.tipo]++; });
            setNovedadesCount(nc);
        } catch (err) {
            addToast?.('Error cargando dashboard: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [periodo, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const globalMetrics = useMemo(() => {
        let disponible = 0, ocupado = 0;
        Object.values(metricsPerSede).forEach(m => {
            disponible += m.totalDisponible;
            ocupado += m.totalOcupado;
        });
        return { disponible, ocupado, libre: disponible - ocupado, tasa: disponible > 0 ? Math.round((ocupado / disponible) * 100) : 0 };
    }, [metricsPerSede]);

    const sedeChartData = useMemo(() => (
        sedes.map(s => {
            const m = metricsPerSede[s.id];
            if (!m) return null;
            return { sede: s.nombre, ocupados: m.totalOcupado, libres: m.totalLibre, tasa: m.tasaGeneral };
        }).filter(Boolean)
    ), [sedes, metricsPerSede]);

    const franjaPieData = useMemo(() => ([
        { name: 'Mañana', value: franjaDistrib.mañana || 0, color: ANALYTICS_PALETTE.blue },
        { name: 'Siesta', value: franjaDistrib.siesta || 0, color: ANALYTICS_PALETTE.amber },
        { name: 'Tarde', value: franjaDistrib.tarde || 0, color: ANALYTICS_PALETTE.emerald },
    ].filter(x => x.value > 0)), [franjaDistrib]);

    return (
        <AnalyticsShell
            icon={LayoutDashboard}
            title="Dashboard de Alquileres y Ocupación"
            subtitle="Tasa de ocupación mensual de consultorios por sede, franja horaria y movimiento de médicos."
            controls={
                <>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: '#F8FAFC', border: '1px solid #E2E8F0',
                        borderRadius: '9px', padding: '3px 6px',
                    }}>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, -1))} style={navBtn} title="Mes anterior">
                            <ChevronLeft size={15} />
                        </button>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', padding: '0 6px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <Calendar size={13} color="#0284C7" />
                            {formatPeriodo(periodo)}
                        </span>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, 1))} style={navBtn} title="Mes siguiente">
                            <ChevronRight size={15} />
                        </button>
                    </div>
                    <RefreshButton onClick={loadData} loading={loading} />
                </>
            }
        >
            {loading ? (
                <AnalyticsLoader text="Calculando ocupación de consultorios..." />
            ) : (
                <>
                    {/* 4 KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <AnalyticsKpiCard
                            label="Ocupación General"
                            value={`${globalMetrics.tasa}%`}
                            pill={`${globalMetrics.ocupado} / ${globalMetrics.disponible}`}
                            subtext="Porcentaje de módulos ocupados sobre capacidad total."
                            icon={BarChart3}
                            accent={globalMetrics.tasa >= 80 ? ANALYTICS_PALETTE.emerald : globalMetrics.tasa >= 60 ? ANALYTICS_PALETTE.amber : ANALYTICS_PALETTE.rose}
                            bg={globalMetrics.tasa >= 80 ? '#ECFDF5' : globalMetrics.tasa >= 60 ? '#FFFBEB' : '#FFF1F2'}
                        />
                        <AnalyticsKpiCard
                            label="Médicos Activos"
                            value={totalMedicos}
                            subtext="Profesionales con alquiler vigente en el sistema."
                            icon={Users}
                            accent={ANALYTICS_PALETTE.blue}
                            bg="#F0F9FF"
                        />
                        <AnalyticsKpiCard
                            label="Módulos Libres"
                            value={globalMetrics.libre}
                            subtext={`Disponibles para asignar de ${globalMetrics.disponible} totales.`}
                            icon={Home}
                            accent={ANALYTICS_PALETTE.slate}
                            bg="#F1F5F9"
                        />
                        <AnalyticsKpiCard
                            label="Novedades del Período"
                            value={novedadesCount.alta}
                            pill={`${novedadesCount.baja} bajas`}
                            pillBg={novedadesCount.baja > 0 ? '#FEE2E2' : '#ECFDF5'}
                            pillColor={novedadesCount.baja > 0 ? '#B91C1C' : '#15803D'}
                            subtext="Altas registradas durante el mes seleccionado."
                            icon={ArrowUpRight}
                            accent={ANALYTICS_PALETTE.emerald}
                            bg="#ECFDF5"
                        />
                    </div>

                    {/* Gráficos: Barras por Sede + Torta por Franja */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 1fr)', gap: '20px' }}>
                        <AnalyticsCard
                            title="Ocupados vs. Libres por Sede"
                            subtitle="Comparativa visual de capacidad utilizada en cada edificio"
                            explanation="Permite detectar en qué sede existe capacidad ociosa disponible para incorporar nuevos profesionales."
                        >
                            {sedeChartData.length > 0 ? (
                                <div style={{ height: '250px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <BarChart data={sedeChartData} margin={{ top: 8, right: 12, left: -14, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                            <XAxis dataKey="sede" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                                            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                            <Bar dataKey="ocupados" name="Ocupados" stackId="a" fill={ANALYTICS_PALETTE.blue} />
                                            <Bar dataKey="libres" name="Libres" stackId="a" fill="#CBD5E1" radius={[5, 5, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <EmptyChartState />}
                        </AnalyticsCard>

                        <AnalyticsCard
                            title="Distribución por Franja Horaria"
                            subtitle="Participación de módulos asignados en Mañana, Siesta y Tarde"
                            explanation="Ayuda a identificar franjas horarias con menor ocupación (como Siesta) para ofrecer incentivos o promociones."
                        >
                            {franjaPieData.length > 0 ? (
                                <div style={{ height: '250px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie data={franjaPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={86} paddingAngle={3}>
                                                {franjaPieData.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                                            </Pie>
                                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} módulos`, 'Asignados']} />
                                            <Legend wrapperStyle={{ fontSize: '0.76rem' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : <EmptyChartState text="Sin módulos asignados en este período." />}
                        </AnalyticsCard>
                    </div>

                    {/* Mapa por Consultorio en cada Sede */}
                    <AnalyticsCard
                        title="Mapa de Ocupación por Consultorio"
                        subtitle="Detalle individual por consultorio (verde ≥ 90% · amarillo ≥ 70% · naranja ≥ 40% · rojo < 40%)"
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                            {sedes.map(s => {
                                const m = metricsPerSede[s.id];
                                if (!m) return null;
                                const barColor = m.tasaGeneral >= 80 ? ANALYTICS_PALETTE.emerald : m.tasaGeneral >= 60 ? ANALYTICS_PALETTE.amber : ANALYTICS_PALETTE.rose;
                                return (
                                    <div key={s.id} style={{
                                        padding: '16px', borderRadius: '11px',
                                        border: '1px solid #E2E8F0', background: '#F8FAFC',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Building2 size={15} color="#0284C7" /> {s.nombre}
                                            </span>
                                            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: barColor }}>{m.tasaGeneral}%</span>
                                        </div>
                                        <div style={{ height: '7px', borderRadius: '999px', background: '#E2E8F0', marginBottom: '8px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${m.tasaGeneral}%`, background: barColor, borderRadius: '999px', transition: 'width 0.5s ease' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B', marginBottom: '10px' }}>
                                            <span>Ocupados: <strong>{m.totalOcupado}</strong></span>
                                            <span>Libres: <strong>{m.totalLibre}</strong></span>
                                            <span>Total: <strong>{m.totalDisponible}</strong></span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {Object.entries(m.porConsultorio).map(([cid, cm]) => {
                                                const num = m.consultorios?.find(x => x.id === cid)?.numero || '?';
                                                return (
                                                    <div key={cid} title={`Consultorio ${num}: ${cm.tasa}%`} style={{
                                                        width: '22px', height: '22px', borderRadius: '5px',
                                                        background: cm.tasa >= 90 ? '#10B981' : cm.tasa >= 70 ? '#FDE68A' : cm.tasa >= 40 ? '#FED7AA' : '#FECACA',
                                                        color: cm.tasa >= 90 ? '#FFFFFF' : '#334155',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '0.62rem', fontWeight: 700,
                                                    }}>
                                                        {num}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </AnalyticsCard>
                </>
            )}
        </AnalyticsShell>
    );
}

const navBtn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '26px', height: '26px', borderRadius: '6px',
    border: 'none', background: '#FFFFFF', cursor: 'pointer', color: '#475569',
};
