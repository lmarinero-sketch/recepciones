/**
 * ConversionWhatsAppPanel.jsx
 * Submódulo analítico: Embudo de Conversión WhatsApp (Meta) → Turnos SALUS → Asistencia Efectiva
 * Estética: Figma Community Data Analytics ("Menos es más" — Snow / Untitled UI / Calidad-QOAG)
 * Organizado por tema y relación en 4 pestañas claras con explicaciones contextuales en español.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    TrendingUp, RefreshCw, MessageSquare, CheckCircle2, CalendarCheck,
    UserCheck, Clock, Info, Download, Search, PieChart as PieIcon,
    BarChart3, Users, Table2, ArrowRight, Filter, X, Building2, Stethoscope, Calendar
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart, Line,
    BarChart, Bar,
    PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import {
    fetchConversionRawData,
    computeConversionAnalytics,
} from '../services/conversionFunnelService';

const PALETTE = {
    blue: '#0284C7',
    indigo: '#6366F1',
    sky: '#0EA5E9',
    emerald: '#10B981',
    amber: '#F59E0B',
    rose: '#F43F5E',
    slate: '#64748B',
    violet: '#8B5CF6',
};

const PIE_ASISTENCIA_COLORS = {
    'Presente': '#10B981',
    'Futuro Pendiente': '#0284C7',
    'Ausencia Justificada': '#F59E0B',
    'Ausencia Injustificada': '#F43F5E',
    'Otro / Sin marcar': '#94A3B8',
};

const PIE_TIPO_COLORS = ['#0284C7', '#10B981', '#6366F1', '#F59E0B', '#8B5CF6'];
const PIE_SEXO_COLORS = ['#0284C7', '#8B5CF6', '#94A3B8'];

function formatFrt(mins) {
    if (mins === null || mins === undefined) return '—';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getDateRangeFromPreset(preset, customStart, customEnd) {
    const now = new Date();
    const fmt = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' });
    const endDate = fmt(now);

    if (preset === '7d') {
        const s = new Date(now);
        s.setDate(s.getDate() - 6);
        return { startDate: fmt(s), endDate };
    }
    if (preset === 'mes') {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: fmt(s), endDate };
    }
    if (preset === '30d') {
        const s = new Date(now);
        s.setDate(s.getDate() - 29);
        return { startDate: fmt(s), endDate };
    }
    if (preset === '90d') {
        const s = new Date(now);
        s.setDate(s.getDate() - 89);
        return { startDate: fmt(s), endDate };
    }
    return {
        startDate: customStart || endDate,
        endDate: customEnd || endDate,
    };
}

// Tarjeta limpia estilo Figma Minimalist SaaS ("Menos es más")
function Card({ title, subtitle, badge, explanation, children, style = {} }) {
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            ...style,
        }}>
            {(title || subtitle) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                            {title}
                        </h3>
                        {subtitle && (
                            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748B', lineHeight: 1.4 }}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
                </div>
            )}
            <div>{children}</div>
            {explanation && (
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#F8FAFC',
                    border: '1px solid #F1F5F9',
                    fontSize: '0.76rem',
                    color: '#475569',
                    lineHeight: 1.45,
                }}>
                    <Info size={14} color="#0284C7" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{explanation}</span>
                </div>
            )}
        </div>
    );
}

// Tarjeta KPI minimalista
function KpiCard({ label, value, subtext, pill, icon: Icon, accent = '#0284C7', bg = '#F0F9FF' }) {
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#64748B' }}>{label}</span>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '9px',
                    background: bg, color: accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={16} />
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {value}
                </span>
                {pill && (
                    <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '999px', background: bg, color: accent,
                    }}>
                        {pill}
                    </span>
                )}
            </div>
            {subtext && (
                <div style={{ fontSize: '0.74rem', color: '#64748B', lineHeight: 1.35 }}>
                    {subtext}
                </div>
            )}
        </div>
    );
}

export default function ConversionWhatsAppPanel({ addToast }) {
    // Filtros
    const [datePreset, setDatePreset] = useState('mes'); // '7d' | 'mes' | '30d' | '90d' | 'custom'
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [attributionMode, setAttributionMode] = useState('strict'); // 'strict' | 'broad'
    const [attributionDays, setAttributionDays] = useState(14);
    const [categoriaFilter, setCategoriaFilter] = useState('all');

    // Pestaña activa ("Menos es más": cada pestaña muestra solo su tema relacionado)
    const [activeTab, setActiveTab] = useState('embudo'); // 'embudo' | 'distribucion' | 'demografia' | 'auditoria'

    // Datos
    const [rawData, setRawData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Filtros tabla auditoría + Modal resumen de visitas del paciente
    const [auditSearch, setAuditSearch] = useState('');
    const [auditStatusFilter, setAuditStatusFilter] = useState('all');
    const [selectedAuditRow, setSelectedAuditRow] = useState(null);
    const [showAllPatientVisits, setShowAllPatientVisits] = useState(false);

    const { startDate, endDate } = useMemo(
        () => getDateRangeFromPreset(datePreset, customStart, customEnd),
        [datePreset, customStart, customEnd]
    );

    const loadData = useCallback(async () => {
        if (datePreset === 'custom' && (!customStart || !customEnd)) return;
        setLoading(true);
        try {
            const raw = await fetchConversionRawData({ startDate, endDate });
            setRawData(raw);
        } catch (err) {
            console.error('[ConversionWhatsAppPanel]', err);
            addToast?.('Error al cargar métricas de conversión WhatsApp → SALUS', 'error');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, datePreset, customStart, customEnd, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const analytics = useMemo(() => {
        if (!rawData) return null;
        return computeConversionAnalytics(rawData, {
            startDate,
            endDate,
            attributionMode,
            attributionDays,
            categoriaFilter,
        });
    }, [rawData, startDate, endDate, attributionMode, attributionDays, categoriaFilter]);

    const filteredAuditRows = useMemo(() => {
        if (!analytics?.auditRows) return [];
        const q = auditSearch.trim().toLowerCase();
        return analytics.auditRows.filter(r => {
            if (auditStatusFilter === 'concretado' && r.estadoPaciente !== 'Concretado') return false;
            if (auditStatusFilter === 'pendiente' && r.estadoPaciente !== 'Pendiente Futuro') return false;
            if (auditStatusFilter === 'ausente' && !r.estadoPaciente.startsWith('Ausen')) return false;
            if (auditStatusFilter === 'sin_turno' && r.tieneTurno) return false;
            if (auditStatusFilter === 'sin_respuesta' && r.respondida) return false;
            if (!q) return true;
            return (
                (r.paciente || '').toLowerCase().includes(q) ||
                (r.phone || '').includes(q) ||
                (r.dni || '').includes(q) ||
                (r.obraSocial || '').toLowerCase().includes(q) ||
                (r.tipoTurno || '').toLowerCase().includes(q)
            );
        });
    }, [analytics, auditSearch, auditStatusFilter]);

    const handleExportCsv = () => {
        if (!filteredAuditRows.length) return;
        const headers = [
            'Teléfono', 'Paciente', 'DNI', 'Edad', 'Fecha Consulta WA',
            'Respondida', 'Tiempo 1ra Respuesta (min)', 'Turno Asignado',
            'Fecha Creación SALUS', 'Fecha Turno', 'Tipo Turno',
            'Obra Social', 'Sede', 'Operador SALUS', 'Estado Asistencia'
        ];
        const csvRows = [
            headers.join(';'),
            ...filteredAuditRows.map(r => [
                r.phone,
                `"${(r.paciente || '').replace(/"/g, '""')}"`,
                r.dni || '',
                r.edad ?? '',
                r.fechaConsulta ? new Date(r.fechaConsulta).toLocaleString('es-AR') : '',
                r.respondida ? 'Sí' : 'No',
                r.frtMinutes ?? '',
                r.tieneTurno ? 'Sí' : 'No',
                r.fechaCreacionTurno ? new Date(r.fechaCreacionTurno).toLocaleString('es-AR') : '',
                r.fechaVisita || '',
                `"${r.tipoTurno || ''}"`,
                `"${(r.obraSocial || '').replace(/"/g, '""')}"`,
                `"${r.centro || ''}"`,
                `"${r.usuarioCreacion || ''}"`,
                `"${r.estadoPaciente}"`,
            ].join(';'))
        ];
        const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversion_whatsapp_salus_${startDate}_a_${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        addToast?.('✅ Archivo CSV exportado', 'success');
    };

    const tabs = [
        { id: 'embudo', label: 'Resumen y Embudo', icon: TrendingUp },
        { id: 'distribucion', label: 'Distribución y Sedes', icon: PieIcon },
        { id: 'demografia', label: 'Histograma de Edad', icon: Users },
        { id: 'auditoria', label: 'Auditoría Detallada', icon: Table2 },
    ];

    const k = analytics?.kpis;

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: '#F8FAFC',
            overflow: 'hidden',
        }}>
            {/* ========== TOP HEADER & CONTROLS (Minimalist SaaS Bar) ========== */}
            <div style={{
                background: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                padding: '16px 24px 0',
                flexShrink: 0,
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                    marginBottom: '14px',
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '34px', height: '34px', borderRadius: '10px',
                                background: '#F0F9FF', border: '1px solid #BAE6FD',
                                color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <TrendingUp size={18} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.015em' }}>
                                    Conversión WhatsApp → Turnos SALUS
                                </h2>
                                <p style={{ margin: '1px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Trazabilidad completa: consultas recibidas por Meta, respuestas, turnos asignados y asistencia efectiva.
                                    {analytics?.lastSyncedAt && (
                                        <span style={{ marginLeft: '8px', color: '#94A3B8' }}>
                                            · Sync SALUS: {new Date(analytics.lastSyncedAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Controles limpios de período y atribución */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Selector de período */}
                        <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '3px', borderRadius: '9px' }}>
                            {[
                                { id: '7d', label: '7 días' },
                                { id: 'mes', label: 'Este mes' },
                                { id: '30d', label: '30 días' },
                                { id: '90d', label: '90 días' },
                                { id: 'custom', label: 'Fechas' },
                            ].map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setDatePreset(p.id)}
                                    style={{
                                        padding: '5px 10px', border: 'none', borderRadius: '7px',
                                        fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                                        background: datePreset === p.id ? '#FFFFFF' : 'transparent',
                                        color: datePreset === p.id ? '#0284C7' : '#64748B',
                                        boxShadow: datePreset === p.id ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {datePreset === 'custom' && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                    type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                                    style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                />
                                <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>a</span>
                                <input
                                    type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                                    style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                />
                            </div>
                        )}

                        {/* Filtro de categoría */}
                        <select
                            value={categoriaFilter}
                            onChange={e => setCategoriaFilter(e.target.value)}
                            style={{
                                padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 600, color: '#334155',
                                cursor: 'pointer',
                            }}
                            title="Filtrar por tipo de turno en SALUS"
                        >
                            <option value="all">Todos los turnos</option>
                            <option value="Chequeo Preventivo">Solo Chequeo Preventivo</option>
                            <option value="Chequeo Informe">Solo Chequeo Informe</option>
                            <option value="Ecografía">Solo Ecografías</option>
                            <option value="Otros Ambulatorios">Otros Ambulatorios</option>
                        </select>

                        {/* Modo de atribución */}
                        <select
                            value={attributionMode}
                            onChange={e => setAttributionMode(e.target.value)}
                            style={{
                                padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 600, color: '#334155',
                                cursor: 'pointer',
                            }}
                            title="Criterio de atribución de turnos"
                        >
                            <option value="strict">Conversión Real (creado post-WA)</option>
                            <option value="broad">Atención Integral (todo turno ≥ consulta)</option>
                        </select>

                        {attributionMode === 'strict' && (
                            <select
                                value={attributionDays}
                                onChange={e => setAttributionDays(Number(e.target.value))}
                                style={{
                                    padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                    background: '#FFFFFF', fontSize: '0.75rem', fontWeight: 600, color: '#334155',
                                    cursor: 'pointer',
                                }}
                                title="Ventana máxima entre la consulta y la asignación del turno"
                            >
                                <option value={7}>Ventana: 7 días</option>
                                <option value={14}>Ventana: 14 días</option>
                                <option value={30}>Ventana: 30 días</option>
                            </select>
                        )}

                        <button
                            onClick={loadData}
                            disabled={loading}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '6px 12px', borderRadius: '8px',
                                border: '1px solid #E2E8F0', background: '#FFFFFF',
                                fontSize: '0.75rem', fontWeight: 600, color: '#334155',
                                cursor: 'pointer',
                            }}
                        >
                            <RefreshCw size={13} className={loading ? 'msg-panel__spinner' : ''} />
                            Actualizar
                        </button>
                    </div>
                </div>

                {/* Navegación por Pestañas Temáticas */}
                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                    {tabs.map(t => {
                        const Icon = t.icon;
                        const active = activeTab === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '7px',
                                    padding: '10px 16px', border: 'none', background: 'transparent',
                                    borderBottom: active ? '2px solid #0284C7' : '2px solid transparent',
                                    color: active ? '#0284C7' : '#64748B',
                                    fontSize: '0.8rem', fontWeight: active ? 700 : 600,
                                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                                }}
                            >
                                <Icon size={15} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ========== BODY SCROLLABLE ========== */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
                {loading && !analytics ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        height: '260px', gap: '10px', color: '#64748B', fontSize: '0.86rem',
                    }}>
                        <RefreshCw size={26} className="msg-panel__spinner" color="#0284C7" />
                        <span>Cruzando conversaciones de WhatsApp con agenda SALUS...</span>
                    </div>
                ) : !analytics ? null : (
                    <div style={{ maxWidth: '1380px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                        {/* ==================== TAB 1: RESUMEN Y EMBUDO ==================== */}
                        {activeTab === 'embudo' && (
                            <>
                                {/* 4 KPI Cards principales */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                                    gap: '16px',
                                }}>
                                    <KpiCard
                                        label="1. Consultas Ingresadas"
                                        value={k.ingresadas.toLocaleString('es-AR')}
                                        pill="100%"
                                        subtext="Pacientes únicos que enviaron al menos un mensaje por WhatsApp."
                                        icon={MessageSquare}
                                        accent={PALETTE.blue}
                                        bg="#F0F9FF"
                                    />
                                    <KpiCard
                                        label="2. Consultas Respondidas"
                                        value={k.respondidas.toLocaleString('es-AR')}
                                        pill={`${k.tasaRespuesta}%`}
                                        subtext={`Tiempo mediano de 1ra respuesta: ${formatFrt(k.medianFrtMinutes)} (${k.respondidasHumano} por operador).`}
                                        icon={CheckCircle2}
                                        accent={PALETTE.indigo}
                                        bg="#EEF2FF"
                                    />
                                    <KpiCard
                                        label="3. Turnos Asignados"
                                        value={k.asignados.toLocaleString('es-AR')}
                                        pill={`${k.tasaConversionSobreRespondidas}% de resp.`}
                                        subtext={attributionMode === 'strict'
                                            ? `Turnos creados en SALUS hasta ${attributionDays} días después de la consulta.`
                                            : 'Pacientes con turno agendado en SALUS igual o posterior a su consulta.'}
                                        icon={CalendarCheck}
                                        accent={PALETTE.sky}
                                        bg="#E0F2FE"
                                    />
                                    <KpiCard
                                        label="4. Concretados (Presente)"
                                        value={k.concretados.toLocaleString('es-AR')}
                                        pill={`${k.tasaConcrecionSobreVencidos}% efectivos`}
                                        subtext={`${k.futurosPendientes} turno${k.futurosPendientes !== 1 ? 's' : ''} futuro${k.futurosPendientes !== 1 ? 's' : ''} aún pendiente${k.futurosPendientes !== 1 ? 's' : ''} · ${k.ausentes} ausente${k.ausentes !== 1 ? 's' : ''}.`}
                                        icon={UserCheck}
                                        accent={PALETTE.emerald}
                                        bg="#ECFDF5"
                                    />
                                </div>

                                {/* Fila de 2 gráficos limpios: Embudo (Barras) + Evolución (Líneas) */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                                    gap: '20px',
                                }}>
                                    <Card
                                        title="Embudo de Conversión por Etapa"
                                        subtitle="Retención paso a paso desde que ingresa el mensaje hasta que el paciente asiste"
                                        badge={
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px',
                                                borderRadius: '999px', background: '#ECFDF5', color: '#059669',
                                            }}>
                                                {k.tasaConversionSobreIngresadas}% asignan turno
                                            </span>
                                        }
                                        explanation={
                                            <>
                                                De cada <strong>100</strong> personas que escriben por WhatsApp, <strong>{Math.round(k.tasaRespuesta)}</strong> reciben respuesta,{' '}
                                                <strong>{Math.round(k.tasaConversionSobreIngresadas)}</strong> obtienen un turno en SALUS y{' '}
                                                <strong>{Math.round(k.tasaConcrecionSobreVencidos)}%</strong> de los turnos cuya fecha ya pasó se concretan efectivamente (<code>Presente</code>).
                                            </>
                                        }
                                    >
                                        <div style={{ height: '270px', width: '100%' }}>
                                            <ResponsiveContainer>
                                                <BarChart
                                                    data={analytics.funnelData}
                                                    layout="vertical"
                                                    margin={{ top: 6, right: 28, left: 10, bottom: 6 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                                                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                    <YAxis type="category" dataKey="stage" width={125} tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                    <Tooltip
                                                        formatter={(val, _name, item) => [`${val} pacientes (${item.payload.pct}%)`, 'Cantidad']}
                                                        contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.8rem' }}
                                                    />
                                                    <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={32}>
                                                        {analytics.funnelData.map((entry, idx) => (
                                                            <Cell key={idx} fill={entry.fill} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </Card>

                                    <Card
                                        title="Evolución Diaria (Gráfico de Líneas)"
                                        subtitle="Tendencia día por día de consultas ingresadas, respondidas, turnos asignados y concretados"
                                        explanation="Permite detectar picos de demanda por día de la semana y verificar si los días con mayor volumen de mensajes mantienen la misma tasa de respuesta y asignación de turnos."
                                    >
                                        <div style={{ height: '270px', width: '100%' }}>
                                            <ResponsiveContainer>
                                                <LineChart data={analytics.dailySeries} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }} />
                                                    <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: '6px' }} />
                                                    <Line type="monotone" dataKey="ingresadas" name="Ingresadas" stroke={PALETTE.blue} strokeWidth={2.2} dot={{ r: 2.5 }} />
                                                    <Line type="monotone" dataKey="respondidas" name="Respondidas" stroke={PALETTE.indigo} strokeWidth={2} dot={false} />
                                                    <Line type="monotone" dataKey="asignados" name="Turno Asignado" stroke={PALETTE.sky} strokeWidth={2} strokeDasharray="4 3" dot={false} />
                                                    <Line type="monotone" dataKey="concretados" name="Concretados" stroke={PALETTE.emerald} strokeWidth={2.4} dot={{ r: 2.5 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </Card>
                                </div>
                            </>
                        )}

                        {/* ==================== TAB 2: DISTRIBUCIÓN Y SEDES ==================== */}
                        {activeTab === 'distribucion' && (
                            <>
                                {/* Fila 1: 2 Gráficos de Torta (Donut) */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                                    gap: '20px',
                                }}>
                                    <Card
                                        title="Estado de Asistencia (Gráfico de Torta)"
                                        subtitle="Desglose real en SALUS de los pacientes que obtuvieron turno tras consultar por WhatsApp"
                                        explanation="Separa los turnos ya asistidos ('Presente') de los turnos con fecha futura ('Futuro Pendiente') para no distorsionar la tasa de ausentismo real."
                                    >
                                        {analytics.asistenciaPie.length === 0 ? (
                                            <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.84rem' }}>
                                                Sin turnos asignados en este período.
                                            </div>
                                        ) : (
                                            <div style={{ height: '260px', width: '100%' }}>
                                                <ResponsiveContainer>
                                                    <PieChart>
                                                        <Pie
                                                            data={analytics.asistenciaPie}
                                                            dataKey="value"
                                                            nameKey="name"
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={62}
                                                            outerRadius={96}
                                                            paddingAngle={3}
                                                        >
                                                            {analytics.asistenciaPie.map((entry, idx) => (
                                                                <Cell key={idx} fill={PIE_ASISTENCIA_COLORS[entry.name] || '#94A3B8'} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip
                                                            formatter={(v) => [`${v} pacientes`, 'Cantidad']}
                                                            contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.8rem' }}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </Card>

                                    <Card
                                        title="Composición por Tipo de Turno (Gráfico de Torta)"
                                        subtitle="Qué servicios terminan agendando los pacientes que consultan por WhatsApp"
                                        explanation="Muestra la proporción entre Chequeos Preventivos, Consultas de Informe, Ecografías y otros turnos ambulatorios generados desde la atención por WhatsApp."
                                    >
                                        {analytics.tipoTurnoPie.length === 0 ? (
                                            <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.84rem' }}>
                                                Sin datos para el filtro actual.
                                            </div>
                                        ) : (
                                            <div style={{ height: '260px', width: '100%' }}>
                                                <ResponsiveContainer>
                                                    <PieChart>
                                                        <Pie
                                                            data={analytics.tipoTurnoPie}
                                                            dataKey="value"
                                                            nameKey="name"
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={62}
                                                            outerRadius={96}
                                                            paddingAngle={3}
                                                        >
                                                            {analytics.tipoTurnoPie.map((_e, idx) => (
                                                                <Cell key={idx} fill={PIE_TIPO_COLORS[idx % PIE_TIPO_COLORS.length]} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip
                                                            formatter={(v) => [`${v} pacientes`, 'Cantidad']}
                                                            contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.8rem' }}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </Card>
                                </div>

                                {/* Fila 2: 2 Gráficos de Barras (Por Sede y Top Obras Sociales) */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                                    gap: '20px',
                                }}>
                                    <Card
                                        title="Turnos Asignados vs. Concretados por Sede"
                                        subtitle="Comparativa de efectividad entre sedes de Sanatorio Argentino"
                                        explanation="Compara cuántos turnos se asignan en cada sede contra cuántos pacientes efectivamente se presentan."
                                    >
                                        <div style={{ height: '250px', width: '100%' }}>
                                            <ResponsiveContainer>
                                                <BarChart data={analytics.sedeBars} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                    <XAxis dataKey="sede" tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.8rem' }} />
                                                    <Legend wrapperStyle={{ fontSize: '0.76rem' }} />
                                                    <Bar dataKey="asignados" name="Asignados" fill={PALETTE.sky} radius={[6, 6, 0, 0]} barSize={32} />
                                                    <Bar dataKey="concretados" name="Concretados" fill={PALETTE.emerald} radius={[6, 6, 0, 0]} barSize={32} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </Card>

                                    <Card
                                        title="Top 8 Obras Sociales (Barras Horizontales)"
                                        subtitle="Coberturas médicas con mayor volumen de conversión desde WhatsApp"
                                        explanation="Ayuda a identificar qué convenios (como Obra Social Provincia, OSDE, etc.) concentran la mayor demanda y asistencia efectiva."
                                    >
                                        <div style={{ height: '250px', width: '100%' }}>
                                            <ResponsiveContainer>
                                                <BarChart data={analytics.obraSocialBars} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                                                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                    <YAxis
                                                        type="category"
                                                        dataKey="obraSocial"
                                                        width={135}
                                                        tick={{ fontSize: 11, fill: '#334155' }}
                                                        tickFormatter={v => v.length > 18 ? v.slice(0, 18) + '…' : v}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.78rem' }} />
                                                    <Legend wrapperStyle={{ fontSize: '0.76rem' }} />
                                                    <Bar dataKey="asignados" name="Asignados" fill={PALETTE.blue} radius={[0, 5, 5, 0]} barSize={11} />
                                                    <Bar dataKey="concretados" name="Concretados" fill={PALETTE.emerald} radius={[0, 5, 5, 0]} barSize={11} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </Card>
                                </div>
                            </>
                        )}

                        {/* ==================== TAB 3: HISTOGRAMA DE EDAD Y DEMOGRAFÍA ==================== */}
                        {activeTab === 'demografia' && (
                            <>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                    gap: '16px',
                                }}>
                                    <KpiCard
                                        label="Edad Promedio"
                                        value={analytics.demographics.avgAge ? `${analytics.demographics.avgAge} años` : '—'}
                                        subtext={`Calculado sobre ${analytics.demographics.totalConEdad} pacientes con edad registrada en SALUS.`}
                                        icon={Users}
                                        accent={PALETTE.blue}
                                        bg="#F0F9FF"
                                    />
                                    <KpiCard
                                        label="Edad Mediana"
                                        value={analytics.demographics.medianAge ? `${analytics.demographics.medianAge} años` : '—'}
                                        subtext="La mitad de los pacientes que convierten tienen esta edad o menos."
                                        icon={BarChart3}
                                        accent={PALETTE.indigo}
                                        bg="#EEF2FF"
                                    />
                                    <KpiCard
                                        label="Franja Etaria Principal"
                                        value={analytics.demographics.topAgeBin?.asignados > 0 ? `${analytics.demographics.topAgeBin.label} años` : '—'}
                                        pill={analytics.demographics.topAgeBin?.asignados > 0 ? `${analytics.demographics.topAgeBin.asignados} pac.` : null}
                                        subtext="Segmento de edad con mayor volumen de turnos asignados por WhatsApp."
                                        icon={TrendingUp}
                                        accent={PALETTE.emerald}
                                        bg="#ECFDF5"
                                    />
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0, 1.65fr) minmax(300px, 1fr)',
                                    gap: '20px',
                                }}>
                                    <Card
                                        title="Histograma de Edad de Pacientes Convertidos"
                                        subtitle="Distribución continua por franjas etarias (Turnos Asignados vs. Concretados)"
                                        explanation={
                                            analytics.demographics.topAgeBin?.asignados > 0
                                                ? <>La franja de <strong>{analytics.demographics.topAgeBin.label} años</strong> concentra el mayor uso del canal WhatsApp para agendar turnos ({analytics.demographics.topAgeBin.asignados} asignados y {analytics.demographics.topAgeBin.concretados} concretados). Esto permite adaptar el tono, las plantillas y las campañas preventivas al público real.</>
                                                : 'No hay suficientes datos de edad en este período.'
                                        }
                                    >
                                        <div style={{ height: '300px', width: '100%' }}>
                                            <ResponsiveContainer>
                                                <BarChart data={analytics.ageHistogram} barGap={2} barCategoryGap="8%" margin={{ top: 10, right: 16, left: -12, bottom: 6 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                                                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                                    <Tooltip
                                                        formatter={(val, name) => [`${val} pacientes`, name]}
                                                        labelFormatter={l => `Franja etaria: ${l} años`}
                                                        contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.8rem' }}
                                                    />
                                                    <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                                    <Bar dataKey="asignados" name="Turnos Asignados" fill={PALETTE.blue} radius={[6, 6, 0, 0]} />
                                                    <Bar dataKey="concretados" name="Concretados (Presente)" fill={PALETTE.emerald} radius={[6, 6, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </Card>

                                    <Card
                                        title="Distribución por Sexo (Gráfico de Torta)"
                                        subtitle="Composición demográfica de pacientes con turno en SALUS"
                                        explanation="Proporción de pacientes mujeres y hombres que gestionan y concretan sus turnos a través de WhatsApp."
                                    >
                                        {analytics.demographics.sexoPie.length === 0 ? (
                                            <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.84rem' }}>
                                                Sin datos demográficos.
                                            </div>
                                        ) : (
                                            <div style={{ height: '270px', width: '100%' }}>
                                                <ResponsiveContainer>
                                                    <PieChart>
                                                        <Pie
                                                            data={analytics.demographics.sexoPie}
                                                            dataKey="value"
                                                            nameKey="name"
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={58}
                                                            outerRadius={92}
                                                            paddingAngle={3}
                                                        >
                                                            {analytics.demographics.sexoPie.map((_e, idx) => (
                                                                <Cell key={idx} fill={PIE_SEXO_COLORS[idx % PIE_SEXO_COLORS.length]} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip
                                                            formatter={(v) => [`${v} pacientes`, 'Cantidad']}
                                                            contentStyle={{ borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.8rem' }}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </Card>
                                </div>
                            </>
                        )}

                        {/* ==================== TAB 4: AUDITORÍA DETALLADA ==================== */}
                        {activeTab === 'auditoria' && (
                            <Card
                                title={`Trazabilidad Paciente por Paciente (${filteredAuditRows.length} registros)`}
                                subtitle="Auditoría directa de cada consulta ingresada por WhatsApp y su estado exacto en SALUS"
                                badge={
                                    <button
                                        onClick={handleExportCsv}
                                        disabled={!filteredAuditRows.length}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '6px 12px', borderRadius: '8px',
                                            border: '1px solid #BBF7D0', background: '#F0FDF4',
                                            color: '#15803D', fontSize: '0.76rem', fontWeight: 700,
                                            cursor: filteredAuditRows.length ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        <Download size={14} /> Exportar CSV
                                    </button>
                                }
                            >
                                {/* Filtros de tabla */}
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                    <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '340px' }}>
                                        <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente, teléfono, DNI u obra social..."
                                            value={auditSearch}
                                            onChange={e => setAuditSearch(e.target.value)}
                                            style={{
                                                width: '100%', padding: '7px 10px 7px 32px',
                                                borderRadius: '8px', border: '1px solid #CBD5E1',
                                                fontSize: '0.8rem', boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'all', label: 'Todos' },
                                            { id: 'concretado', label: 'Concretados' },
                                            { id: 'pendiente', label: 'Futuros Pendientes' },
                                            { id: 'ausente', label: 'Ausentes' },
                                            { id: 'sin_turno', label: 'Sin Turno' },
                                            { id: 'sin_respuesta', label: 'Sin Respuesta' },
                                        ].map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => setAuditStatusFilter(f.id)}
                                                style={{
                                                    padding: '5px 10px', borderRadius: '8px',
                                                    border: '1px solid',
                                                    borderColor: auditStatusFilter === f.id ? '#0284C7' : '#E2E8F0',
                                                    background: auditStatusFilter === f.id ? '#F0F9FF' : '#FFFFFF',
                                                    color: auditStatusFilter === f.id ? '#0284C7' : '#64748B',
                                                    fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                                                }}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '460px', overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: '10px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                        <thead>
                                            <tr style={{ background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 1 }}>
                                                {['Paciente / Teléfono', 'Consulta WA', 'Respuesta', 'Turno SALUS', 'Tipo', 'Edad', 'Estado'].map(h => (
                                                    <th key={h} style={{
                                                        textAlign: 'left', padding: '10px 12px',
                                                        fontSize: '0.7rem', fontWeight: 700, color: '#64748B',
                                                        textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredAuditRows.slice(0, 200).map((r, idx) => {
                                                const badgeStyle = r.estadoPaciente === 'Concretado'
                                                    ? { bg: '#DCFCE7', color: '#15803D' }
                                                    : r.estadoPaciente === 'Pendiente Futuro'
                                                        ? { bg: '#E0F2FE', color: '#0369A1' }
                                                        : r.estadoPaciente.startsWith('Ausen')
                                                            ? { bg: '#FEE2E2', color: '#B91C1C' }
                                                            : { bg: '#F1F5F9', color: '#64748B' };

                                                return (
                                                    <tr
                                                        key={`${r.phone}-${idx}`}
                                                        onClick={() => { setSelectedAuditRow(r); setShowAllPatientVisits(false); }}
                                                        style={{
                                                            borderBottom: '1px solid #F1F5F9',
                                                            cursor: 'pointer',
                                                            transition: 'background 0.12s',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                        title="Clic para ver el resumen de visitas relacionadas al chequeo de este paciente"
                                                    >
                                                        <td style={{ padding: '9px 12px' }}>
                                                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.paciente}</div>
                                                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{r.phone}{r.dni ? ` · DNI ${r.dni}` : ''}</div>
                                                        </td>
                                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                                                            {new Date(r.fechaConsulta).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}{' '}
                                                            <span style={{ color: '#94A3B8' }}>
                                                                {new Date(r.fechaConsulta).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                            {r.respondida ? (
                                                                <span style={{ color: '#059669', fontWeight: 600 }}>
                                                                    Sí ({formatFrt(r.frtMinutes)})
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: '#DC2626', fontWeight: 600 }}>Sin resp.</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                                                            {r.fechaVisita ? (
                                                                <>
                                                                    <strong>{new Date(r.fechaVisita + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</strong>
                                                                    {r.horaVisita ? ` ${r.horaVisita}` : ''}
                                                                    {r.cantidadTurnos > 1 && (
                                                                        <span style={{ marginLeft: '5px', fontSize: '0.68rem', color: '#0284C7', fontWeight: 700 }}>
                                                                            (+{r.cantidadTurnos - 1})
                                                                        </span>
                                                                    )}
                                                                </>
                                                            ) : '—'}
                                                        </td>
                                                        <td style={{ padding: '9px 12px', color: '#475569' }}>{r.tipoTurno}</td>
                                                        <td style={{ padding: '9px 12px', color: '#475569' }}>{r.edad ?? '—'}</td>
                                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                            <span style={{
                                                                padding: '3px 9px', borderRadius: '999px',
                                                                fontSize: '0.7rem', fontWeight: 700,
                                                                background: badgeStyle.bg, color: badgeStyle.color,
                                                            }}>
                                                                {r.estadoPaciente}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {filteredAuditRows.length > 200 && (
                                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '8px', textAlign: 'right' }}>
                                        Mostrando los primeros 200 de {filteredAuditRows.length} registros. Usá "Exportar CSV" para descargar el listado completo.
                                    </div>
                                )}
                            </Card>
                        )}

                    </div>
                )}
            </div>

            {/* ========== MODAL RESUMEN DE VISITAS DEL PACIENTE ========== */}
            {selectedAuditRow && (() => {
                const todayStr = new Date().toISOString().slice(0, 10);
                const visitas = showAllPatientVisits
                    ? (selectedAuditRow.allTurnosPaciente || [])
                    : (selectedAuditRow.turnosDetalle || []);
                const presentesCount = visitas.filter(v => (v.asistencia || '').toLowerCase() === 'presente').length;
                const futurosCount = visitas.filter(v => (v.asistencia || '').toLowerCase() !== 'presente' && v.fecha_visita >= todayStr).length;
                const ausentesCount = Math.max(0, visitas.length - presentesCount - futurosCount);

                const getCatColors = (cat) => {
                    if (cat === 'Chequeo Preventivo') return { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' };
                    if (cat === 'Chequeo Informe') return { bg: '#F0F9FF', color: '#0284C7', border: '#BAE6FD' };
                    if (cat === 'Ecografía') return { bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' };
                    return { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' };
                };

                return (
                    <div
                        onClick={() => setSelectedAuditRow(null)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 10040,
                            background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '20px',
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: '#FFFFFF',
                                borderRadius: '16px',
                                border: '1px solid #E2E8F0',
                                boxShadow: '0 24px 50px rgba(15, 23, 42, 0.2)',
                                width: '100%',
                                maxWidth: '760px',
                                maxHeight: '86vh',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                        >
                            {/* Header Modal */}
                            <div style={{
                                padding: '18px 22px',
                                borderBottom: '1px solid #E2E8F0',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                            {selectedAuditRow.paciente}
                                        </h3>
                                        {selectedAuditRow.dni && (
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#F1F5F9', color: '#475569' }}>
                                                DNI {selectedAuditRow.dni}
                                            </span>
                                        )}
                                        {selectedAuditRow.edad !== null && (
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#F0F9FF', color: '#0369A1' }}>
                                                {selectedAuditRow.edad} años
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ marginTop: '4px', fontSize: '0.76rem', color: '#64748B', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                        <span>Tel: <strong>{selectedAuditRow.phone}</strong></span>
                                        {selectedAuditRow.obraSocial && selectedAuditRow.obraSocial !== '—' && (
                                            <span>· Cobertura: <strong>{selectedAuditRow.obraSocial}</strong></span>
                                        )}
                                        <span>· Consulta WA: <strong>{new Date(selectedAuditRow.fechaConsulta).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</strong></span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedAuditRow(null)}
                                    style={{
                                        width: '30px', height: '30px', borderRadius: '8px',
                                        border: '1px solid #E2E8F0', background: '#FFFFFF',
                                        color: '#64748B', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Resumen rápido + Toggle */}
                            <div style={{
                                padding: '12px 22px',
                                background: '#F8FAFC',
                                borderBottom: '1px solid #E2E8F0',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px',
                            }}>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                                    <span style={{ padding: '4px 10px', borderRadius: '8px', background: '#FFFFFF', border: '1px solid #E2E8F0', fontWeight: 700, color: '#0F172A' }}>
                                        Total visitas: {visitas.length}
                                    </span>
                                    <span style={{ padding: '4px 10px', borderRadius: '8px', background: '#DCFCE7', fontWeight: 700, color: '#15803D' }}>
                                        Presentes: {presentesCount}
                                    </span>
                                    {futurosCount > 0 && (
                                        <span style={{ padding: '4px 10px', borderRadius: '8px', background: '#E0F2FE', fontWeight: 700, color: '#0369A1' }}>
                                            Futuros: {futurosCount}
                                        </span>
                                    )}
                                    {ausentesCount > 0 && (
                                        <span style={{ padding: '4px 10px', borderRadius: '8px', background: '#FEE2E2', fontWeight: 700, color: '#B91C1C' }}>
                                            Ausentes: {ausentesCount}
                                        </span>
                                    )}
                                </div>

                                {(selectedAuditRow.allTurnosPaciente?.length || 0) > (selectedAuditRow.turnosDetalle?.length || 0) && (
                                    <button
                                        type="button"
                                        onClick={() => setShowAllPatientVisits(prev => !prev)}
                                        style={{
                                            padding: '5px 10px', borderRadius: '8px',
                                            border: '1px solid #CBD5E1', background: '#FFFFFF',
                                            color: '#0284C7', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer',
                                        }}
                                    >
                                        {showAllPatientVisits
                                            ? `Ver solo atribuidas (${selectedAuditRow.turnosDetalle?.length || 0})`
                                            : `Ver todas en SALUS (${selectedAuditRow.allTurnosPaciente?.length || 0})`}
                                    </button>
                                )}
                            </div>

                            {/* Lista de Visitas */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {visitas.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94A3B8', fontSize: '0.84rem' }}>
                                        Este paciente no tiene turnos atribuidos en SALUS para el filtro seleccionado.
                                    </div>
                                ) : (
                                    visitas.map((v, i) => {
                                        const isPres = (v.asistencia || '').toLowerCase() === 'presente';
                                        const isFut = !isPres && v.fecha_visita >= todayStr;
                                        const catStyle = getCatColors(v.categoria_turno);
                                        const statusLabel = isPres ? 'Presente' : isFut ? 'Pendiente Futuro' : (v.asistencia || 'Ausente / Sin marcar');
                                        const statusStyle = isPres
                                            ? { bg: '#DCFCE7', color: '#15803D' }
                                            : isFut
                                                ? { bg: '#E0F2FE', color: '#0369A1' }
                                                : { bg: '#FEE2E2', color: '#B91C1C' };

                                        return (
                                            <div
                                                key={v.id_visita || i}
                                                style={{
                                                    padding: '12px 14px',
                                                    borderRadius: '11px',
                                                    border: '1px solid #E2E8F0',
                                                    background: '#FFFFFF',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <span style={{
                                                            fontSize: '0.69rem', fontWeight: 700, padding: '2px 8px',
                                                            borderRadius: '6px', background: catStyle.bg,
                                                            color: catStyle.color, border: `1px solid ${catStyle.border}`,
                                                        }}>
                                                            {v.categoria_turno}
                                                        </span>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                                            {v.tipo_visita || v.especialidad || 'Consulta'}
                                                        </span>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px',
                                                        borderRadius: '999px', background: statusStyle.bg, color: statusStyle.color,
                                                    }}>
                                                        {statusLabel}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.74rem', color: '#475569' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#0F172A' }}>
                                                        <Calendar size={12} color="#0284C7" />
                                                        {new Date(v.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        {v.hora_visita ? ` · ${v.hora_visita} hs` : ''}
                                                    </span>
                                                    {v.medico && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <Stethoscope size={12} color="#64748B" /> {v.medico}
                                                        </span>
                                                    )}
                                                    {v.centro && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <Building2 size={12} color="#64748B" /> {v.centro}
                                                        </span>
                                                    )}
                                                </div>

                                                {(v.fecha_creacion || v.usuario_creacion) && (
                                                    <div style={{ fontSize: '0.69rem', color: '#94A3B8' }}>
                                                        Turno asignado en SALUS
                                                        {v.fecha_creacion ? ` el ${new Date(v.fecha_creacion).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                                                        {v.usuario_creacion ? ` por ${v.usuario_creacion}` : ''}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
