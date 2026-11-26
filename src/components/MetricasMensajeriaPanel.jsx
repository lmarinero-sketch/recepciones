import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    MessageSquareText, FileText, Send, PieChart as PieChartIcon, Clock,
    TrendingUp, BarChart3
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    PieChart, Pie, Cell
} from 'recharts';
import { supabase } from '../lib/supabase';
import {
    AnalyticsShell, AnalyticsKpiCard, AnalyticsCard, SegmentedControl,
    RefreshButton, AnalyticsLoader, EmptyChartState,
    ANALYTICS_PALETTE, CHART_SERIES_COLORS, TOOLTIP_STYLE, dateInputStyle,
} from './ui/AnalyticsPrimitives';

export default function MetricasMensajeriaPanel({ addToast }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('resumen'); // 'resumen' | 'plantillas'

    // Date filter state
    const [datePreset, setDatePreset] = useState('mes'); // 'hoy', 'mes', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
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
                    return;
                }
                fromDate = new Date(`${customStartDate}T00:00:00`);
                toDate = new Date(`${customEndDate}T23:59:59`);
            }

            const allData = [];
            let isFetching = true;
            const step = 1000;
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
                    allData.push(...data);
                    from += step;
                    if (data.length < step) isFetching = false;
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
    }, [datePreset, customStartDate, customEndDate, addToast]);

    useEffect(() => {
        if (datePreset !== 'custom' || (customStartDate && customEndDate)) {
            loadData();
        }
    }, [loadData, datePreset, customStartDate, customEndDate]);

    const metrics = useMemo(() => {
        const totalEnviadas = messages.length;
        const typeBreakdown = {};
        const dailyCounts = {};
        const hourlyCounts = {};

        for (let i = 0; i < 24; i++) hourlyCounts[i] = 0;

        messages.forEach(m => {
            let templateName = 'Desconocida';
            if (m.raw_payload?.template_name) {
                templateName = m.raw_payload.template_name;
            } else {
                const match = (m.content || '').match(/\[Plantilla (Meta|Masiva)\](.*?):/i);
                if (match && match[2]) {
                    templateName = match[2].trim();
                } else if ((m.content || '').includes('Encuesta de Satisfacción')) {
                    templateName = 'Encuesta de Satisfacción';
                }
            }

            typeBreakdown[templateName] = (typeBreakdown[templateName] || 0) + 1;

            const dateObj = new Date(m.created_at);
            const dayStr = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

            if (!dailyCounts[dayStr]) {
                dailyCounts[dayStr] = { date: dayStr, total: 0 };
            }
            dailyCounts[dayStr].total += 1;
            dailyCounts[dayStr][templateName] = (dailyCounts[dayStr][templateName] || 0) + 1;

            const hour = dateObj.getHours();
            hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
        });

        const typeBreakdownArr = Object.entries(typeBreakdown)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        const topTypesArr = typeBreakdownArr.slice(0, 5);

        const dailyChartData = Object.values(dailyCounts).sort((a, b) => {
            const [d1, m1] = a.date.split('/');
            const [d2, m2] = b.date.split('/');
            return new Date(2026, Number(m1) - 1, Number(d1)).getTime() - new Date(2026, Number(m2) - 1, Number(d2)).getTime();
        });

        const hourlyChartData = Object.entries(hourlyCounts).map(([hour, count]) => ({
            hour: `${hour.padStart(2, '0')}:00`,
            count,
        }));

        const peakHourObj = [...hourlyChartData].sort((a, b) => b.count - a.count)[0];
        const avgPerDay = dailyChartData.length > 0 ? Math.round(totalEnviadas / dailyChartData.length) : 0;

        return {
            totalEnviadas,
            typeBreakdown: typeBreakdownArr,
            topTypes: topTypesArr,
            dailyChartData,
            hourlyChartData,
            uniqueTemplates: typeBreakdownArr.length,
            peakHour: peakHourObj && peakHourObj.count > 0 ? peakHourObj : null,
            avgPerDay,
        };
    }, [messages]);

    return (
        <AnalyticsShell
            icon={MessageSquareText}
            title="KPIs de Plantillas Meta"
            subtitle="Monitoreo de volumen, tendencias diarias y horarios de envío de plantillas oficiales de WhatsApp."
            controls={
                <>
                    <SegmentedControl
                        value={datePreset}
                        onChange={setDatePreset}
                        options={[
                            { id: 'hoy', label: 'Hoy' },
                            { id: 'mes', label: 'Este Mes' },
                            { id: 'custom', label: 'Fechas' },
                        ]}
                    />
                    {datePreset === 'custom' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} style={dateInputStyle} />
                            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>a</span>
                            <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} style={dateInputStyle} />
                        </div>
                    )}
                    <RefreshButton onClick={loadData} loading={loading} />
                </>
            }
            tabs={[
                { id: 'resumen', label: 'Resumen y Evolución', icon: BarChart3 },
                { id: 'plantillas', label: 'Desglose por Plantilla', icon: PieChartIcon, badge: metrics.uniqueTemplates },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            {loading && messages.length === 0 ? (
                <AnalyticsLoader text="Cargando métricas de plantillas Meta..." />
            ) : activeTab === 'resumen' ? (
                <>
                    {/* 4 KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <AnalyticsKpiCard
                            label="Total Plantillas Enviadas"
                            value={metrics.totalEnviadas.toLocaleString('es-AR')}
                            subtext="Mensajes oficiales despachados vía API de Meta en el período."
                            icon={Send}
                            accent={ANALYTICS_PALETTE.blue}
                            bg="#F0F9FF"
                        />
                        <AnalyticsKpiCard
                            label="Plantillas Distintas Usadas"
                            value={metrics.uniqueTemplates}
                            subtext={metrics.topTypes[0] ? `Principal: ${metrics.topTypes[0].name}` : 'Sin registros en el período'}
                            icon={FileText}
                            accent={ANALYTICS_PALETTE.emerald}
                            bg="#ECFDF5"
                        />
                        <AnalyticsKpiCard
                            label="Promedio Diario"
                            value={metrics.avgPerDay.toLocaleString('es-AR')}
                            subtext={`Calculado sobre ${metrics.dailyChartData.length} día${metrics.dailyChartData.length !== 1 ? 's' : ''} con envíos.`}
                            icon={TrendingUp}
                            accent={ANALYTICS_PALETTE.indigo}
                            bg="#EEF2FF"
                        />
                        <AnalyticsKpiCard
                            label="Hora Pico de Envío"
                            value={metrics.peakHour ? metrics.peakHour.hour : '—'}
                            pill={metrics.peakHour ? `${metrics.peakHour.count} envíos` : null}
                            subtext="Franja horaria con mayor volumen de disparos automáticos y manuales."
                            icon={Clock}
                            accent={ANALYTICS_PALETTE.amber}
                            bg="#FFFBEB"
                        />
                    </div>

                    {/* Gráficos de Evolución Diaria y Distribución Horaria */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                        <AnalyticsCard
                            title="Evolución de Envíos Diarios"
                            subtitle="Volumen diario apilado por las 5 plantillas oficiales más utilizadas"
                            explanation="Permite auditar el consumo diario de conversaciones iniciadas por Meta y detectar picos de recordatorios o campañas."
                        >
                            {metrics.dailyChartData.length > 0 ? (
                                <div style={{ height: '270px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <BarChart data={metrics.dailyChartData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                                            <Legend wrapperStyle={{ paddingTop: '8px', fontSize: '0.75rem' }} />
                                            {metrics.topTypes.map((type, i) => (
                                                <Bar
                                                    key={type.name}
                                                    dataKey={type.name}
                                                    stackId="a"
                                                    fill={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
                                                    radius={i === metrics.topTypes.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]}
                                                />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <EmptyChartState />
                            )}
                        </AnalyticsCard>

                        <AnalyticsCard
                            title="Distribución por Franja Horaria"
                            subtitle="Cantidad de plantillas enviadas según la hora del día (00:00 a 23:00)"
                            explanation="Ayuda a verificar que los recordatorios y notificaciones se despachen en horarios de alta lectura por parte de los pacientes."
                        >
                            <div style={{ height: '270px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <BarChart data={metrics.hourlyChartData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            cursor={{ fill: '#F8FAFC' }}
                                            contentStyle={TOOLTIP_STYLE}
                                            formatter={v => [`${v} envíos`, 'Cantidad']}
                                            labelFormatter={l => `Franja: ${l}`}
                                        />
                                        <Bar dataKey="count" fill={ANALYTICS_PALETTE.blue} radius={[5, 5, 0, 0]} barSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </AnalyticsCard>
                    </div>
                </>
            ) : (
                /* TAB 2: Desglose por Plantilla */
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(380px, 1.4fr)', gap: '20px' }}>
                    <AnalyticsCard
                        title="Participación por Plantilla (Top 5)"
                        subtitle="Proporción de envíos sobre el total del período"
                        explanation="Muestra qué plantillas concentran la mayor parte del consumo de la API de WhatsApp Business."
                    >
                        {metrics.topTypes.length > 0 ? (
                            <div style={{ height: '280px', width: '100%' }}>
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie
                                            data={metrics.topTypes}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={62}
                                            outerRadius={96}
                                            paddingAngle={3}
                                            dataKey="count"
                                            nameKey="name"
                                        >
                                            {metrics.topTypes.map((_e, idx) => (
                                                <Cell key={idx} fill={CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} envíos`, 'Cantidad']} />
                                        <Legend wrapperStyle={{ fontSize: '0.76rem' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <EmptyChartState text="Sin plantillas registradas en este período." />
                        )}
                    </AnalyticsCard>

                    <AnalyticsCard
                        title={`Ranking Completo de Plantillas (${metrics.typeBreakdown.length})`}
                        subtitle="Detalle exacto de volumen y participación porcentual por nombre de plantilla"
                    >
                        {metrics.typeBreakdown.length === 0 ? (
                            <EmptyChartState text="Sin plantillas registradas en este período." />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                                {metrics.typeBreakdown.map((item, i) => {
                                    const pct = metrics.totalEnviadas > 0 ? ((item.count / metrics.totalEnviadas) * 100).toFixed(1) : '0.0';
                                    const color = CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length];
                                    return (
                                        <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                    <span style={{
                                                        width: '22px', height: '22px', borderRadius: '6px',
                                                        background: `${color}15`, color, fontWeight: 700, fontSize: '0.72rem',
                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    }}>
                                                        {i + 1}
                                                    </span>
                                                    <span style={{ fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>
                                                        {item.name}
                                                    </span>
                                                </div>
                                                <div style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                                    <strong style={{ color: '#0F172A' }}>{item.count.toLocaleString('es-AR')}</strong>
                                                    <span style={{ color: '#64748B', fontSize: '0.74rem', marginLeft: '6px' }}>({pct}%)</span>
                                                </div>
                                            </div>
                                            <div style={{ height: '6px', borderRadius: '999px', background: '#F1F5F9', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '999px' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </AnalyticsCard>
                </div>
            )}
        </AnalyticsShell>
    );
}
