import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Heart, ShieldCheck, Search, Filter, RefreshCw, Send, Phone,
    Calendar, Users, Download, Copy, Check, QrCode, ExternalLink,
    Trash2, MessageSquare, AlertCircle, Sparkles, CheckCircle2, ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
    fetchPrevenirLeads,
    sendPrevenirWhatsApp,
    deletePrevenirLead,
    updatePrevenirLead,
    formatPhoneDisplay
} from '../services/prevenirService';

export default function PrevenirAdminPanel({ addToast, onViewChange }) {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterDate, setFilterDate] = useState('all'); // 'today' | 'all'
    const [filterCaptador, setFilterCaptador] = useState('all');
    const [copiedLink, setCopiedLink] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [sendingId, setSendingId] = useState(null);

    // Obtener la URL pública para compartir
    const publicUrl = useMemo(() => {
        const origin = window.location.origin;
        return `${origin}/prevenir`;
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchPrevenirLeads({
                dateFilter: filterDate,
                search: search,
            });
            setLeads(data || []);
        } catch (err) {
            console.error(err);
            addToast?.('Error al cargar datos del Programa Prevenir', 'error');
        } finally {
            setLoading(false);
        }
    }, [filterDate, search, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Filtrar por captador
    const filteredLeads = useMemo(() => {
        if (filterCaptador === 'all') return leads;
        return leads.filter(l => l.registrado_por === filterCaptador);
    }, [leads, filterCaptador]);

    // Métricas en tiempo real
    const metrics = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const hoy = leads.filter(l => l.created_at && l.created_at.startsWith(todayStr)).length;
        const mensajesEnviados = leads.filter(l => l.mensaje_enviado).length;
        const total = leads.length;
        return { total, hoy, mensajesEnviados };
    }, [leads]);

    // Copiar link al portapapeles
    const handleCopyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        setCopiedLink(true);
        addToast?.('Link público copiado al portapapeles', 'success');
        setTimeout(() => setCopiedLink(false), 2500);
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
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header del Panel */}
            <div style={{ marginBottom: '20px', flexShrink: 0 }}>
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
                            Gestión y auditoría de prospectos captados en territorio para chequeos preventivos
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
                            Exportar Excel
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

                {/* Métricas Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '14px 18px',
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>TOTAL CAPTADOS</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                            {metrics.total}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600, marginTop: '2px' }}>
                            Base Programa Prevenir
                        </div>
                    </div>

                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '14px 18px',
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>CAPTADOS HOY EN OSP</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                            {metrics.hoy}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
                            Operativo en curso
                        </div>
                    </div>

                    <div style={{
                        background: '#ffffff', borderRadius: '12px', padding: '14px 18px',
                        border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>WHATSAPP ENVIADOS</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
                            {metrics.mensajesEnviados}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600, marginTop: '2px' }}>
                            {metrics.total > 0 ? `${Math.round((metrics.mensajesEnviados / metrics.total) * 100)}% contactados` : '0%'}
                        </div>
                    </div>

                    {/* Banner de acceso directo */}
                    <div style={{
                        background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                        borderRadius: '12px', padding: '12px 16px',
                        border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column',
                        justifyContent: 'center'
                    }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8' }}>
                            ACCESO RÁPIDO PARA EL CELULAR:
                        </div>
                        <div style={{
                            fontSize: '0.8rem', fontWeight: 700, color: '#1e3a8a',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px'
                        }}>
                            {publicUrl}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px' }}>
                            Sin login requerido • Optimizado para mobile
                        </div>
                    </div>
                </div>

                {/* Barra de Filtros */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    padding: '10px 14px', background: '#ffffff', borderRadius: '10px',
                    border: '1px solid #e2e8f0'
                }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                        <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, teléfono, DNI o captador..."
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Fecha:</span>
                        <select
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            style={{
                                height: '34px', padding: '0 8px', borderRadius: '6px',
                                border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#fff',
                                fontWeight: 600, color: '#334155', outline: 'none'
                            }}
                        >
                            <option value="all">Todos los registros</option>
                            <option value="today">Solo los de Hoy</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Captador:</span>
                        <select
                            value={filterCaptador}
                            onChange={(e) => setFilterCaptador(e.target.value)}
                            style={{
                                height: '34px', padding: '0 8px', borderRadius: '6px',
                                border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#fff',
                                fontWeight: 600, color: '#334155', outline: 'none'
                            }}
                        >
                            <option value="all">Todos</option>
                            <option value="Gisela">Gisela</option>
                            <option value="Pasante">Pasante</option>
                        </select>
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
                                <th style={{ padding: '12px 16px' }}>Captador / Fecha</th>
                                <th style={{ padding: '12px 16px' }}>WhatsApp</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                                        Cargando registros...
                                    </td>
                                </tr>
                            ) : filteredLeads.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        No se encontraron registros con los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                filteredLeads.map((lead) => {
                                    const fechaFmt = new Date(lead.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                                    const horaFmt = new Date(lead.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <tr key={lead.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                                            {/* Paciente */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                    {lead.nombre_completo}
                                                </div>
                                                {lead.dni && (
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                                                        DNI: {lead.dni}
                                                    </div>
                                                )}
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

                                            {/* Captador / Fecha */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.78rem' }}>
                                                    {lead.registrado_por || 'Stand OSP'}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                    {fechaFmt} a las {horaFmt}
                                                </div>
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
                                                    {/* Enviar / Reenviar WhatsApp */}
                                                    <button
                                                        onClick={() => handleSendWhatsApp(lead)}
                                                        disabled={sendingId === lead.id}
                                                        title="Enviar WhatsApp de bienvenida"
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
                                                        onClick={() => handleDelete(lead.id, lead.nombre_completo)}
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
        </div>
    );
}
