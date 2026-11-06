import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, RefreshCw, MessageSquare, Target, Trophy,
    TrendingUp, ThumbsUp, CheckCircle2, AlertTriangle,
    Calendar, Phone, Loader2, Mic, Search, Building2,
    User, ShieldAlert, Clock, Filter, Award
} from 'lucide-react';
import { fetchDetalleEncuestas } from '../services/visitasService';

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
    const [activeTab, setActiveTab] = useState('respondidas'); // 'respondidas' | 'comentarios' | 'audios' | 'alertas' | 'pendientes'
    const [searchQuery, setSearchQuery] = useState('');

    const loadData = async () => {
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
    };

    useEffect(() => {
        loadData();
    }, []);

    // 1. Filtrar por Período y Sede
    const filteredEncuestas = useMemo(() => {
        const now = new Date();
        return encuestas.filter(e => {
            // Filtro de período
            if (periodFilter !== 'all' && e.created_at) {
                const created = new Date(e.created_at);
                if (periodFilter === 'nov2026') {
                    if (created < new Date('2026-11-01T00:00:00-03:00')) return false;
                } else if (periodFilter === '7d') {
                    const diffDays = (now - created) / (1000 * 60 * 60 * 24);
                    if (diffDays > 7) return false;
                } else if (periodFilter === '30d') {
                    const diffDays = (now - created) / (1000 * 60 * 60 * 24);
                    if (diffDays > 30) return false;
                }
            }

            // Filtro de sede
            if (sedeFilter !== 'all') {
                const centro = String(e.centro || e.tipo_visita || '').toLowerCase();
                if (sedeFilter === 'sanluis' && !centro.includes('san luis')) return false;
                if (sedeFilter === 'santafe' && (centro.includes('san luis') || !centro)) return false;
            }

            // Filtro de búsqueda
            if (searchQuery.trim()) {
                const q = searchQuery.trim().toLowerCase();
                const matchNombre = String(e.nombre_paciente || '').toLowerCase().includes(q);
                const matchTel = String(e.telefono || '').toLowerCase().includes(q);
                const matchDni = String(e.dni || '').toLowerCase().includes(q);
                const matchOs = String(e.obra_social || '').toLowerCase().includes(q);
                const matchCom = String(e.cierre_comentario || '').toLowerCase().includes(q);
                if (!matchNombre && !matchTel && !matchDni && !matchOs && !matchCom) return false;
            }

            return true;
        });
    }, [encuestas, periodFilter, sedeFilter, searchQuery]);

    // 2. Calcular todas las métricas sobre el conjunto filtrado
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

        let promotores = 0;
        let detractores = 0;
        let neutros = 0;
        let validNpsCount = 0;
        let npsSum = 0;
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

        const nps = validNpsCount > 0
            ? Math.round(((promotores / validNpsCount) - (detractores / validNpsCount)) * 100)
            : 0;
        const avgNps = validNpsCount > 0 ? (npsSum / validNpsCount).toFixed(1) : '0.0';
        const responseRate = totalEnviadas > 0 ? ((respondidasCount / totalEnviadas) * 100).toFixed(1) : '0.0';

        const q2PctA = q2Total > 0 ? Math.round((q2Dist.A / q2Total) * 100) : 0;
        const q3PositiveCount = (q3Dist.A || 0) + (q3Dist.B || 0);
        const q3PositivePct = q3Total > 0 ? Math.round((q3PositiveCount / q3Total) * 100) : 0;
        const q3ExcelentePct = q3Total > 0 ? Math.round(((q3Dist.A || 0) / q3Total) * 100) : 0;

        return {
            totalEnviadas,
            respondidas,
            respondidasCount,
            completadasCount,
            parcialesCount,
            pendientes,
            pendientesCount,
            responseRate,
            nps,
            avgNps,
            validNpsCount,
            promotores,
            neutros,
            detractores,
            npsScores,
            q2Dist,
            q2Total,
            q2PctA,
            q3Dist,
            q3Total,
            q3PositiveCount,
            q3PositivePct,
            q3ExcelentePct,
            conTextoCount,
            conAudioCount,
            conFeedbackCualitativo,
            alertasCalidad,
        };
    }, [filteredEncuestas]);

    // 3. Seleccionar filas a mostrar según la pestaña activa
    const displayedRows = useMemo(() => {
        if (activeTab === 'respondidas') return metrics.respondidas;
        if (activeTab === 'comentarios') return metrics.conFeedbackCualitativo;
        if (activeTab === 'audios') return metrics.respondidas.filter(e => Boolean(e.cierre_audio_url));
        if (activeTab === 'alertas') return metrics.alertasCalidad;
        if (activeTab === 'pendientes') return metrics.pendientes;
        return metrics.respondidas;
    }, [activeTab, metrics]);

    const npsBadge = metrics.nps >= 50
        ? { label: 'Excelente', bg: '#dcfce7', color: '#15803d' }
        : metrics.nps >= 0
            ? { label: 'Bueno', bg: '#fef3c7', color: '#b45309' }
            : { label: 'Crítico', bg: '#fee2e2', color: '#b91c1c' };

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
            {/* Header + Controles */}
            <div style={{ marginBottom: '18px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{
                        fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', margin: 0,
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '38px', height: '38px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                        }}>
                            <BarChart3 size={20} color="#fff" />
                        </div>
                        Auditoría de Calidad — Encuestas Post-Chequeo
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '4px 0 0 48px' }}>
                        Monitoreo integral de NPS (Q1), Claridad Médica (Q2), Agilidad del Circuito (Q3) y Escucha Activa del Paciente (Q4)
                    </p>
                </div>

                {/* Filtros de Período, Sede y Actualizar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '3px' }}>
                        {[
                            { id: 'all', label: 'Histórico Total' },
                            { id: 'nov2026', label: 'Noviembre 2026' },
                            { id: '7d', label: 'Últimos 7 días' },
                            { id: '30d', label: '30 días' },
                        ].map(p => (
                            <button
                                key={p.id}
                                onClick={() => setPeriodFilter(p.id)}
                                style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: periodFilter === p.id ? '#0284c7' : 'transparent',
                                    color: periodFilter === p.id ? '#fff' : '#475569',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <select
                        value={sedeFilter}
                        onChange={e => setSedeFilter(e.target.value)}
                        style={{
                            padding: '7px 10px',
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '0.76rem',
                            color: '#334155',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        <option value="all">Todas las Sedes</option>
                        <option value="santafe">Sede Santa Fe</option>
                        <option value="sanluis">Sede San Luis</option>
                    </select>

                    <button onClick={loadData} disabled={loading} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                        background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px',
                        cursor: 'pointer', fontSize: '0.78rem', color: '#0f172a', fontWeight: 600,
                    }}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px' }}>
                        <Loader2 size={32} className="spin" color="#0284c7" />
                    </div>
                ) : (
                    <>
                        {/* 5 KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                            {/* Card 1: Tasa de Respuesta */}
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        Tasa de Respuesta
                                    </span>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Target size={18} color="#0284c7" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{metrics.responseRate}%</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0284c7' }}>
                                        ({metrics.respondidasCount} de {metrics.totalEnviadas})
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                                    ✅ <b>{metrics.completadasCount}</b> completas · 📝 <b>{metrics.parcialesCount}</b> Q1-Q3 · ⏳ <b>{metrics.pendientesCount}</b> sin responder
                                </div>
                            </div>

                            {/* Card 2: NPS + Nota Promedio */}
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        NPS & Calificación (Q1)
                                    </span>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Trophy size={18} color="#10b981" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>
                                        {metrics.nps > 0 ? `+${metrics.nps}` : metrics.nps}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: npsBadge.bg, color: npsBadge.color }}>
                                        {npsBadge.label}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginLeft: 'auto' }}>
                                        ★ {metrics.avgNps}/10
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                                    🟢 Promotores: <b>{metrics.promotores}</b> · 🟡 Neutros: <b>{metrics.neutros}</b> · 🔴 Detractores: <b>{metrics.detractores}</b>
                                </div>
                            </div>

                            {/* Card 3: Claridad Médica (Q2) */}
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        Claridad Médica (Q2)
                                    </span>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ThumbsUp size={18} color="#2563eb" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{metrics.q2PctA}%</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#16a34a' }}>
                                        Muy Claro ({metrics.q2Dist.A} de {metrics.q2Total})
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                                    🟡 Con dudas: <b>{metrics.q2Dist.B}</b> · 🔴 Faltó claridad: <b>{metrics.q2Dist.C}</b>
                                </div>
                            </div>

                            {/* Card 4: Agilidad del Circuito (Q3) */}
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        Agilidad y Espera (Q3)
                                    </span>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <TrendingUp size={18} color="#ea580c" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>{metrics.q3PositivePct}%</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0284c7' }}>
                                        Positiva ({metrics.q3PositiveCount} de {metrics.q3Total})
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                                    🟢 Excelente: <b>{metrics.q3Dist.A} ({metrics.q3ExcelentePct}%)</b> · 🔵 Buena: <b>{metrics.q3Dist.B}</b> · 🟠 Reg/Mala: <b>{(metrics.q3Dist.C || 0) + (metrics.q3Dist.D || 0)}</b>
                                </div>
                            </div>

                            {/* Card 5: Escucha Activa y Alertas */}
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        Feedback & Alertas (Q4)
                                    </span>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <MessageSquare size={18} color="#dc2626" />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a' }}>
                                        {metrics.conFeedbackCualitativo.length}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
                                        con devolución abierta
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                                    💬 <b>{metrics.conTextoCount}</b> textos · 🎤 <b>{metrics.conAudioCount}</b> audios · ⚠️ <b>{metrics.alertasCalidad.length}</b> alertas
                                </div>
                            </div>
                        </div>

                        {/* 3 Gráficos de Distribución: Q1 (NPS), Q2 (Claridad) y Q3 (Agilidad) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            {/* Q1: Distribución NPS */}
                            <div style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                        1️⃣ Recomendación del Chequeo (Q1 — NPS)
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>
                                        {metrics.validNpsCount} respuestas
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.73rem', color: '#64748b', margin: '0 0 14px 0' }}>
                                    Del 1 al 10, ¿qué tan probable es que nos recomiendes?
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <BarItem
                                        label="Promotores (Notas 9 y 10)"
                                        sublabel={`Nota 10: ${metrics.npsScores[10]} · Nota 9: ${metrics.npsScores[9]}`}
                                        count={metrics.promotores}
                                        total={metrics.validNpsCount}
                                        color="#10b981"
                                    />
                                    <BarItem
                                        label="Pasivos / Neutros (Notas 7 y 8)"
                                        sublabel={`Nota 8: ${metrics.npsScores[8]} · Nota 7: ${metrics.npsScores[7]}`}
                                        count={metrics.neutros}
                                        total={metrics.validNpsCount}
                                        color="#f59e0b"
                                    />
                                    <BarItem
                                        label="Detractores (Notas 1 a 6)"
                                        sublabel={`Notas ≤ 6: ${metrics.npsScores.low}`}
                                        count={metrics.detractores}
                                        total={metrics.validNpsCount}
                                        color="#ef4444"
                                    />
                                </div>
                            </div>

                            {/* Q2: Claridad Médica */}
                            <div style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                        2️⃣ Claridad de Explicaciones Médicas (Q2)
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>
                                        {metrics.q2Total} respuestas
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.73rem', color: '#64748b', margin: '0 0 14px 0' }}>
                                    ¿Las explicaciones médicas fueron claras y útiles?
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <BarItem label="A. Sí, todo fue muy claro" count={metrics.q2Dist.A || 0} total={metrics.q2Total} color="#10b981" />
                                    <BarItem label="B. Entendí, pero quedaron algunas dudas" count={metrics.q2Dist.B || 0} total={metrics.q2Total} color="#f59e0b" />
                                    <BarItem label="C. No, faltó información o claridad" count={metrics.q2Dist.C || 0} total={metrics.q2Total} color="#ef4444" />
                                </div>
                            </div>

                            {/* Q3: Agilidad del Circuito */}
                            <div style={{ background: '#fff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                        3️⃣ Agilidad y Tiempos de Espera (Q3)
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>
                                        {metrics.q3Total} respuestas
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.73rem', color: '#64748b', margin: '0 0 14px 0' }}>
                                    ¿Cómo calificarías la agilidad y atención en el circuito?
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <BarItem label="A. Excelente" count={metrics.q3Dist.A || 0} total={metrics.q3Total} color="#10b981" />
                                    <BarItem label="B. Buena" count={metrics.q3Dist.B || 0} total={metrics.q3Total} color="#0284c7" />
                                    <BarItem label="C. Regular" count={metrics.q3Dist.C || 0} total={metrics.q3Total} color="#f59e0b" />
                                    <BarItem label="D. Mala" count={metrics.q3Dist.D || 0} total={metrics.q3Total} color="#ef4444" />
                                </div>
                            </div>
                        </div>

                        {/* Panel Inferior: Detalle Auditable de Respuestas y Feedback */}
                        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                                {/* Tabs de filtro de lista */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'respondidas', label: `Todas las Respondidas (${metrics.respondidasCount})` },
                                        { id: 'comentarios', label: `Con Comentario o Audio (${metrics.conFeedbackCualitativo.length})` },
                                        { id: 'audios', label: `Solo Audios 🎤 (${metrics.conAudioCount})` },
                                        { id: 'alertas', label: `⚠️ Atención Prioritaria / Alertas (${metrics.alertasCalidad.length})` },
                                        { id: 'pendientes', label: `Sin Responder (${metrics.pendientesCount})` },
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            style={{
                                                padding: '7px 12px',
                                                borderRadius: '8px',
                                                border: activeTab === tab.id ? '1px solid #0284c7' : '1px solid #e2e8f0',
                                                background: activeTab === tab.id ? '#eff6ff' : '#f8fafc',
                                                color: activeTab === tab.id ? '#0369a1' : '#475569',
                                                fontSize: '0.76rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Buscador */}
                                <div style={{ position: 'relative', minWidth: '240px' }}>
                                    <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar paciente, DNI, teléfono, texto..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 10px 7px 30px',
                                            borderRadius: '8px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '0.78rem',
                                            outline: 'none',
                                        }}
                                    />
                                </div>
                            </div>

                            {displayedRows.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    No hay registros que coincidan con el filtro seleccionado.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {displayedRows.map((e, i) => {
                                        const score = e.q1_nps !== null && e.q1_nps !== undefined ? Number(e.q1_nps) : null;
                                        const isAlert = (score !== null && score <= 6) || e.q2_claridad === 'C' || e.q3_agilidad === 'C' || e.q3_agilidad === 'D';
                                        const npsColor = score === null ? '#64748b' : score >= 9 ? '#15803d' : score >= 7 ? '#b45309' : '#b91c1c';
                                        const npsBg = score === null ? '#f1f5f9' : score >= 9 ? '#dcfce7' : score >= 7 ? '#fef3c7' : '#fee2e2';

                                        return (
                                            <div
                                                key={e.id || i}
                                                style={{
                                                    padding: '14px 16px',
                                                    borderRadius: '10px',
                                                    background: isAlert ? '#fffafa' : '#f8fafc',
                                                    border: isAlert ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                                }}
                                            >
                                                {/* Cabecera del paciente */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <User size={14} color="#0284c7" />
                                                            {e.nombre_paciente || 'Paciente'}
                                                        </span>

                                                        {e.dni && (
                                                            <span style={{ fontSize: '0.72rem', color: '#475569', background: '#e2e8f0', padding: '2px 7px', borderRadius: '5px', fontWeight: 600 }}>
                                                                DNI {e.dni}
                                                            </span>
                                                        )}

                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', color: '#64748b' }}>
                                                            <Phone size={11} /> {e.telefono}
                                                        </span>

                                                        {e.obra_social && (
                                                            <span style={{ fontSize: '0.7rem', color: '#0369a1', background: '#e0f2fe', padding: '2px 7px', borderRadius: '5px', fontWeight: 600 }}>
                                                                {e.obra_social}
                                                            </span>
                                                        )}

                                                        {e.centro && (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: '#475569', background: '#f1f5f9', padding: '2px 7px', borderRadius: '5px', fontWeight: 600 }}>
                                                                <Building2 size={10} /> {e.centro}
                                                            </span>
                                                        )}

                                                        {e.fecha_turno && (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#0f766e', background: '#ccfbf1', padding: '2px 7px', borderRadius: '5px', fontWeight: 600 }}>
                                                                <Calendar size={10} /> Chequeo: {new Date(e.fecha_turno + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.73rem', color: '#64748b' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '999px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            background: e.estado === 'COMPLETADA' ? '#dcfce7' : e.estado === 'INVITADO' ? '#f1f5f9' : '#e0f2fe',
                                                            color: e.estado === 'COMPLETADA' ? '#15803d' : e.estado === 'INVITADO' ? '#64748b' : '#0369a1',
                                                        }}>
                                                            {e.estado === 'COMPLETADA' ? 'COMPLETADA (4/4)' : e.estado === 'CIERRE_PENDIENTE' ? 'RESPONDIDA (3/4)' : e.estado}
                                                        </span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Clock size={11} />
                                                            {new Date(e.updated_at || e.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Píldoras de respuestas Q1, Q2, Q3 */}
                                                {e.estado !== 'INVITADO' && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: (e.cierre_comentario || e.cierre_audio_url) ? '10px' : '0' }}>
                                                        <span style={{
                                                            fontSize: '0.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                                                            background: npsBg, color: npsColor,
                                                        }}>
                                                            1️⃣ NPS: {score !== null ? `${score}/10 (${score >= 9 ? 'Promotor' : score >= 7 ? 'Neutro' : 'Detractor'})` : 'Sin responder'}
                                                        </span>

                                                        <span style={{
                                                            fontSize: '0.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                                                            background: e.q2_claridad === 'A' ? '#dcfce7' : e.q2_claridad === 'B' ? '#fef3c7' : e.q2_claridad === 'C' ? '#fee2e2' : '#f1f5f9',
                                                            color: e.q2_claridad === 'A' ? '#15803d' : e.q2_claridad === 'B' ? '#b45309' : e.q2_claridad === 'C' ? '#b91c1c' : '#64748b',
                                                        }}>
                                                            2️⃣ Claridad: {e.q2_claridad ? (Q2_LABELS[e.q2_claridad] || e.q2_claridad) : 'Sin responder'}
                                                        </span>

                                                        <span style={{
                                                            fontSize: '0.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                                                            background: e.q3_agilidad === 'A' ? '#dcfce7' : e.q3_agilidad === 'B' ? '#e0f2fe' : (e.q3_agilidad === 'C' || e.q3_agilidad === 'D') ? '#fef3c7' : '#f1f5f9',
                                                            color: e.q3_agilidad === 'A' ? '#15803d' : e.q3_agilidad === 'B' ? '#0369a1' : (e.q3_agilidad === 'C' || e.q3_agilidad === 'D') ? '#b45309' : '#64748b',
                                                        }}>
                                                            3️⃣ Agilidad: {e.q3_agilidad ? (Q3_LABELS[e.q3_agilidad] || e.q3_agilidad) : 'Sin responder'}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Comentario escrito (Q4) */}
                                                {e.cierre_comentario && e.cierre_comentario.trim().length > 0 && (
                                                    <div style={{
                                                        fontSize: '0.84rem',
                                                        color: '#1e293b',
                                                        lineHeight: '1.5',
                                                        background: '#fff',
                                                        padding: '10px 12px',
                                                        borderRadius: '8px',
                                                        borderLeft: `3px solid ${isAlert ? '#ef4444' : '#0284c7'}`,
                                                    }}>
                                                        💬 “{e.cierre_comentario.trim()}”
                                                    </div>
                                                )}

                                                {/* Audio de WhatsApp (Q4) */}
                                                {e.cierre_audio_url && (
                                                    <div style={{
                                                        marginTop: e.cierre_comentario && e.cierre_comentario.trim().length > 0 ? '8px' : '0',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px',
                                                        background: '#fff',
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #e2e8f0',
                                                    }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', fontWeight: 700, color: '#0284c7' }}>
                                                            <Mic size={14} /> Nota de voz del paciente:
                                                        </span>
                                                        <audio controls src={e.cierre_audio_url} style={{ height: '32px', flex: 1, maxWidth: '340px' }} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function BarItem({ label, sublabel, count, total, color }) {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                <div>
                    <span>{label}</span>
                    {sublabel && (
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500, marginLeft: '6px' }}>
                            ({sublabel})
                        </span>
                    )}
                </div>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{count} ({percentage}%)</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s ease-out' }} />
            </div>
        </div>
    );
}
