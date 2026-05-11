import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    RefreshCw, Users, Search, Phone, Loader2, X, ChevronRight,
    UserCheck, UserX, CalendarClock, CheckCircle2, Send,
    Clock, ArrowRight, Building2, Filter, Calendar, Bell,
    MessageSquare, Trash2, StickyNote, AlertTriangle
} from 'lucide-react';
import { fetchScheduledCheckups, updateCheckupStatus, incrementAttempts, deleteCheckup, updateCheckupNotes, migrateFromLocalStorage } from '../services/reminderService';
import { sendMetaTemplate } from '../services/metaTemplateService';
import { normalizeArgentinePhone } from '../services/builderbotApi';
import { saveOutgoingMessage } from '../services/chatService';
import ChatWindow from './ChatWindow';

const PIPELINE_STATES = [
    { key: 'pendiente', label: 'Pendiente', icon: Clock, color: '#94a3b8', bg: '#f8fafc' },
    { key: 'enviado', label: 'Enviado', icon: Send, color: '#3b82f6', bg: '#eff6ff' },
    { key: 'confirmo', label: 'Confirmó', icon: CheckCircle2, color: '#10b981', bg: '#ecfdf5' },
    { key: 'cancelo', label: 'Canceló', icon: UserX, color: '#ef4444', bg: '#fef2f2' },
    { key: 'reprogramo', label: 'Reprogramó', icon: CalendarClock, color: '#f59e0b', bg: '#fffbeb' },
];

function getDaysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function getUrgencyInfo(days) {
    if (days === null) return { label: 'Sin fecha', color: '#94a3b8', bg: '#f8fafc' };
    if (days < 0) return { label: `Hace ${Math.abs(days)}d`, color: '#ef4444', bg: '#fef2f2' };
    if (days === 0) return { label: '¡HOY!', color: '#ef4444', bg: '#fef2f2' };
    if (days === 1) return { label: 'Mañana', color: '#f59e0b', bg: '#fffbeb' };
    if (days <= 3) return { label: `En ${days} días`, color: '#f59e0b', bg: '#fffbeb' };
    if (days <= 7) return { label: `En ${days} días`, color: '#3b82f6', bg: '#eff6ff' };
    return { label: `En ${days} días`, color: '#10b981', bg: '#ecfdf5' };
}

export default function RemarketingPanel({ addToast }) {
    const [checkups, setCheckups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterState, setFilterState] = useState('todos');
    const [sendingId, setSendingId] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatPatient, setChatPatient] = useState(null);
    const [editingNotes, setEditingNotes] = useState(null);
    const [notesText, setNotesText] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [migrated, setMigrated] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // One-time migration from localStorage
            if (!migrated) {
                const result = await migrateFromLocalStorage();
                if (result.migrated > 0) {
                    addToast?.(`✅ ${result.migrated} turnos migrados desde almacenamiento local`, 'success');
                }
                setMigrated(true);
            }
            const data = await fetchScheduledCheckups();
            setCheckups(data);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando recordatorios', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, migrated]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleStatusChange = useCallback(async (id, newState) => {
        try {
            await updateCheckupStatus(id, newState);
            setCheckups(prev => prev.map(c => c.id === id ? { ...c, estado: newState } : c));
            const label = PIPELINE_STATES.find(s => s.key === newState)?.label || newState;
            addToast?.(`Estado actualizado: ${label}`, 'success');
        } catch (e) {
            addToast?.('Error actualizando estado', 'error');
        }
    }, [addToast]);

    const handleSendReminder = useCallback(async (checkup) => {
        if (!checkup.telefono1) {
            addToast?.('Este paciente no tiene teléfono', 'error');
            return;
        }
        setSendingId(checkup.id);
        try {
            const nombre = checkup.paciente?.split(',')[0]?.trim() || 'Paciente';
            const phone = normalizeArgentinePhone(checkup.telefono1);
            await sendMetaTemplate({
                to: phone,
                templateName: 'captar_clientes',
                languageCode: 'es_AR',
                components: [{ type: 'body', parameters: [{ type: 'text', text: nombre }] }],
            });
            await saveOutgoingMessage({
                phone, content: `📋 [Recordatorio] Plantilla enviada a ${nombre}`,
                mediaType: 'text', lineId: 'line_recepciones',
            }).catch(() => {});
            await incrementAttempts(checkup.id);
            await updateCheckupStatus(checkup.id, 'enviado');
            setCheckups(prev => prev.map(c => c.id === checkup.id
                ? { ...c, estado: 'enviado', intentos: (c.intentos || 0) + 1, recordatorio_enviado_at: new Date().toISOString() }
                : c));
            addToast?.(`✅ Recordatorio enviado a ${nombre}`, 'success');
        } catch (e) {
            console.error(e);
            addToast?.('Error enviando recordatorio', 'error');
        } finally {
            setSendingId(null);
        }
    }, [addToast]);

    const handleOpenChat = useCallback((checkup) => {
        if (!checkup.telefono1) { addToast?.('Sin teléfono', 'error'); return; }
        setChatPatient(checkup);
        setChatOpen(true);
    }, [addToast]);

    const handleDelete = useCallback(async (id) => {
        try {
            await deleteCheckup(id);
            setCheckups(prev => prev.filter(c => c.id !== id));
            setConfirmDelete(null);
            addToast?.('Turno eliminado', 'success');
        } catch (e) { addToast?.('Error eliminando', 'error'); }
    }, [addToast]);

    const handleSaveNotes = useCallback(async () => {
        if (!editingNotes) return;
        try {
            await updateCheckupNotes(editingNotes, notesText);
            setCheckups(prev => prev.map(c => c.id === editingNotes ? { ...c, notas: notesText } : c));
            setEditingNotes(null);
            addToast?.('Notas guardadas', 'success');
        } catch (e) { addToast?.('Error guardando notas', 'error'); }
    }, [editingNotes, notesText, addToast]);

    const filtered = useMemo(() => {
        let list = checkups;
        if (search.trim()) {
            const s = search.toLowerCase();
            list = list.filter(p => (p.paciente?.toLowerCase().includes(s)) || (p.dni?.includes(s)));
        }
        if (filterState !== 'todos') list = list.filter(p => p.estado === filterState);
        return list;
    }, [checkups, search, filterState]);

    const funnel = useMemo(() => {
        const counts = {};
        PIPELINE_STATES.forEach(s => { counts[s.key] = 0; });
        checkups.forEach(p => { if (counts[p.estado] !== undefined) counts[p.estado]++; });
        return counts;
    }, [checkups]);

    const urgentCount = useMemo(() => {
        return checkups.filter(c => {
            const d = getDaysUntil(c.fecha_turno);
            return d !== null && d <= 1 && c.estado === 'pendiente';
        }).length;
    }, [checkups]);

    const formatPhone = (phone) => {
        if (!phone) return null;
        if (phone.length === 13 && phone.startsWith('549'))
            return `+54 9 ${phone.slice(3, 6)} ${phone.slice(6, 9)}-${phone.slice(9)}`;
        return phone;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#94a3b8' }}>
                <Loader2 size={32} className="spin" />
                <span style={{ marginTop: '10px', fontSize: '0.88rem' }}>Cargando recordatorios...</span>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Bell size={20} color="#fff" />
                        </div>
                        Recordatorios
                        {urgentCount > 0 && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', animation: 'pulse 2s ease-in-out infinite' }}>
                                {urgentCount} urgente{urgentCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px' }}>
                        Pipeline de seguimiento — turnos de chequeo confirmados
                    </p>
                </div>
                <button onClick={loadData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                    <RefreshCw size={14} /> Actualizar
                </button>
            </div>

            {/* Funnel Cards */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexShrink: 0, overflowX: 'auto' }}>
                {PIPELINE_STATES.map((state, idx) => {
                    const Icon = state.icon;
                    const count = funnel[state.key] || 0;
                    const isActive = filterState === state.key;
                    return (
                        <div key={state.key} style={{ display: 'flex', alignItems: 'center' }}>
                            <button onClick={() => setFilterState(isActive ? 'todos' : state.key)} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                padding: '12px 18px', borderRadius: '12px', border: `2px solid ${isActive ? state.color : 'transparent'}`,
                                background: isActive ? state.bg : '#fff', cursor: 'pointer', minWidth: '90px', transition: 'all .15s',
                                boxShadow: isActive ? `0 2px 8px ${state.color}20` : '0 1px 3px rgba(0,0,0,.04)',
                            }}>
                                <Icon size={20} color={state.color} />
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{count}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: state.color, whiteSpace: 'nowrap' }}>{state.label}</span>
                            </button>
                            {idx < PIPELINE_STATES.length - 1 && (
                                <ArrowRight size={14} color="#cbd5e1" style={{ margin: '0 -2px', flexShrink: 0 }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexShrink: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0 14px', height: '40px' }}>
                <Search size={15} color="#94a3b8" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar paciente..."
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.82rem', background: 'transparent', color: '#1e293b' }} />
                {search && <X size={14} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                {filterState !== 'todos' && (
                    <button onClick={() => setFilterState('todos')} style={{ padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <X size={10} /> Limpiar filtro
                    </button>
                )}
            </div>

            {/* Patient List */}
            <div style={{ flex: 1, background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                    {filtered.length} turnos en pipeline
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {filtered.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#94a3b8' }}>
                            <Users size={32} /><span style={{ marginTop: '8px' }}>Sin resultados</span>
                        </div>
                    ) : (
                        filtered.map((p) => {
                            const stateInfo = PIPELINE_STATES.find(s => s.key === p.estado) || PIPELINE_STATES[0];
                            const StateIcon = stateInfo.icon;
                            const days = getDaysUntil(p.fecha_turno);
                            const urgency = getUrgencyInfo(days);
                            const isSending = sendingId === p.id;

                            return (
                                <div key={p.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '12px 16px', borderBottom: '1px solid #f8fafc', transition: 'all .15s',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    {/* Avatar */}
                                    <div style={{
                                        width: '38px', height: '38px', borderRadius: '10px',
                                        background: `linear-gradient(135deg, ${stateInfo.color}80, ${stateInfo.color})`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.72rem', fontWeight: 800, color: '#fff', flexShrink: 0,
                                    }}>
                                        {(p.paciente || '??').split(',')[0]?.substring(0, 2).toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {p.paciente || 'Sin nombre'}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: urgency.color }}>
                                                <Calendar size={12} /> {formatDate(p.fecha_turno)}
                                            </span>
                                            {p.telefono1 && <span>• {formatPhone(p.telefono1)}</span>}
                                            {p.intentos > 0 && <span>• {p.intentos} intento(s)</span>}
                                            {p.notas && <span title={p.notas}>• 📝</span>}
                                        </div>
                                    </div>

                                    {/* Urgency badge */}
                                    <div style={{
                                        padding: '3px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700,
                                        background: urgency.bg, color: urgency.color, flexShrink: 0, whiteSpace: 'nowrap',
                                        border: days !== null && days <= 1 ? `1px solid ${urgency.color}40` : 'none',
                                        animation: days === 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
                                    }}>
                                        {urgency.label}
                                    </div>

                                    {/* State Badge */}
                                    <div style={{
                                        padding: '4px 10px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700,
                                        background: stateInfo.bg, color: stateInfo.color,
                                        display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                                    }}>
                                        <StateIcon size={12} />
                                        {stateInfo.label}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                        {p.telefono1 && (
                                            <>
                                                <button onClick={() => handleSendReminder(p)} disabled={isSending}
                                                    title="Enviar recordatorio por WhatsApp"
                                                    style={{
                                                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                                                        background: isSending ? '#e2e8f0' : 'linear-gradient(135deg, #25D366, #128C7E)',
                                                        cursor: isSending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', transition: 'all .15s',
                                                    }}>
                                                    {isSending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                                                </button>
                                                <button onClick={() => handleOpenChat(p)} title="Abrir chat"
                                                    style={{
                                                        width: '32px', height: '32px', borderRadius: '8px',
                                                        border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6',
                                                    }}>
                                                    <MessageSquare size={14} />
                                                </button>
                                            </>
                                        )}
                                        <button onClick={() => { setEditingNotes(p.id); setNotesText(p.notas || ''); }} title="Notas"
                                            style={{
                                                width: '32px', height: '32px', borderRadius: '8px',
                                                border: '1px solid #e2e8f0', background: p.notas ? '#fffbeb' : '#fff', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b',
                                            }}>
                                            <StickyNote size={14} />
                                        </button>
                                    </div>

                                    {/* State Selector */}
                                    <select value={p.estado} onChange={e => handleStatusChange(p.id, e.target.value)}
                                        style={{
                                            height: '32px', padding: '0 8px', borderRadius: '8px',
                                            border: '1px solid #e2e8f0', fontSize: '0.72rem',
                                            color: '#475569', cursor: 'pointer', background: '#fff', flexShrink: 0,
                                        }}>
                                        {PIPELINE_STATES.map(s => (
                                            <option key={s.key} value={s.key}>{s.label}</option>
                                        ))}
                                    </select>

                                    <button onClick={() => setConfirmDelete(p.id)} title="Eliminar"
                                        style={{
                                            width: '28px', height: '28px', borderRadius: '6px',
                                            border: 'none', background: 'transparent', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1',
                                            transition: 'color .15s',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                        onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Notes Modal */}
            {editingNotes && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                    onClick={() => setEditingNotes(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '400px', boxShadow: '0 25px 50px rgba(0,0,0,.15)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <StickyNote size={20} color="#f59e0b" />
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Notas del turno</h3>
                        </div>
                        <div style={{ padding: '20px 24px' }}>
                            <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
                                placeholder="Agregar notas sobre este turno..."
                                style={{ width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setEditingNotes(null)} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', color: '#64748b' }}>Cancelar</button>
                            <button onClick={handleSaveNotes} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', cursor: 'pointer', fontSize: '0.82rem', color: '#fff', fontWeight: 700 }}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                    onClick={() => setConfirmDelete(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', width: '360px', padding: '28px', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,.15)' }}>
                        <AlertTriangle size={40} color="#ef4444" style={{ marginBottom: '12px' }} />
                        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>¿Eliminar turno?</h3>
                        <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '20px' }}>Esta acción no se puede deshacer.</p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', color: '#64748b' }}>Cancelar</button>
                            <button onClick={() => handleDelete(confirmDelete)} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: '#ef4444', cursor: 'pointer', fontSize: '0.82rem', color: '#fff', fontWeight: 700 }}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Window */}
            {chatOpen && chatPatient && chatPatient.telefono1 && (
                <ChatWindow
                    open={chatOpen}
                    onClose={() => setChatOpen(false)}
                    patientName={chatPatient.paciente}
                    patientPhone={normalizeArgentinePhone(chatPatient.telefono1)}
                    patientContext={{ dni: chatPatient.dni, obraSocial: chatPatient.obra_social }}
                    addToast={addToast}
                    defaultLineLabel="Recepciones Chequeos"
                    autoShowTemplates
                />
            )}
        </div>
    );
}
