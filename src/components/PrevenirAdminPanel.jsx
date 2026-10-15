import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Heart, ShieldCheck, Search, Filter, RefreshCw, Send, Phone,
    Calendar, Users, Download, Copy, Check, QrCode, ExternalLink,
    Trash2, MessageSquare, AlertCircle, Sparkles, CheckCircle2, ChevronDown,
    TrendingUp, BarChart2, Activity, CalendarRange
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import {
    fetchPrevenirLeads,
    sendPrevenirWhatsApp,
    deletePrevenirLead,
    updatePrevenirLead,
    formatPhoneDisplay
} from '../services/prevenirService';
import { normalizeArgentinePhone } from '../services/builderbotApi';
import ChatWindow from './ChatWindow';

// Tooltip médico estilizado para el gráfico de barras diario
const CustomChartTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    return (
        <div style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 8px 20px -4px rgba(15, 23, 42, 0.12)',
            padding: '10px 14px',
            fontSize: '0.8rem',
            minWidth: '180px'
        }}>
            <div style={{
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '6px',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '4px'
            }}>
                {data.fullDate || data.label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>Total captados:</span>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{data.total}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginBottom: '3px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#db2777', fontWeight: 600 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#db2777', display: 'inline-block' }}></span>
                    Prevenir:
                </span>
                <span style={{ fontWeight: 700, color: '#db2777' }}>{data.prevenir}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 600 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', display: 'inline-block' }}></span>
                    Chequeo Anual:
                </span>
                <span style={{ fontWeight: 700, color: '#2563eb' }}>{data.chequeoAnual}</span>
            </div>
        </div>
    );
};

export default function PrevenirAdminPanel({ addToast, onViewChange }) {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedPeriod, setSelectedPeriod] = useState('7d'); // '7d' | '14d' | '30d' | 'month' | 'all' | 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [copiedLink, setCopiedLink] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [sendingId, setSendingId] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatLead, setChatLead] = useState(null);

    // Obtener la URL pública para compartir
    const publicUrl = useMemo(() => {
        const origin = window.location.origin;
        return `${origin}/prevenir`;
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Traemos todos los registros para permitir análisis reactivo continuo
            const data = await fetchPrevenirLeads({
                dateFilter: 'all',
                limit: 2000
            });
            setLeads(data || []);
        } catch (err) {
            console.error(err);
            addToast?.('Error al cargar datos del Programa Prevenir', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Función auxiliar para obtener fecha YYYY-MM-DD en hora local
    const getLocalDateStr = (d) => {
        if (!d) return '';
        const dateObj = typeof d === 'string' ? new Date(d) : d;
        if (isNaN(dateObj.getTime())) return '';
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // Rango de fechas según período seleccionado
    const periodRange = useMemo(() => {
        const today = new Date();
        const end = new Date(today);
        end.setHours(23, 59, 59, 999);

        let start = new Date(today);
        start.setHours(0, 0, 0, 0);

        if (selectedPeriod === '7d') {
            start.setDate(today.getDate() - 6);
        } else if (selectedPeriod === '14d') {
            start.setDate(today.getDate() - 13);
        } else if (selectedPeriod === '30d') {
            start.setDate(today.getDate() - 29);
        } else if (selectedPeriod === 'month') {
            start = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
        } else if (selectedPeriod === 'custom') {
            if (customStartDate) {
                const [y, m, d] = customStartDate.split('-').map(Number);
                start = new Date(y, m - 1, d, 0, 0, 0, 0);
            } else {
                start.setDate(today.getDate() - 6);
            }
            if (customEndDate) {
                const [y, m, d] = customEndDate.split('-').map(Number);
                end.setTime(new Date(y, m - 1, d, 23, 59, 59, 999).getTime());
            }
        } else if (selectedPeriod === 'all') {
            if (leads.length > 0) {
                const minTime = Math.min(...leads.map(l => new Date(l.created_at).getTime()).filter(t => !isNaN(t)));
                if (isFinite(minTime)) {
                    start = new Date(minTime);
                    start.setHours(0, 0, 0, 0);
                } else {
                    start.setDate(today.getDate() - 29);
                }
            } else {
                start.setDate(today.getDate() - 29);
            }
        }

        return { start, end };
    }, [selectedPeriod, customStartDate, customEndDate, leads]);

    // Métricas y datos diarios para gráfico y análisis
    const { chartData, periodMetrics, periodLeads } = useMemo(() => {
        const { start, end } = periodRange;
        const startTime = start.getTime();
        const endTime = end.getTime();

        // 1. Filtrar prospectos en el rango
        const inPeriod = leads.filter(l => {
            if (!l.created_at) return false;
            const t = new Date(l.created_at).getTime();
            return t >= startTime && t <= endTime;
        });

        // 2. Construir días continuos para el gráfico
        const days = [];
        const curr = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endNorm = new Date(end.getFullYear(), end.getMonth(), end.getDate());

        let count = 0;
        while (curr <= endNorm && count < 370) {
            const ymd = getLocalDateStr(curr);
            const dayLabel = curr.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
            const weekday = curr.toLocaleDateString('es-AR', { weekday: 'short' });
            const fullDate = curr.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

            days.push({
                dateKey: ymd,
                label: `${dayLabel}`,
                weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
                fullDate: fullDate.charAt(0).toUpperCase() + fullDate.slice(1),
                total: 0,
                prevenir: 0,
                chequeoAnual: 0,
            });

            curr.setDate(curr.getDate() + 1);
            count++;
        }

        // 3. Mapear prospectos a los días
        inPeriod.forEach(l => {
            const dKey = getLocalDateStr(new Date(l.created_at));
            const dayItem = days.find(d => d.dateKey === dKey);
            if (dayItem) {
                dayItem.total += 1;
                const t = (l.tipo_chequeo || '').toLowerCase();
                if (t.includes('prevenir')) {
                    dayItem.prevenir += 1;
                } else {
                    dayItem.chequeoAnual += 1;
                }
            }
        });

        // 4. Métricas calculadas
        const totalPeriod = inPeriod.length;
        const totalDias = Math.max(days.length, 1);
        const promedioDiario = (totalPeriod / totalDias).toFixed(1);

        let picoCount = 0;
        let picoDay = null;
        days.forEach(d => {
            if (d.total > picoCount) {
                picoCount = d.total;
                picoDay = d;
            }
        });

        const totalPrevenir = inPeriod.filter(l => (l.tipo_chequeo || '').toLowerCase().includes('prevenir')).length;
        const totalChequeo = totalPeriod - totalPrevenir;
        const pctPrevenir = totalPeriod > 0 ? Math.round((totalPrevenir / totalPeriod) * 100) : 0;
        const pctChequeo = totalPeriod > 0 ? Math.round((totalChequeo / totalPeriod) * 100) : 0;

        return {
            chartData: days,
            periodLeads: inPeriod,
            periodMetrics: {
                totalPeriod,
                totalDias,
                promedioDiario,
                picoCount,
                picoLabel: picoDay && picoCount > 0 ? `${picoDay.label} (${picoCount})` : (picoCount > 0 ? `${picoCount}` : 'Sin captaciones'),
                picoFullDate: picoDay?.fullDate || '',
                totalPrevenir,
                totalChequeo,
                pctPrevenir,
                pctChequeo,
            }
        };
    }, [leads, periodRange]);

    // Filtrar tabla por búsqueda en tiempo real
    const filteredLeads = useMemo(() => {
        if (!search.trim()) return periodLeads;
        const q = search.toLowerCase().trim();
        return periodLeads.filter(l =>
            (l.nombre_completo && l.nombre_completo.toLowerCase().includes(q)) ||
            (l.dni && String(l.dni).includes(q)) ||
            (l.telefono && String(l.telefono).includes(q)) ||
            (l.telefono_wa && String(l.telefono_wa).includes(q)) ||
            (l.registrado_por && l.registrado_por.toLowerCase().includes(q)) ||
            (l.obra_social && l.obra_social.toLowerCase().includes(q))
        );
    }, [periodLeads, search]);

    // Copiar link al portapapeles
    const handleCopyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        setCopiedLink(true);
        addToast?.('Link público copiado al portapapeles', 'success');
        setTimeout(() => setCopiedLink(false), 2500);
    };

    // Abrir ventana de chat / plantillas para el prospecto
    const handleOpenChat = (lead) => {
        const phone = lead.telefono_wa || lead.telefono;
        if (!phone) {
            addToast?.('Este paciente no tiene teléfono registrado', 'error');
            return;
        }
        setChatLead(lead);
        setChatOpen(true);
    };

    // Reenviar o enviar WhatsApp
    const handleSendWhatsApp = async (lead) => {
        setSendingId(lead.id);
        try {
            await sendPrevenirWhatsApp({ lead });
            addToast?.(`Mensaje de WhatsApp enviado a ${lead.nombre_completo}`, 'success');
            loadData();
        } catch (err) {
            console.error(err);
            addToast?.(err.message || 'Error al enviar mensaje por WhatsApp', 'error');
        } finally {
            setSendingId(null);
        }
    };

    // Eliminar lead
    const handleDelete = async (id, nombre) => {
        if (!window.confirm(`¿Estás seguro de eliminar el registro de ${nombre}?`)) return;
        try {
            await deletePrevenirLead(id);
            addToast?.('Registro eliminado correctamente', 'info');
            setLeads(prev => prev.filter(l => l.id !== id));
        } catch (err) {
            console.error(err);
            addToast?.('Error al eliminar registro', 'error');
        }
    };

    // Exportar a Excel
    const handleExportExcel = () => {
        if (filteredLeads.length === 0) {
            addToast?.('No hay registros para exportar', 'warning');
            return;
        }

        const dataToExport = filteredLeads.map(l => ({
            'Fecha Registro': new Date(l.created_at).toLocaleDateString('es-AR'),
            'Hora': new Date(l.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            'Nombre y Apellido': l.nombre_completo,
            'DNI': l.dni || '',
            'Fecha Nacimiento': l.fecha_nacimiento || '',
            'Edad': l.edad || '',
            'Teléfono Original': l.telefono,
            'WhatsApp API': l.telefono_wa,
            'Obra Social': l.obra_social,
            'Tipo Chequeo': l.tipo_chequeo,
            'Captador': l.registrado_por,
            'Lugar': l.lugar_captacion,
            'WhatsApp Enviado': l.mensaje_enviado ? 'SÍ' : 'NO',
            'Fecha Envío WA': l.fecha_mensaje_enviado ? new Date(l.fecha_mensaje_enviado).toLocaleString('es-AR') : '',
            'Observaciones': l.observaciones || '',
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Programa Prevenir OSP');

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Programa_Prevenir_OSP_${dateStr}.xlsx`);
        addToast?.('Planilla Excel descargada con éxito', 'success');
    };

    return (
        <div style={{ padding: '24px', minHeight: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {/* Header del Panel */}
            <div style={{ marginBottom: '18px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h2 style={{
                            fontSize: '1.45rem', fontWeight: 800, color: '#1e293b', margin: 0,
                            display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                            <div style={{
                                width: '38px', height: '38px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <Heart size={20} color="#fff" />
                            </div>
                            Programa Prevenir — Obra Social Provincia
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '4px 0 0 48px' }}>
                            Gestión, métricas y auditoría de prospectos captados en territorio para chequeos preventivos
                        </p>
                    </div>

                    {/* Acciones principales del Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Botón Copiar Link Celular */}
                        <button
                            onClick={handleCopyLink}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                                background: copiedLink ? '#ecfdf5' : '#eff6ff',
                                border: copiedLink ? '1px solid #a7f3d0' : '1px solid #bfdbfe',
                                borderRadius: '8px', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 700,
                                color: copiedLink ? '#059669' : '#1d4ed8',
                                transition: 'all 0.15s'
                            }}
                        >
                            {copiedLink ? <Check size={15} /> : <Copy size={15} />}
                            {copiedLink ? '¡Link Copiado!' : 'Copiar Link para Celular'}
                        </button>

                        {/* Botón QR */}
                        <button
                            onClick={() => setShowQrModal(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                                background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px',
                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#334155'
                            }}
                        >
                            <QrCode size={15} />
                            Ver QR Móvil
                        </button>

                        {/* Botón Exportar Excel */}
                        <button
                            onClick={handleExportExcel}
                            disabled={filteredLeads.length === 0}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px',
                                cursor: filteredLeads.length === 0 ? 'not-allowed' : 'pointer',
                                fontSize: '0.8rem', fontWeight: 700, color: '#166534'
                            }}
                        >
                            <Download size={15} />
                            Exportar Excel ({filteredLeads.length})
                        </button>

                        {/* Botón Refrescar */}
                        <button
                            onClick={loadData}
                            disabled={loading}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
                                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                                cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#475569'
                            }}
                        >
                            <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Métricas por Período Seleccionado */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    {/* Tarjeta 1: Total Captados en Período */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '14px 18px',
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.3px' }}>
                                TOTAL CAPTADOS
                            </span>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '7px',
                                background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#2563eb'
                            }}>
                                <Users size={15} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>
                            {periodMetrics.totalPeriod}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                            En el período ({periodMetrics.totalDias} días) • Base total: <strong style={{ color: '#0f172a' }}>{leads.length}</strong>
                        </div>
                    </div>

                    {/* Tarjeta 2: Promedio Diario */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '14px 18px',
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.3px' }}>
                                PROMEDIO DIARIO
                            </span>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '7px',
                                background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#16a34a'
                            }}>
                                <TrendingUp size={15} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', margin: '4px 0 2px' }}>
                            {periodMetrics.promedioDiario}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                            Personas captadas por día en este período
                        </div>
                    </div>

                    {/* Tarjeta 3: Pico Máximo Diario */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '14px 18px',
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.3px' }}>
                                PICO MÁXIMO DIARIO
                            </span>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '7px',
                                background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#d97706'
                            }}>
                                <Activity size={15} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706', margin: '4px 0 2px' }}>
                            {periodMetrics.picoCount} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400e' }}>máx/día</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {periodMetrics.picoCount > 0 ? `Día récord: ${periodMetrics.picoLabel}` : 'Sin captaciones en el rango'}
                        </div>
                    </div>

                    {/* Tarjeta 4: Distribución de Interés */}
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '14px 18px',
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.3px' }}>
                                DISTRIBUCIÓN POR INTERÉS
                            </span>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '7px',
                                background: '#fdf2f8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#db2777'
                            }}>
                                <Heart size={15} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '6px 0 4px' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#db2777' }}>
                                {periodMetrics.totalPrevenir} Prevenir <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>({periodMetrics.pctPrevenir}%)</span>
                            </span>
                            <span style={{ color: '#cbd5e1' }}>•</span>
                            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#2563eb' }}>
                                {periodMetrics.totalChequeo} Chequeo <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>({periodMetrics.pctChequeo}%)</span>
                            </span>
                        </div>
                        {/* Mini barra porcentual */}
                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                            <div style={{ width: `${periodMetrics.pctPrevenir}%`, background: '#db2777', transition: 'width 0.3s' }} />
                            <div style={{ width: `${periodMetrics.pctChequeo}%`, background: '#2563eb', transition: 'width 0.3s' }} />
                        </div>
                    </div>
                </div>

                {/* Gráfico de Evolución Diaria y Selector de Período */}
                <div style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    padding: '16px 20px',
                    marginBottom: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    {/* Header del Gráfico con Selector de Período */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '16px',
                        borderBottom: '1px solid #f1f5f9',
                        paddingBottom: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '34px', height: '34px', borderRadius: '8px',
                                background: '#eff6ff', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: '#1d4ed8'
                            }}>
                                <BarChart2 size={18} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                                    Cantidad de Personas Captadas Día por Día
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                                    Evolución temporal continua en el período seleccionado ({periodMetrics.totalPeriod} captados en {periodMetrics.totalDias} días)
                                </p>
                            </div>
                        </div>

                        {/* Selector de Períodos (Pills) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                            {[
                                { key: '7d', label: '7 días' },
                                { key: '14d', label: '14 días' },
                                { key: '30d', label: '30 días' },
                                { key: 'month', label: 'Este Mes' },
                                { key: 'all', label: 'Todo' },
                                { key: 'custom', label: 'Personalizado' },
                            ].map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => setSelectedPeriod(p.key)}
                                    style={{
                                        padding: '5px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: selectedPeriod === p.key ? 700 : 600,
                                        borderRadius: '6px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: selectedPeriod === p.key ? '#2563eb' : 'transparent',
                                        color: selectedPeriod === p.key ? '#ffffff' : '#64748b',
                                        boxShadow: selectedPeriod === p.key ? '0 1px 2px rgba(37,99,235,0.2)' : 'none',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Inputs de Rango Personalizado */}
                    {selectedPeriod === 'custom' && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            background: '#eff6ff', padding: '10px 14px', borderRadius: '8px',
                            border: '1px solid #bfdbfe', marginBottom: '14px', flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CalendarRange size={15} color="#1d4ed8" />
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e3a8a' }}>Rango personalizado:</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 600 }}>Desde:</span>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    style={{
                                        padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                        fontSize: '0.76rem', background: '#fff', outline: 'none'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 600 }}>Hasta:</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    style={{
                                        padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                                        fontSize: '0.76rem', background: '#fff', outline: 'none'
                                    }}
                                />
                            </div>
                            {(customStartDate || customEndDate) && (
                                <button
                                    onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                                    style={{
                                        fontSize: '0.72rem', color: '#1d4ed8', background: 'none', border: 'none',
                                        cursor: 'pointer', textDecoration: 'underline', fontWeight: 600
                                    }}
                                >
                                    Limpiar fechas
                                </button>
                            )}
                        </div>
                    )}

                    {/* Gráfico Recharts de Barras Diarias */}
                    <div style={{ width: '100%', height: 230 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 12, right: 10, left: -22, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#e2e8f0' }}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Bar dataKey="prevenir" name="Programa Prevenir" stackId="a" fill="#db2777" radius={[0, 0, 0, 0]} maxBarSize={40} />
                                <Bar dataKey="chequeoAnual" name="Chequeo Anual" stackId="a" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Leyenda y Subtítulo del Gráfico */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f8fafc',
                        fontSize: '0.74rem', color: '#64748b', flexWrap: 'wrap', gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#db2777', display: 'inline-block' }}></span>
                                Programa Prevenir ({periodMetrics.totalPrevenir})
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#2563eb', display: 'inline-block' }}></span>
                                Chequeo Anual ({periodMetrics.totalChequeo})
                            </span>
                        </div>
                        <div style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                            * Haz clic en una barra para ver el detalle del día en el tooltip
                        </div>
                    </div>
                </div>

                {/* Barra de Búsqueda y Filtros de la Tabla */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap',
                    padding: '10px 14px', background: '#ffffff', borderRadius: '10px',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                        <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, teléfono, DNI, obra social o captador..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%', boxSizing: 'border-box', height: '34px',
                                paddingLeft: '32px', paddingRight: '10px',
                                borderRadius: '6px', border: '1px solid #cbd5e1',
                                fontSize: '0.82rem', outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '0.75rem', fontWeight: 700, color: '#334155',
                            background: '#f8fafc', padding: '6px 12px', borderRadius: '6px',
                            border: '1px solid #e2e8f0'
                        }}>
                            Mostrando <strong style={{ color: '#2563eb' }}>{filteredLeads.length}</strong> de {periodMetrics.totalPeriod} registros del período
                        </span>
                    </div>
                </div>
            </div>

            {/* Tabla de Datos Clínica */}
            <div style={{
                flex: 1,
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
                <div style={{ overflowX: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.83rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                                <th style={{ padding: '12px 16px' }}>Paciente</th>
                                <th style={{ padding: '12px 16px' }}>Edad / Fecha Nac</th>
                                <th style={{ padding: '12px 16px' }}>WhatsApp / Teléfono</th>
                                <th style={{ padding: '12px 16px' }}>Obra Social</th>
                                <th style={{ padding: '12px 16px' }}>Interés</th>
                                <th style={{ padding: '12px 16px' }}>WhatsApp</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                                        Cargando registros...
                                    </td>
                                </tr>
                            ) : filteredLeads.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        No se encontraron registros con los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                filteredLeads.map((lead) => {
                                    const fechaFmt = new Date(lead.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                                    const horaFmt = new Date(lead.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <tr
                                            key={lead.id}
                                            onClick={() => handleOpenChat(lead)}
                                            style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {/* Paciente */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                    {lead.nombre_completo}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                                                    {lead.dni ? `DNI: ${lead.dni} • ` : ''}{fechaFmt} a las {horaFmt}
                                                </div>
                                                {lead.observaciones && (
                                                    <div style={{ fontSize: '0.7rem', color: '#d97706', marginTop: '2px', fontStyle: 'italic' }}>
                                                        📝 {lead.observaciones}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Edad / Fecha Nac */}
                                            <td style={{ padding: '12px 16px' }}>
                                                {lead.edad !== null ? (
                                                    <span style={{
                                                        fontWeight: 700,
                                                        background: '#fef3c7',
                                                        color: '#92400e',
                                                        padding: '2px 7px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid #fde68a'
                                                    }}>
                                                        🎂 {lead.edad} años
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8' }}>-</span>
                                                )}
                                                {lead.fecha_nacimiento && (
                                                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                                                        {new Date(lead.fecha_nacimiento + 'T00:00:00').toLocaleDateString('es-AR')}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Teléfono / WhatsApp */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                                    {formatPhoneDisplay(lead.telefono_wa || lead.telefono)}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600 }}>
                                                    API: {lead.telefono_wa}
                                                </div>
                                            </td>

                                            {/* Obra Social */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: lead.obra_social?.includes('Provincia') ? '#1d4ed8' : '#475569'
                                                }}>
                                                    {lead.obra_social || 'OSP'}
                                                </span>
                                            </td>

                                            {/* Interés */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 800,
                                                    background: lead.tipo_chequeo === 'Prevenir' ? '#fdf2f8' : (lead.tipo_chequeo === 'Chequeo anual' ? '#f0fdf4' : '#f1f5f9'),
                                                    color: lead.tipo_chequeo === 'Prevenir' ? '#db2777' : (lead.tipo_chequeo === 'Chequeo anual' ? '#059669' : '#334155'),
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    border: lead.tipo_chequeo === 'Prevenir' ? '1px solid #fbcfe8' : (lead.tipo_chequeo === 'Chequeo anual' ? '1px solid #bbf7d0' : '1px solid #e2e8f0'),
                                                }}>
                                                    {lead.tipo_chequeo || 'Prevenir'}
                                                </span>
                                            </td>

                                            {/* Estado WhatsApp */}
                                            <td style={{ padding: '12px 16px' }}>
                                                {lead.mensaje_enviado ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                        background: '#ecfdf5', color: '#059669',
                                                        padding: '3px 8px', borderRadius: '6px',
                                                        border: '1px solid #a7f3d0'
                                                    }}>
                                                        <CheckCircle2 size={12} /> Enviado
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        fontSize: '0.72rem', fontWeight: 600,
                                                        background: '#f8fafc', color: '#64748b',
                                                        padding: '3px 8px', borderRadius: '6px',
                                                        border: '1px solid #e2e8f0'
                                                    }}>
                                                        Pendiente
                                                    </span>
                                                )}
                                            </td>

                                            {/* Acciones */}
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    {/* Abrir Chat con Plantillas */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenChat(lead);
                                                        }}
                                                        title="Abrir chat y continuar con plantillas Meta"
                                                        style={{
                                                            padding: '6px 11px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #bfdbfe',
                                                            background: '#eff6ff',
                                                            color: '#1d4ed8',
                                                            cursor: 'pointer',
                                                            fontSize: '0.74rem',
                                                            fontWeight: 700,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                                                    >
                                                        <MessageSquare size={13} color="#1d4ed8" />
                                                        <span>Chat / Plantillas</span>
                                                    </button>

                                                    {/* Enviar / Reenviar WhatsApp de bienvenida */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSendWhatsApp(lead);
                                                        }}
                                                        disabled={sendingId === lead.id}
                                                        title="Reenviar WhatsApp de bienvenida"
                                                        style={{
                                                            padding: '6px 10px',
                                                            borderRadius: '6px',
                                                            border: 'none',
                                                            background: '#25D366',
                                                            color: '#ffffff',
                                                            cursor: sendingId === lead.id ? 'not-allowed' : 'pointer',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <Send size={12} />
                                                        {sendingId === lead.id ? 'Enviando...' : (lead.mensaje_enviado ? 'Reenviar' : 'Enviar WA')}
                                                    </button>

                                                    {/* Eliminar */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(lead.id, lead.nombre_completo);
                                                        }}
                                                        title="Eliminar registro"
                                                        style={{
                                                            padding: '6px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #fee2e2',
                                                            background: '#fff',
                                                            color: '#ef4444',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Código QR para Celular */}
            {showQrModal && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(3px)',
                    zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '16px'
                }}>
                    <div style={{
                        background: '#ffffff', borderRadius: '16px', padding: '24px',
                        maxWidth: '380px', width: '100%', textAlign: 'center',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                    }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                            Acceso Directo Móvil
                        </h3>
                        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748b' }}>
                            Escaneá este código con la cámara del celular para abrir el formulario de captación in situ.
                        </p>

                        {/* Generación dinámica de QR mediante servicio público rápido */}
                        <div style={{
                            padding: '12px', background: '#f8fafc', borderRadius: '12px',
                            display: 'inline-block', border: '1px solid #e2e8f0', marginBottom: '14px'
                        }}>
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(publicUrl)}`}
                                alt="QR Acceso Móvil Prevenir"
                                style={{ width: '200px', height: '200px', display: 'block' }}
                            />
                        </div>

                        <div style={{
                            fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 700,
                            wordBreak: 'break-all', marginBottom: '16px',
                            padding: '8px', background: '#eff6ff', borderRadius: '8px'
                        }}>
                            {publicUrl}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleCopyLink}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '8px',
                                    border: '1px solid #bfdbfe', background: '#eff6ff',
                                    color: '#1d4ed8', fontSize: '0.82rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Copiar Link
                            </button>
                            <button
                                onClick={() => setShowQrModal(false)}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '8px',
                                    border: 'none', background: '#0f172a',
                                    color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Listo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ChatWindow con soporte completo de Plantillas Meta y chat libre */}
            {chatOpen && chatLead && (
                <ChatWindow
                    open={chatOpen}
                    onClose={() => {
                        setChatOpen(false);
                        setChatLead(null);
                        loadData();
                    }}
                    patientName={chatLead.nombre_completo}
                    patientPhone={normalizeArgentinePhone(chatLead.telefono_wa || chatLead.telefono)}
                    patientContext={{
                        dni: chatLead.dni,
                        idPaciente: chatLead.id,
                        obraSocial: chatLead.obra_social,
                        edad: chatLead.edad,
                        interes: chatLead.tipo_chequeo,
                        origen: 'Programa Prevenir',
                    }}
                    addToast={addToast}
                    defaultLineLabel="Recepciones Prevenir"
                    autoShowTemplates={true}
                />
            )}
        </div>
    );
}
