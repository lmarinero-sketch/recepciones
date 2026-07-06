import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, TrendingUp, Users, Calendar, Loader2, RefreshCw,
    ArrowUpRight, ArrowDownRight, Minus, Building2, Activity, CalendarCheck, Info
} from 'lucide-react';
import {
    ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import { fetchChequeoMetrics, fetchMarketingCandidates } from '../services/visitasService';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#64748b'];

function aggregateData(data, selectedYear) {
    const byMonth = {};
    const uniqueAll = new Set();
    const obraSocialCounts = {};

    data.forEach(v => {
        if (!v.fecha || !v.dni) return;
        if (selectedYear !== 'todos' && !v.fecha.startsWith(selectedYear)) return;

        // Contar pacientes únicos globales y por obra social
        if (!uniqueAll.has(v.dni)) {
            uniqueAll.add(v.dni);
            const os = v.obra_social || 'Particular/Sin OS';
            obraSocialCounts[os] = (obraSocialCounts[os] || 0) + 1;
        }

        const month = v.fecha.substring(0, 7);
        if (!byMonth[month]) {
            byMonth[month] = { dnis: new Set(), presentes: new Set(), ausentes: new Set() };
        }
        
        byMonth[month].dnis.add(v.dni);
        if (v.asistencia === 'Presente') byMonth[month].presentes.add(v.dni);
        if (v.asistencia === 'Ausente') byMonth[month].ausentes.add(v.dni);
    });

    const months = Object.keys(byMonth).sort();
    const result = months.map((m, idx) => {
        const prev = idx > 0 ? byMonth[months[idx - 1]] : null;
        const curr = byMonth[m];
        const change = prev && prev.dnis.size > 0 ? ((curr.dnis.size - prev.dnis.size) / prev.dnis.size * 100) : 0;
        const [y, mo] = m.split('-');
        return {
            month: m,
            label: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y.slice(2)}`,
            labelFull: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`,
            year: y,
            pacientes: curr.dnis.size,
            presentes: curr.presentes.size,
            ausentes: curr.ausentes.size,
            change: Math.round(change),
        };
    });

    const topOS = Object.entries(obraSocialCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));

    // Agregar "Otros" si hay más de 5
    const othersCount = Object.entries(obraSocialCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(5)
        .reduce((sum, [, count]) => sum + count, 0);
        
    if (othersCount > 0) {
        topOS.push({ name: 'Otras', value: othersCount });
    }

    return { months: result, uniquePatients: uniqueAll.size, topOS };
}

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

function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
        <div style={{
            background: '#fff', borderRadius: '12px', padding: '14px 18px',
            boxShadow: '0 8px 30px rgba(0,0,0,.12)', border: '1px solid #e2e8f0',
            minWidth: '180px',
        }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', marginBottom: '8px' }}>{d.labelFull}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748b' }}>Pacientes Atendidos</span>
                    <span style={{ fontWeight: 700, color: '#10b981' }}>{d.pacientes.toLocaleString()}</span>
                </div>
                {d.change !== 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                        fontSize: '0.72rem', fontWeight: 600,
                        color: d.change > 0 ? '#10b981' : '#ef4444',
                    }}>
                        {d.change > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {d.change > 0 ? '+' : ''}{d.change}% vs mes anterior
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MetricasChequeoPanel({ addToast }) {
    const [rawData, setRawData] = useState([]);
    const [marketingData, setMarketingData] = useState([]);
    const [scheduledData, setScheduledData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState('');
    const [selectedYear, setSelectedYear] = useState('todos');
    const [showInfo, setShowInfo] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, mData] = await Promise.all([
                fetchChequeoMetrics((msg) => setProgress(msg)),
                fetchMarketingCandidates()
            ]);
            
            const rawScheduled = localStorage.getItem('scheduled_checkups_v1');
            const scheduled = rawScheduled ? Object.values(JSON.parse(rawScheduled)) : [];
            
            setRawData(data);
            setMarketingData(mData);
            setScheduledData(scheduled);
            setProgress('');
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando métricas', 'error');
        } finally {
            setLoading(false);
        }
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

    // Calcular datos agregados según el año seleccionado
    const aggregated = useMemo(() => aggregateData(rawData, selectedYear), [rawData, selectedYear]);

    const stats = useMemo(() => {
        const avg = aggregated.months.length > 0 
            ? Math.round(aggregated.months.reduce((sum, m) => sum + m.pacientes, 0) / aggregated.months.length) 
            : 0;
            
        const peak = aggregated.months.reduce((best, m) => m.pacientes > best.pacientes ? m : best, { pacientes: 0, labelFull: '-' });
        
        const topOS = aggregated.topOS[0] || { name: '-', value: 0 };

        return { uniquePatients: aggregated.uniquePatients, avg, peak, topOS };
    }, [aggregated]);

    const projectionData = useMemo(() => {
        const now = new Date();
        const monthsNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
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
            const label = `${monthsNames[targetDate.getMonth()]} ${targetDate.getFullYear().toString().slice(2)}`;
            
            const countTotales = marketingData.filter(p => p.meses_desde_ultima === targetMeses).length;
            const countContactables = marketingData.filter(p => p.meses_desde_ultima === targetMeses && p.telefono1).length;
            
            data.push({
                name: label,
                total: countTotales,
                contactables: countContactables,
            });
        }
        return data;
    }, [marketingData]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#94a3b8' }}>
                <Loader2 size={32} className="spin" />
                <span style={{ marginTop: '10px', fontSize: '0.88rem' }}>Cargando métricas...</span>
                {progress && <span style={{ marginTop: '4px', fontSize: '0.78rem', color: '#3b82f6' }}>{progress}</span>}
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexShrink: 0 }}>
                <div>
                    <h2 style={{
                        fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0,
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <BarChart3 size={20} color="#fff" />
                        </div>
                        Métricas de Chequeos
                    </h2>
                <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px', maxWidth: '600px', lineHeight: 1.5 }}>
                    Análisis del volumen total de la agenda. <strong>"Paciente Atendido"</strong> contabiliza a todo paciente único que tuvo un turno de CHQ en el mes, sin importar si luego fue marcado como Presente o Ausente. Toda la data se alimenta de la tabla histórica de visitas.
                </p>
            </div>
            <button onClick={loadData} disabled={loading} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600,
            }}>
                <RefreshCw size={14} /> Actualizar
            </button>
        </div>

            {/* Year Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                    onClick={() => setSelectedYear('todos')}
                    style={{
                        padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: 700, transition: 'all .15s',
                        background: selectedYear === 'todos' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : '#f1f5f9',
                        color: selectedYear === 'todos' ? '#fff' : '#64748b',
                        boxShadow: selectedYear === 'todos' ? '0 2px 8px rgba(139,92,246,.3)' : 'none',
                    }}
                >Todos los años</button>
                {years.map(y => (
                    <button key={y} onClick={() => setSelectedYear(y)} style={{
                        padding: '6px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: 700, transition: 'all .15s',
                        background: selectedYear === y ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#f1f5f9',
                        color: selectedYear === y ? '#fff' : '#64748b',
                        boxShadow: selectedYear === y ? '0 2px 8px rgba(59,130,246,.3)' : 'none',
                    }}>{y}</button>
                ))}
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px', flexShrink: 0 }}>
                <StatCard icon={Users} label="Total Pacientes Únicos" value={stats.uniquePatients.toLocaleString()} color="#10b981" bg="#ecfdf5" />
                <StatCard icon={CalendarCheck} label="Turnos Agendados" value={scheduledData.length.toLocaleString()} sub={`${scheduledData.filter(s => s.estado === 'confirmo').length} ya confirmaron asistencia`} color="#0ea5e9" bg="#e0f2fe" />
                <StatCard icon={Calendar} label="Promedio Mensual" value={stats.avg.toLocaleString()} color="#3b82f6" bg="#eff6ff" />
                <StatCard icon={TrendingUp} label="Mes Pico" value={stats.peak.labelFull || '-'}
                    sub={stats.peak.pacientes > 0 ? `${stats.peak.pacientes.toLocaleString()} pacientes` : ''} color="#f59e0b" bg="#fffbeb" />
                <StatCard icon={Building2} label="Obra Social Principal" value={stats.topOS.name.substring(0, 15) + (stats.topOS.name.length > 15 ? '...' : '')}
                    sub={`${stats.topOS.value.toLocaleString()} pacientes`} color="#8b5cf6" bg="#f5f3ff" />
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Projection Chart */}
                <div style={{
                    background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={18} color="#f59e0b" />
                            Proyección de Marketing
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right', maxWidth: '300px', lineHeight: 1.4 }}>
                            Agrupa a los pacientes por su fecha de vencimiento anual (hace 12 meses o más). 
                            <br/><span style={{color: '#10b981', fontWeight: 600}}>Contactables</span> indica cuántos tienen un teléfono válido.
                        </div>
                    </div>
                    
                    <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={projectionData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                                    labelStyle={{ fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
                                <Bar dataKey="total" name="Total Pacientes que vencen" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="contactables" name="Contactables (Tienen Teléfono)" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '20px' }}>
                    {/* Main Chart */}
                    <div style={{
                        flex: 2, background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                                    Evolución Mensual de Pacientes
                                </h3>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0 0', maxWidth: '400px' }}>
                                    Muestra el volumen total de pacientes agendados por mes. Incluye a todos los pacientes (Presentes y Ausentes).
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '0.72rem', color: '#94a3b8' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981' }} /> Pacientes
                                </span>
                            </div>
                        </div>

                        {aggregated.months.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <ComposedChart data={aggregated.months} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <defs>
                                        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.7} />
                                        </linearGradient>
                                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                                            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="pacientes" fill="url(#barGrad)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    <Area dataKey="pacientes" fill="url(#areaGrad)" stroke="none" />
                                    <Line dataKey="pacientes" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5, fill: '#059669' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                Sin datos para el período seleccionado
                            </div>
                        )}
                    </div>

                    {/* Obra Social Pie Chart */}
                    <div style={{
                        flex: 1, background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px',
                        display: 'flex', flexDirection: 'column',
                    }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                            Top Obras Sociales
                        </h3>
                        {aggregated.topOS.length > 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                                <div style={{ position: 'relative', height: '180px', flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={aggregated.topOS}
                                                cx="50%" cy="50%"
                                                innerRadius={60} outerRadius={80}
                                                paddingAngle={2}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {aggregated.topOS.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip 
                                                formatter={(value) => [`${value} pacientes`, 'Cantidad']}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div style={{
                                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{stats.uniquePatients}</div>
                                        <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>TOTAL</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {aggregated.topOS.map((os, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[idx % COLORS.length], flexShrink: 0 }} />
                                                <span style={{ color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{os.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{os.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                Sin datos
                            </div>
                        )}
                    </div>
                </div>

                {/* Monthly Table */}
                <div style={{
                    background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden',
                }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#475569' }}>
                            Detalle Mes a Mes ({aggregated.months.length} meses)
                        </h3>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Desglosa el volumen total para separar quiénes realmente asistieron (<strong>Presentes</strong>) de los que faltaron (<strong>Ausentes</strong>).
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                    {['Mes', 'Pacientes Únicos', 'Presentes', 'Ausentes', 'Tendencia'].map(h => (
                                        <th key={h} style={{
                                            padding: '10px 16px', textAlign: h === 'Mes' ? 'left' : 'right',
                                            fontWeight: 700, color: '#64748b', fontSize: '0.72rem',
                                            textTransform: 'uppercase', letterSpacing: '0.5px',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...aggregated.months].reverse().map((m, idx) => (
                                    <tr key={m.month} style={{
                                        borderBottom: '1px solid #f8fafc',
                                        background: idx % 2 === 0 ? '#fff' : '#fafbfc',
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}
                                    >
                                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e293b' }}>
                                            {m.labelFull}
                                        </td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                            {m.pacientes.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b' }}>
                                            {m.presentes.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b' }}>
                                            {m.ausentes.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                            {m.change !== 0 ? (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                                    background: m.change > 0 ? '#ecfdf5' : '#fef2f2',
                                                    color: m.change > 0 ? '#059669' : '#dc2626',
                                                }}>
                                                    {m.change > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                                                    {m.change > 0 ? '+' : ''}{m.change}%
                                                </span>
                                            ) : (
                                                <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>
                                                    <Minus size={11} /> —
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                    <td style={{ padding: '12px 16px', fontWeight: 800, color: '#1e293b' }}>TOTAL</td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: '0.9rem' }}>
                                        {stats.uniquePatients.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>
                                        {aggregated.months.reduce((s, m) => s + m.presentes, 0).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>
                                        {aggregated.months.reduce((s, m) => s + m.ausentes, 0).toLocaleString()}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
