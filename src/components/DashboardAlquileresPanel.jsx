/**
 * DashboardAlquileresPanel — Dashboard ejecutivo de métricas de ocupación
 * 
 * Muestra: Tasa general, distribución por franja, sede, y KPIs principales.
 * Incluye visualizaciones con barras de progreso y sparklines CSS.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    BarChart3, Calendar, ChevronLeft, ChevronRight, Loader2,
    RefreshCw, Building2, TrendingUp, Users, Home, Clock,
    ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
    fetchSedes, fetchConsultorios, fetchAsignaciones,
    buildGrilla, calcularMetricasLocal, fetchMedicos,
    fetchNovedades, fetchLiquidacion, getPeriodoActual,
    DIAS, FRANJAS, DIAS_LABELS, FRANJAS_LABELS,
} from '../services/alquileresService';

function parsePeriodo(p) { const [y, m] = p.split('-').map(Number); return { year: y, month: m }; }
function formatPeriodo(p) {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
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
    const [franjaDistrib, setFranjaDistrib] = useState({});

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const sedesData = await fetchSedes();
            setSedes(sedesData);

            const allMetrics = {};
            let globalFranjas = { 'mañana': 0, siesta: 0, tarde: 0 };

            for (const sede of sedesData) {
                const [cons, asig] = await Promise.all([
                    fetchConsultorios(sede.id),
                    fetchAsignaciones(periodo, sede.id),
                ]);
                const grilla = buildGrilla(asig, cons);
                const metrics = calcularMetricasLocal(grilla, cons);
                allMetrics[sede.id] = { ...metrics, nombre: sede.nombre, codigo: sede.codigo, consultorios: cons };

                // Count franjas
                asig.forEach(a => {
                    if (globalFranjas[a.franja] !== undefined) globalFranjas[a.franja]++;
                });
            }

            setMetricsPerSede(allMetrics);
            setFranjaDistrib(globalFranjas);

            // Medicos count
            const medicos = await fetchMedicos({ estado: 'activo' });
            setTotalMedicos(medicos.length);

            // Novedades count
            const novedades = await fetchNovedades(periodo);
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

    // Global totals
    const globalMetrics = useMemo(() => {
        let disponible = 0, ocupado = 0;
        Object.values(metricsPerSede).forEach(m => {
            disponible += m.totalDisponible;
            ocupado += m.totalOcupado;
        });
        return { disponible, ocupado, libre: disponible - ocupado, tasa: disponible > 0 ? Math.round((ocupado / disponible) * 100) : 0 };
    }, [metricsPerSede]);

    const totalFranjas = useMemo(() => {
        return Object.values(franjaDistrib).reduce((a, b) => a + b, 0);
    }, [franjaDistrib]);

    if (loading) {
        return (
            <div className="content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <Loader2 size={32} className="spin" style={{ color: 'var(--primary-500)' }} />
            </div>
        );
    }

    return (
        <div className="content" style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => setPeriodo(p => shiftPeriodo(p, -1))} style={iconBtn}><ChevronLeft size={16} /></button>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                        <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                        {formatPeriodo(periodo)}
                    </span>
                    <button onClick={() => setPeriodo(p => shiftPeriodo(p, 1))} style={iconBtn}><ChevronRight size={16} /></button>
                    <button onClick={loadData} style={iconBtn}><RefreshCw size={14} /></button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <KPICard icon={<BarChart3 size={20} />} label="Ocupación General" value={`${globalMetrics.tasa}%`} subtext={`${globalMetrics.ocupado} / ${globalMetrics.disponible} slots`} accent={globalMetrics.tasa >= 80 ? '#22C55E' : globalMetrics.tasa >= 60 ? '#F59E0B' : '#EF4444'} />
                <KPICard icon={<Users size={20} />} label="Médicos Activos" value={totalMedicos} subtext="En el sistema" accent="var(--primary-500)" />
                <KPICard icon={<Home size={20} />} label="Slots Libres" value={globalMetrics.libre} subtext={`De ${globalMetrics.disponible} totales`} accent="#94A3B8" />
                <KPICard icon={<ArrowUpRight size={20} />} label="Altas este mes" value={novedadesCount.alta} subtext={`${novedadesCount.baja} bajas`} accent="#22C55E" />
            </div>

            {/* Sede breakdown */}
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '12px', color: 'var(--neutral-700)' }}>
                <Building2 size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Ocupación por Sede
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {sedes.map(s => {
                    const m = metricsPerSede[s.id];
                    if (!m) return null;
                    return (
                        <div key={s.id} style={{
                            padding: '16px 20px', borderRadius: '12px',
                            border: '1px solid var(--neutral-200)', background: 'white',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--neutral-700)' }}>{s.nombre}</span>
                                <span style={{
                                    fontWeight: 800, fontSize: '1.1rem',
                                    color: m.tasaGeneral >= 80 ? '#22C55E' : m.tasaGeneral >= 60 ? '#F59E0B' : '#EF4444',
                                }}>{m.tasaGeneral}%</span>
                            </div>
                            {/* Progress bar */}
                            <div style={{ height: '8px', borderRadius: '4px', background: 'var(--neutral-100)', marginBottom: '8px' }}>
                                <div style={{
                                    height: '100%', borderRadius: '4px', transition: 'width 0.6s ease',
                                    width: `${m.tasaGeneral}%`,
                                    background: m.tasaGeneral >= 80 ? 'linear-gradient(90deg, #22C55E, #16A34A)' : m.tasaGeneral >= 60 ? 'linear-gradient(90deg, #F59E0B, #D97706)' : 'linear-gradient(90deg, #EF4444, #DC2626)',
                                }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--neutral-500)' }}>
                                <span>Ocupados: {m.totalOcupado}</span>
                                <span>Libres: {m.totalLibre}</span>
                                <span>Total: {m.totalDisponible}</span>
                            </div>

                            {/* Per-consultorio mini bars */}
                            <div style={{ marginTop: '12px', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                {Object.entries(m.porConsultorio).map(([cid, cm]) => (
                                    <div key={cid} title={`Cons. ${m.consultorios?.find(x => x.id === cid)?.numero || '?'}: ${cm.tasa}%`} style={{
                                        width: '18px', height: '18px', borderRadius: '4px',
                                        background: cm.tasa >= 90 ? '#22C55E' : cm.tasa >= 70 ? '#FDE68A' : cm.tasa >= 40 ? '#FED7AA' : '#FECACA',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.5rem', fontWeight: 700, color: cm.tasa >= 90 ? 'white' : 'var(--neutral-600)',
                                        cursor: 'default',
                                    }}>
                                        {m.consultorios?.find(x => x.id === cid)?.numero || ''}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Franja distribution */}
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '12px', color: 'var(--neutral-700)' }}>
                <Clock size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Distribución por Franja Horaria
            </h3>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                {[
                    { key: 'mañana', label: 'Mañana', color: '#3B82F6', bg: '#EFF6FF' },
                    { key: 'siesta', label: 'Siesta', color: '#F59E0B', bg: '#FFFBEB' },
                    { key: 'tarde', label: 'Tarde', color: '#22C55E', bg: '#F0FDF4' },
                ].map(f => {
                    const count = franjaDistrib[f.key] || 0;
                    const pct = totalFranjas > 0 ? Math.round((count / totalFranjas) * 100) : 0;
                    return (
                        <div key={f.key} style={{
                            flex: 1, padding: '16px 20px', borderRadius: '12px',
                            border: `1px solid ${f.color}22`, background: f.bg,
                        }}>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: f.color, marginBottom: '4px' }}>{f.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neutral-800)' }}>{count}</div>
                            <div style={{ height: '6px', borderRadius: '3px', background: `${f.color}20`, marginTop: '8px' }}>
                                <div style={{ height: '100%', borderRadius: '3px', width: `${pct}%`, background: f.color, transition: 'width 0.5s ease' }} />
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--neutral-500)', marginTop: '4px' }}>{pct}% del total</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function KPICard({ icon, label, value, subtext, accent }) {
    return (
        <div style={{
            padding: '16px 20px', borderRadius: '12px',
            border: '1px solid var(--neutral-200)', background: 'white',
            display: 'flex', alignItems: 'flex-start', gap: '14px',
        }}>
            <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `${accent}15`, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: accent, flexShrink: 0,
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neutral-800)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--neutral-400)', marginTop: '4px' }}>{subtext}</div>
            </div>
        </div>
    );
}

const iconBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '30px', height: '30px', borderRadius: '8px',
    border: '1px solid var(--neutral-200)', background: 'white',
    cursor: 'pointer', color: 'var(--neutral-500)',
};
