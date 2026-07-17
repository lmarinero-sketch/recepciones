import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, RefreshCw, Calendar, MessageSquareText, FileText, Send, Phone, PieChart as PieChartIcon, Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';

export default function MetricasMensajeriaPanel({ addToast }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Date filter state
    const [datePreset, setDatePreset] = useState('mes'); // 'hoy', 'mes', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            // Determine date range
            const now = new Date();
            let fromDate = new Date();
            let toDate = new Date();
            
            if (datePreset === 'hoy') {
                fromDate.setHours(0, 0, 0, 0);
                toDate.setHours(23, 59, 59, 999);
            } else if (datePreset === 'mes') {
                fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
                toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (datePreset === 'custom') {
                if (!customStartDate || !customEndDate) {
                    setLoading(false);
                    return; // Wait for both dates
                }
                // Need timezone handling, simplified here
                fromDate = new Date(`${customStartDate}T00:00:00`);
                toDate = new Date(`${customEndDate}T23:59:59`);
            }

            let allData = [];
            let isFetching = true;
            let step = 1000;
            let from = 0;

            while (isFetching) {
                const { data, error } = await supabase
                    .from('whatsapp_messages')
                    .select('id, created_at, content, raw_payload, line_id, phone')
                    .gte('created_at', fromDate.toISOString())
                    .lte('created_at', toDate.toISOString())
                    .ilike('content', '%plantilla%')
                    .order('created_at', { ascending: false })
                    .range(from, from + step - 1);

                if (error) throw error;
                
                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                    from += step;
                    if (data.length < step) {
                        isFetching = false;
                    }
                } else {
                    isFetching = false;
                }
            }

            setMessages(allData);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando métricas de mensajería', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Automatically load if not custom, or if custom and both dates exist
        if (datePreset !== 'custom' || (customStartDate && customEndDate)) {
            loadData();
        }
    }, [datePreset, customStartDate, customEndDate]);

    // Calculate metrics
    const metrics = useMemo(() => {
        const totalEnviadas = messages.length;
        
        const typeBreakdown = {};
        const dailyCounts = {};
        const hourlyCounts = {};
        
        // Initialize hourly counts (0 to 23)
        for (let i = 0; i < 24; i++) {
            hourlyCounts[i] = 0;
        }

        messages.forEach(m => {
            // Determine template name
            let templateName = 'Desconocida';
            if (m.raw_payload?.template_name) {
                templateName = m.raw_payload.template_name;
            } else {
                // Try to extract from content "📋 [Plantilla Meta] name:"
                const match = m.content.match(/\[Plantilla (Meta|Masiva)\](.*?):/i);
                if (match && match[2]) {
                    templateName = match[2].trim();
                } else if (m.content.includes('Encuesta de Satisfacción')) {
                    templateName = 'Encuesta de Satisfacción';
                }
            }
            
            typeBreakdown[templateName] = (typeBreakdown[templateName] || 0) + 1;

            // Daily chart grouping
            const dateObj = new Date(m.created_at);
            const dayStr = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
            
            if (!dailyCounts[dayStr]) {
                dailyCounts[dayStr] = { date: dayStr, total: 0 };
            }
            dailyCounts[dayStr].total += 1;
            dailyCounts[dayStr][templateName] = (dailyCounts[dayStr][templateName] || 0) + 1;
            
            // Hourly distribution
            const hour = dateObj.getHours();
            hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
        });

        // Convert breakdown to array and sort
        const typeBreakdownArr = Object.entries(typeBreakdown)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
            
        const topTypesArr = typeBreakdownArr.slice(0, 5);

        // Convert daily to array, sorted by date
        const dailyChartData = Object.values(dailyCounts).sort((a, b) => {
            const [d1, m1] = a.date.split('/');
            const [d2, m2] = b.date.split('/');
            return new Date(2026, m1-1, d1).getTime() - new Date(2026, m2-1, d2).getTime();
        });
        
        // Convert hourly to array
        const hourlyChartData = Object.entries(hourlyCounts).map(([hour, count]) => ({
            hour: `${hour.padStart(2, '0')}:00`,
            count
        }));

        return {
            totalEnviadas,
            typeBreakdown: typeBreakdownArr,
            topTypes: topTypesArr,
            dailyChartData,
            hourlyChartData,
            uniqueTemplates: typeBreakdownArr.length
        };
    }, [messages]);

    const COLORS = ['#6366F1', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#EC4899', '#3B82F6'];

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h2 style={{
                        fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0,
                        display: 'flex', alignItems: 'center', gap: '10px'
                    }}>
                        <MessageSquareText size={24} color="#6366F1" />
                        KPIs de Plantillas Meta
                    </h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        Análisis de mensajes y plantillas oficiales enviadas.
                    </p>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: '10px', padding: '4px' }}>
                        <button
                            onClick={() => setDatePreset('hoy')}
                            style={{
                                padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600, border: 'none',
                                borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                                background: datePreset === 'hoy' ? '#fff' : 'transparent',
                                color: datePreset === 'hoy' ? '#3B82F6' : '#64748B',
                                boxShadow: datePreset === 'hoy' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                            }}
                        >
                            Hoy
                        </button>
                        <button
                            onClick={() => setDatePreset('mes')}
                            style={{
                                padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600, border: 'none',
                                borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                                background: datePreset === 'mes' ? '#fff' : 'transparent',
                                color: datePreset === 'mes' ? '#3B82F6' : '#64748B',
                                boxShadow: datePreset === 'mes' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                            }}
                        >
                            Este Mes
                        </button>
                        <button
                            onClick={() => setDatePreset('custom')}
                            style={{
                                padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600, border: 'none',
                                borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                                background: datePreset === 'custom' ? '#fff' : 'transparent',
                                color: datePreset === 'custom' ? '#3B82F6' : '#64748B',
                                boxShadow: datePreset === 'custom' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                            }}
                        >
                            Personalizado
                        </button>
                    </div>

                    {datePreset === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}
                            />
                            <span style={{ color: '#94A3B8' }}>-</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.85rem' }}
                            />
                        </div>
                    )}

                    <button
                        onClick={loadData}
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                            fontSize: '0.9rem', fontWeight: 600, color: '#334155', cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                    >
                        <RefreshCw size={16} className={loading ? "spin" : ""} />
                        Actualizar
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                {loading && messages.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#94a3b8' }}>
                        Cargando métricas...
                    </div>
                ) : (
                    <>
                        {/* Top Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                            {/* Card 1 */}
                            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div style={{ background: '#EEF2FF', padding: '12px', borderRadius: '12px' }}>
                                        <Send size={24} color="#6366F1" />
                                    </div>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Total Plantillas Enviadas</h3>
                                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e293b', marginTop: '8px' }}>
                                    {metrics.totalEnviadas.toLocaleString('es-AR')}
                                </div>
                            </div>

                            {/* Card 2 */}
                            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div style={{ background: '#F0FDF4', padding: '12px', borderRadius: '12px' }}>
                                        <FileText size={24} color="#22C55E" />
                                    </div>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Tipos Únicos Usados</h3>
                                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1e293b', marginTop: '8px' }}>
                                    {metrics.uniqueTemplates}
                                </div>
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Evolución Diaria */}
                                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
                                    <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                        Evolución de Envíos Diarios
                                    </h3>
                                    {metrics.dailyChartData.length > 0 ? (
                                        <div style={{ height: '300px', width: '100%' }}>
                                            <ResponsiveContainer>
                                                <BarChart data={metrics.dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                                                        itemStyle={{ fontSize: '0.85rem' }}
                                                    />
                                                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '0.85rem' }} />
                                                    {metrics.topTypes.map((type, i) => (
                                                        <Bar key={type.name} dataKey={type.name} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === metrics.topTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                                                    ))}
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                            No hay datos para graficar en este período.
                                        </div>
                                    )}
                                </div>

                                {/* Distribución Horaria */}
                                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
                                    <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Clock size={20} color="#14B8A6" />
                                        Distribución por Hora
                                    </h3>
                                    <div style={{ height: '220px', width: '100%' }}>
                                        <ResponsiveContainer>
                                            <BarChart data={metrics.hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    cursor={{ fill: '#f8fafc' }}
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                                                    itemStyle={{ fontSize: '0.85rem' }}
                                                    formatter={(value) => [value, 'Envíos']}
                                                    labelFormatter={(label) => `Hora: ${label}`}
                                                />
                                                <Bar dataKey="count" fill="#14B8A6" radius={[4, 4, 0, 0]} barSize={12} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {/* Desglose por Plantilla (Pie Chart + Lista) */}
                                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', flex: 1 }}>
                                    <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <PieChartIcon size={20} color="#F59E0B" />
                                        Desglose por Plantilla
                                    </h3>
                                    
                                    {metrics.topTypes.length > 0 ? (
                                        <>
                                            <div style={{ height: '220px', width: '100%', marginBottom: '20px' }}>
                                                <ResponsiveContainer>
                                                    <PieChart>
                                                        <Pie
                                                            data={metrics.topTypes}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={60}
                                                            outerRadius={80}
                                                            paddingAngle={5}
                                                            dataKey="count"
                                                        >
                                                            {metrics.topTypes.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip 
                                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                                                            itemStyle={{ fontSize: '0.85rem' }}
                                                            formatter={(value) => [value, 'Envíos']}
                                                        />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                {metrics.typeBreakdown.slice(0, 8).map((item, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${COLORS[i % COLORS.length]}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS[i % COLORS.length], fontWeight: 700, fontSize: '0.9rem' }}>
                                                            {i + 1}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>
                                                                {item.name}
                                                            </div>
                                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                                {((item.count / metrics.totalEnviadas) * 100).toFixed(1)}% del total
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                                            {item.count}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Sin plantillas registradas</div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </>
                )}
            </div>
        </div>
    );
}
