import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BarChart3, MessageSquare, Target, Trophy,
    TrendingUp, ThumbsUp, Calendar, Phone, Mic, Search, Building2,
    User, Clock, PieChart as PieIcon
} from 'lucide-react';
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend
} from 'recharts';
import { fetchDetalleEncuestas } from '../services/visitasService';
import {
    AnalyticsShell, AnalyticsKpiCard, AnalyticsCard, SegmentedControl,
    RefreshButton, AnalyticsLoader, EmptyChartState,
    ANALYTICS_PALETTE, TOOLTIP_STYLE, selectInputStyle,
} from './ui/AnalyticsPrimitives';

const Q2_LABELS = {
    A: 'A. Sí, todo fue muy claro',
    B: 'B. Entendí, pero quedaron dudas',
    C: 'C. Faltó información o claridad',
};

const Q3_LABELS = {
    A: 'A. Excelente',
    B: 'B. Buena',
    C: 'C. Regular',
    D: 'D. Mala',
};

export default function MetricasEncuestasPanel({ addToast }) {
    const [encuestas, setEncuestas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [periodFilter, setPeriodFilter] = useState('all'); // 'all' | 'nov2026' | '7d' | '30d'
    const [sedeFilter, setSedeFilter] = useState('all'); // 'all' | 'santafe' | 'sanluis'
    const [mainTab, setMainTab] = useState('indicadores'); // 'indicadores' | 'respuestas'
    const [activeTab, setActiveTab] = useState('respondidas'); // 'respondidas' | 'comentarios' | 'audios' | 'alertas' | 'pendientes'
    const [searchQuery, setSearchQuery] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchDetalleEncuestas();
            setEncuestas(data || []);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando métricas de encuestas', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredEncuestas = useMemo(() => {
        const now = new Date();
        return encuestas.filter(e => {
            if (periodFilter !== 'all' && e.created_at) {
                const created = new Date(e.created_at);
                if (periodFilter === 'nov2026') {
                    if (created < new Date('2026-11-01T00:00:00-03:00')) return false;
                } else if (periodFilter === '7d') {
                    if ((now - created) / (1000 * 60 * 60 * 24) > 7) return false;
                } else if (periodFilter === '30d') {
                    if ((now - created) / (1000 * 60 * 60 * 24) > 30) return false;
                }
            }

            if (sedeFilter !== 'all') {
                const centro = String(e.centro || e.tipo_visita || '').toLowerCase();
                if (sedeFilter === 'sanluis' && !centro.includes('san luis')) return false;
                if (sedeFilter === 'santafe' && (centro.includes('san luis') || !centro)) return false;
            }

            if (searchQuery.trim()) {
                const q = searchQuery.trim().toLowerCase();
                const match = [e.nombre_paciente, e.telefono, e.dni, e.obra_social, e.cierre_comentario]
                    .some(v => String(v || '').toLowerCase().includes(q));
                if (!match) return false;
            }

            return true;
        });
    }, [encuestas, periodFilter, sedeFilter, searchQuery]);

    const metrics = useMemo(() => {
        const totalEnviadas = filteredEncuestas.length;
        const respondidas = filteredEncuestas.filter(
            e => (e.q1_nps !== null && e.q1_nps !== undefined) || e.q2_claridad || e.q3_agilidad || e.estado === 'COMPLETADA' || e.cierre_audio_url || (e.cierre_comentario && e.cierre_comentario.trim().length > 0)
        );
        const respondidasCount = respondidas.length;
        const completadasCount = filteredEncuestas.filter(e => e.estado === 'COMPLETADA').length;
        const parcialesCount = Math.max(0, respondidasCount - completadasCount);
        const pendientes = filteredEncuestas.filter(e => e.estado === 'INVITADO');
        const pendientesCount = pendientes.length;

        let promotores = 0, detractores = 0, neutros = 0, validNpsCount = 0, npsSum = 0;
        const npsScores = { 10: 0, 9: 0, 8: 0, 7: 0, low: 0 };
        const q2Dist = { A: 0, B: 0, C: 0 };
        let q2Total = 0;
        const q3Dist = { A: 0, B: 0, C: 0, D: 0 };
        let q3Total = 0;

        const conTextoCount = respondidas.filter(e => e.cierre_comentario && e.cierre_comentario.trim().length > 0).length;
        const conAudioCount = respondidas.filter(e => Boolean(e.cierre_audio_url)).length;
        const conFeedbackCualitativo = respondidas.filter(
            e => (e.cierre_comentario && e.cierre_comentario.trim().length > 0) || Boolean(e.cierre_audio_url)
        );
        const alertasCalidad = respondidas.filter(
            e => (e.q1_nps !== null && e.q1_nps <= 6) || e.q2_claridad === 'C' || e.q3_agilidad === 'C' || e.q3_agilidad === 'D'
        );

        filteredEncuestas.forEach(e => {
            if (e.q1_nps !== null && e.q1_nps !== undefined) {
                const score = Number(e.q1_nps);
                validNpsCount++;
                npsSum += score;
                if (score >= 9) promotores++;
                else if (score <= 6) detractores++;
                else neutros++;

                if (score === 10) npsScores[10]++;
                else if (score === 9) npsScores[9]++;
                else if (score === 8) npsScores[8]++;
                else if (score === 7) npsScores[7]++;
                else npsScores.low++;
            }
            if (e.q2_claridad && q2Dist[e.q2_claridad] !== undefined) {
                q2Dist[e.q2_claridad]++;
                q2Total++;
            }
            if (e.q3_agilidad && q3Dist[e.q3_agilidad] !== undefined) {
                q3Dist[e.q3_agilidad]++;
                q3Total++;
            }
        });

        const nps = validNpsCount > 0 ? Math.round(((promotores / validNpsCount) - (detractores / validNpsCount)) * 100) : 0;
        const avgNps = validNpsCount > 0 ? (npsSum / validNpsCount).toFixed(1) : '0.0';
        const responseRate = totalEnviadas > 0 ? ((respondidasCount / totalEnviadas) * 100).toFixed(1) : '0.0';
        const q2PctA = q2Total > 0 ? Math.round((q2Dist.A / q2Total) * 100) : 0;
        const q3PositiveCount = (q3Dist.A || 0) + (q3Dist.B || 0);
        const q3PositivePct = q3Total > 0 ? Math.round((q3PositiveCount / q3Total) * 100) : 0;
        const q3ExcelentePct = q3Total > 0 ? Math.round(((q3Dist.A || 0) / q3Total) * 100) : 0;

        const npsPie = [
            { name: 'Promotores (9–10)', value: promotores, color: ANALYTICS_PALETTE.emerald },
            { name: 'Neutros (7–8)', value: neutros, color: ANALYTICS_PALETTE.amber },
            { name: 'Detractores (1–6)', value: detractores, color: ANALYTICS_PALETTE.rose },
        ].filter(x => x.value > 0);

        return {
            totalEnviadas, respondidas, respondidasCount, completadasCount, parcialesCount,
            pendientes, pendientesCount, responseRate, nps, avgNps, validNpsCount,
            promotores, neutros, detractores, npsScores, npsPie,
            q2Dist, q2Total, q2PctA, q3Dist, q3Total, q3PositiveCount, q3PositivePct, q3ExcelentePct,
            conTextoCount, conAudioCount, conFeedbackCualitativo, alertasCalidad,
        };
    }, [filteredEncuestas]);

    const displayedRows = useMemo(() => {
        if (activeTab === 'respondidas') return metrics.respondidas;
        if (activeTab === 'comentarios') return metrics.conFeedbackCualitativo;
        if (activeTab === 'audios') return metrics.respondidas.filter(e => Boolean(e.cierre_audio_url));
        if (activeTab === 'alertas') return metrics.alertasCalidad;
        if (activeTab === 'pendientes') return metrics.pendientes;
        return metrics.respondidas;
    }, [activeTab, metrics]);

    const npsBadge = metrics.nps >= 50
        ? { label: 'Excelente', bg: '#DCFCE7', color: '#15803D' }
        : metrics.nps >= 0
            ? { label: 'Bueno', bg: '#FEF3C7', color: '#B45309' }
            : { label: 'Crítico', bg: '#FEE2E2', color: '#B91C1C' };

    return (
        <AnalyticsShell
            icon={BarChart3}
            title="Auditoría de Calidad — Encuestas Post-Chequeo"
            subtitle="Monitoreo de NPS (Q1), Claridad Médica (Q2), Agilidad del Circuito (Q3) y Escucha Activa del Paciente (Q4)."
            controls={
                <>
                    <SegmentedControl
                        value={periodFilter}
                        onChange={setPeriodFilter}
                        options={[
                            { id: 'all', label: 'Histórico' },
                            { id: 'nov2026', label: 'Noviembre' },
                            { id: '7d', label: '7 días' },
                            { id: '30d', label: '30 días' },
                        ]}
                    />
                    <select value={sedeFilter} onChange={e => setSedeFilter(e.target.value)} style={selectInputStyle}>
                        <option value="all">Todas las Sedes</option>
                        <option value="santafe">Sede Santa Fe</option>
                        <option value="sanluis">Sede San Luis</option>
                    </select>
                    <RefreshButton onClick={loadData} loading={loading} />
                </>
            }
            tabs={[
                { id: 'indicadores', label: 'Indicadores de Calidad', icon: PieIcon },
                { id: 'respuestas', label: 'Respuestas y Escucha Activa', icon: MessageSquare, badge: metrics.respondidasCount },
            ]}
            activeTab={mainTab}
            onTabChange={setMainTab}
        >
            {loading ? (
                <AnalyticsLoader text="Cargando auditoría de encuestas..." />
            ) : mainTab === 'indicadores' ? (
                <>
                    {/* 4 KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <AnalyticsKpiCard
                            label="Tasa de Respuesta"
                            value={`${metrics.responseRate}%`}
                            pill={`${metrics.respondidasCount} / ${metrics.totalEnviadas}`}
                            subtext={`${metrics.completadasCount} completas · ${metrics.parcialesCount} parciales · ${metrics.pendientesCount} sin responder`}
                            icon={Target}
                            accent={ANALYTICS_PALETTE.blue}
                            bg="#F0F9FF"
                        />
                        <AnalyticsKpiCard
                            label="NPS & Calificación (Q1)"
                            value={metrics.nps > 0 ? `+${metrics.nps}` : metrics.nps}
                            pill={`${npsBadge.label} · ${metrics.avgNps}/10`}
                            pillBg={npsBadge.bg}
                            pillColor={npsBadge.color}
                            subtext={`Promotores: ${metrics.promotores} · Neutros: ${metrics.neutros} · Detractores: ${metrics.detractores}`}
                            icon={Trophy}
                            accent={ANALYTICS_PALETTE.emerald}
                            bg="#ECFDF5"
                        />
                        <AnalyticsKpiCard
                            label="Claridad Médica (Q2)"
                            value={`${metrics.q2PctA}%`}
                            pill={`${metrics.q2Dist.A} / ${metrics.q2Total}`}
                            subtext={`Con dudas: ${metrics.q2Dist.B} · Faltó claridad: ${metrics.q2Dist.C}`}
                            icon={ThumbsUp}
                            accent={ANALYTICS_PALETTE.indigo}
                            bg="#EEF2FF"
                        />
                        <AnalyticsKpiCard
                            label="Agilidad Positiva (Q3)"
                            value={`${metrics.q3PositivePct}%`}
                            pill={`${metrics.alertasCalidad.length} alertas`}
                            pillBg={metrics.alertasCalidad.length > 0 ? '#FEE2E2' : '#ECFDF5'}
                            pillColor={metrics.alertasCalidad.length > 0 ? '#B91C1C' : '#15803D'}
                            subtext={`Excelente: ${metrics.q3Dist.A} (${metrics.q3ExcelentePct}%) · Buena: ${metrics.q3Dist.B} · Reg/Mala: ${(metrics.q3Dist.C || 0) + (metrics.q3Dist.D || 0)}`}
                            icon={TrendingUp}
                            accent={ANALYTICS_PALETTE.amber}
                            bg="#FFFBEB"
                        />
                    </div>

                    {/* Fila de Gráficos: Donut NPS + Barras Q2 y Q3 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                        <AnalyticsCard
                            title="Distribución NPS (Q1)"
                            subtitle="Del 1 al 10, ¿qué tan probable es que nos recomiendes?"
                            badge={<span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{metrics.validNpsCount} resp.</span>}
                            explanation="El NPS surge de restar el % de Detractores (1–6) al % de Promotores (9–10). Un puntaje mayor a +50 se considera Excelente en salud."
                        >
                            {metrics.npsPie.length > 0 ? (
                                <div style={{ height: '230px', width: '100%' }}>
                                    <ResponsiveContainer>
                                        <PieChart>
                                            <Pie data={metrics.npsPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={86} paddingAngle={3}>
                                                {metrics.npsPie.map((entry, idx) => (
                                                    <Cell key={idx} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v} pacientes`, 'Cantidad']} />
                                            <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <EmptyChartState height={220} text="Sin calificaciones NPS aún." />
                            )}
                        </AnalyticsCard>

                        <AnalyticsCard
                            title="Claridad de Explicaciones Médicas (Q2)"
                            subtitle="¿Las explicaciones médicas fueron claras y útiles?"
                            badge={<span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{metrics.q2Total} resp.</span>}
                            explanation="Mide si el paciente comprendió los resultados e indicaciones del profesional durante el chequeo."
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '6px' }}>
                                <BarItem label="A. Sí, todo fue muy claro" count={metrics.q2Dist.A || 0} total={metrics.q2Total} color={ANALYTICS_PALETTE.emerald} />
                                <BarItem label="B. Entendí, pero quedaron algunas dudas" count={metrics.q2Dist.B || 0} total={metrics.q2Total} color={ANALYTICS_PALETTE.amber} />
                                <BarItem label="C. No, faltó información o claridad" count={metrics.q2Dist.C || 0} total={metrics.q2Total} color={ANALYTICS_PALETTE.rose} />
                            </div>
                        </AnalyticsCard>

                        <AnalyticsCard
                            title="Agilidad y Tiempos de Espera (Q3)"
                            subtitle="¿Cómo calificarías la agilidad y atención en el circuito?"
                            badge={<span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{metrics.q3Total} resp.</span>}
                            explanation="Refleja la percepción del paciente sobre los tiempos de espera entre estudios y consultorios del circuito preventivo."
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '6px' }}>
                                <BarItem label="A. Excelente" count={metrics.q3Dist.A || 0} total={metrics.q3Total} color={ANALYTICS_PALETTE.emerald} />
                                <BarItem label="B. Buena" count={metrics.q3Dist.B || 0} total={metrics.q3Total} color={ANALYTICS_PALETTE.blue} />
                                <BarItem label="C. Regular" count={metrics.q3Dist.C || 0} total={metrics.q3Total} color={ANALYTICS_PALETTE.amber} />
                                <BarItem label="D. Mala" count={metrics.q3Dist.D || 0} total={metrics.q3Total} color={ANALYTICS_PALETTE.rose} />
                            </div>
                        </AnalyticsCard>
                    </div>
                </>
            ) : (
                /* TAB 2: Respuestas y Escucha Activa */
                <AnalyticsCard
                    title={`Detalle Auditable de Encuestas (${displayedRows.length})`}
                    subtitle="Revisá comentarios escritos, notas de voz y alertas de calidad paciente por paciente"
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {[
                                { id: 'respondidas', label: `Respondidas (${metrics.respondidasCount})` },
                                { id: 'comentarios', label: `Con Feedback (${metrics.conFeedbackCualitativo.length})` },
                                { id: 'audios', label: `Audios (${metrics.conAudioCount})` },
                                { id: 'alertas', label: `Alertas (${metrics.alertasCalidad.length})` },
                                { id: 'pendientes', label: `Sin Responder (${metrics.pendientesCount})` },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    style={{
                                        padding: '6px 11px', borderRadius: '8px',
                                        border: activeTab === tab.id ? '1px solid #0284C7' : '1px solid #E2E8F0',
                                        background: activeTab === tab.id ? '#F0F9FF' : '#FFFFFF',
                                        color: activeTab === tab.id ? '#0284C7' : '#64748B',
                                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ position: 'relative', minWidth: '240px' }}>
                            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Buscar paciente, DNI, teléfono o texto..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%', padding: '7px 10px 7px 30px',
                                    borderRadius: '8px', border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>
                    </div>

                    {displayedRows.length === 0 ? (
                        <EmptyChartState height={180} text="No hay registros que coincidan con el filtro seleccionado." />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {displayedRows.map((e, i) => {
                                const score = e.q1_nps !== null && e.q1_nps !== undefined ? Number(e.q1_nps) : null;
                                const isAlert = (score !== null && score <= 6) || e.q2_claridad === 'C' || e.q3_agilidad === 'C' || e.q3_agilidad === 'D';
                                const npsColor = score === null ? '#64748B' : score >= 9 ? '#15803D' : score >= 7 ? '#B45309' : '#B91C1C';
                                const npsBg = score === null ? '#F1F5F9' : score >= 9 ? '#DCFCE7' : score >= 7 ? '#FEF3C7' : '#FEE2E2';

                                return (
                                    <div
                                        key={e.id || i}
                                        style={{
                                            padding: '14px 16px',
                                            borderRadius: '11px',
                                            background: isAlert ? '#FFFBFB' : '#F8FAFC',
                                            border: isAlert ? '1px solid #FECACA' : '1px solid #E2E8F0',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <User size={14} color="#0284C7" />
                                                    {e.nombre_paciente || 'Paciente'}
                                                </span>
                                                {e.dni && (
                                                    <span style={{ fontSize: '0.71rem', color: '#475569', background: '#E2E8F0', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
                                                        DNI {e.dni}
                                                    </span>
                                                )}
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', color: '#64748B' }}>
                                                    <Phone size={11} /> {e.telefono}
                                                </span>
                                                {e.obra_social && (
                                                    <span style={{ fontSize: '0.7rem', color: '#0369A1', background: '#E0F2FE', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
                                                        {e.obra_social}
                                                    </span>
                                                )}
                                                {e.centro && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: '#475569', background: '#F1F5F9', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
                                                        <Building2 size={10} /> {e.centro}
                                                    </span>
                                                )}
                                                {e.fecha_turno && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#0F766E', background: '#CCFBF1', padding: '2px 7px', borderRadius: '6px', fontWeight: 600 }}>
                                                        <Calendar size={10} /> {new Date(e.fecha_turno + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: '#64748B' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700,
                                                    background: e.estado === 'COMPLETADA' ? '#DCFCE7' : e.estado === 'INVITADO' ? '#F1F5F9' : '#E0F2FE',
                                                    color: e.estado === 'COMPLETADA' ? '#15803D' : e.estado === 'INVITADO' ? '#64748B' : '#0369A1',
                                                }}>
                                                    {e.estado === 'COMPLETADA' ? 'COMPLETADA (4/4)' : e.estado === 'CIERRE_PENDIENTE' ? 'RESPONDIDA (3/4)' : e.estado}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={11} />
                                                    {new Date(e.updated_at || e.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>

                                        {e.estado !== 'INVITADO' && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: (e.cierre_comentario || e.cierre_audio_url) ? '10px' : 0 }}>
                                                <span style={{ fontSize: '0.73rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: npsBg, color: npsColor }}>
                                                    Q1 NPS: {score !== null ? `${score}/10 (${score >= 9 ? 'Promotor' : score >= 7 ? 'Neutro' : 'Detractor'})` : 'Sin responder'}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.73rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                                                    background: e.q2_claridad === 'A' ? '#DCFCE7' : e.q2_claridad === 'B' ? '#FEF3C7' : e.q2_claridad === 'C' ? '#FEE2E2' : '#F1F5F9',
                                                    color: e.q2_claridad === 'A' ? '#15803D' : e.q2_claridad === 'B' ? '#B45309' : e.q2_claridad === 'C' ? '#B91C1C' : '#64748B',
                                                }}>
                                                    Q2 Claridad: {e.q2_claridad ? (Q2_LABELS[e.q2_claridad] || e.q2_claridad) : 'Sin responder'}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.73rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                                                    background: e.q3_agilidad === 'A' ? '#DCFCE7' : e.q3_agilidad === 'B' ? '#E0F2FE' : (e.q3_agilidad === 'C' || e.q3_agilidad === 'D') ? '#FEF3C7' : '#F1F5F9',
                                                    color: e.q3_agilidad === 'A' ? '#15803D' : e.q3_agilidad === 'B' ? '#0369A1' : (e.q3_agilidad === 'C' || e.q3_agilidad === 'D') ? '#B45309' : '#64748B',
                                                }}>
                                                    Q3 Agilidad: {e.q3_agilidad ? (Q3_LABELS[e.q3_agilidad] || e.q3_agilidad) : 'Sin responder'}
                                                </span>
                                            </div>
                                        )}

                                        {e.cierre_comentario && e.cierre_comentario.trim().length > 0 && (
                                            <div style={{
                                                fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.5,
                                                background: '#FFFFFF', padding: '10px 12px', borderRadius: '8px',
                                                border: '1px solid #E2E8F0',
                                                borderLeft: `3px solid ${isAlert ? '#F43F5E' : '#0284C7'}`,
                                            }}>
                                                “{e.cierre_comentario.trim()}”
                                            </div>
                                        )}

                                        {e.cierre_audio_url && (
                                            <div style={{
                                                marginTop: e.cierre_comentario && e.cierre_comentario.trim().length > 0 ? '8px' : 0,
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                background: '#FFFFFF', padding: '8px 12px', borderRadius: '8px',
                                                border: '1px solid #E2E8F0',
                                            }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, color: '#0284C7' }}>
                                                    <Mic size={14} /> Nota de voz:
                                                </span>
                                                <audio controls src={e.cierre_audio_url} style={{ height: '32px', flex: 1, maxWidth: '340px' }} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </AnalyticsCard>
            )}
        </AnalyticsShell>
    );
}

function BarItem({ label, count, total, color }) {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '5px' }}>
                <span>{label}</span>
                <span style={{ fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{count} ({percentage}%)</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width 0.4s ease-out' }} />
            </div>
        </div>
    );
}
