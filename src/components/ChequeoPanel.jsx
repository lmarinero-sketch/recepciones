import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, Filter, Users, Calendar, Phone, Send, ChevronDown, ChevronRight,
    MapPin, Building2, Stethoscope, Clock, FileText, AlertCircle, X, RefreshCw,
    MessageSquare, UserCheck, Activity, Heart, CheckCircle2, XCircle, Loader2,
    CalendarClock, ChevronLeft, ArrowLeft, ArrowRight
} from 'lucide-react';
import { fetchPacientesChequeo, updateAsistencia, fetchObrasSociales } from '../services/visitasService';
import { sendMetaTemplate, fetchMetaTemplates } from '../services/metaTemplateService';
import { normalizeArgentinePhone } from '../services/builderbotApi';
import { saveOutgoingMessage } from '../services/chatService';
import { upsertCheckup } from '../services/reminderService';
import ChatWindow from './ChatWindow';

// Calcula la fecha de hoy - 1 año en formato YYYY-MM-DD
function getOneYearAgoToday() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
}

function shiftDate(dateStr, amount, isMensual) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isMensual) {
        d.setMonth(d.getMonth() + (amount > 0 ? 1 : -1));
    } else {
        d.setDate(d.getDate() + amount);
    }
    return d.toISOString().split('T')[0];
}

export default function ChequeoPanel({ addToast }) {
    const [pacientes, setPacientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadProgress, setLoadProgress] = useState('');
    const [search, setSearch] = useState('');
    const [selectedPaciente, setSelectedPaciente] = useState(null);
    // Fecha objetivo: el día del chequeo hace 1 año
    const [targetDate, setTargetDate] = useState(() => getOneYearAgoToday());
    const [sendingTo, setSendingTo] = useState(null);
    const [customMessage, setCustomMessage] = useState('');
    const [showMsgModal, setShowMsgModal] = useState(false);
    const [confirmStep, setConfirmStep] = useState(false);
    const [msgTarget, setMsgTarget] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatPatient, setChatPatient] = useState(null);
    // Schedule checkup
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    // Bulk send
    const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
    const [selectedForBulk, setSelectedForBulk] = useState([]);
    const [bulkMode, setBulkMode] = useState(false);
    const [bulkSending, setBulkSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ sent: 0, failed: 0, total: 0 });
    const bulkAbortRef = useRef(false);

    // Meta Templates
    const [metaTemplates, setMetaTemplates] = useState([]);
    const [selectedMetaTemplate, setSelectedMetaTemplate] = useState(null);

    const [isMensual, setIsMensual] = useState(false);
    const [obraSocial, setObraSocial] = useState('');
    const [obrasSocialesList, setObrasSocialesList] = useState([]);

    // Combobox state
    const [osSearch, setOsSearch] = useState('');
    const [osDropdownOpen, setOsDropdownOpen] = useState(false);
    const osDropdownRef = useRef(null);
    const osInputRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (osDropdownRef.current && !osDropdownRef.current.contains(e.target)) {
                setOsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOsList = useMemo(() => {
        if (!osSearch) return obrasSocialesList;
        const s = osSearch.toLowerCase();
        return obrasSocialesList.filter(os => os.toLowerCase().includes(s));
    }, [obrasSocialesList, osSearch]);

    useEffect(() => {
        fetchObrasSociales().then(list => {
            // Filtrar solo las que empiezan con número
            const valid = list.filter(os => /^\d/.test(os));
            setObrasSocialesList(valid);
        }).catch(console.error);

        // Fetch meta templates for bulk messaging
        fetchMetaTemplates().then(setMetaTemplates).catch(console.error);
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadProgress('Buscando chequeos preventivos...');
        try {
            const data = await fetchPacientesChequeo({
                targetDate,
                isMensual,
                obraSocial
            }, (_pages, _rows, msg) => {
                setLoadProgress(msg || 'Cargando...');
            });
            setLoadProgress('');
            setPacientes(data);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando datos de chequeos', 'error');
        } finally {
            setLoading(false);
        }
    }, [targetDate, isMensual, obraSocial, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Filtro de búsqueda local
    const filtered = useMemo(() => {
        if (!search.trim()) return pacientes;
        const s = search.toLowerCase();
        return pacientes.filter(p =>
            (p.paciente && p.paciente.toLowerCase().includes(s)) ||
            (p.dni && p.dni.includes(s)) ||
            (p.telefono1 && p.telefono1.includes(s))
        );
    }, [pacientes, search]);

    // Pacientes con teléfono (para bulk)
    const pacientesConTel = useMemo(() => filtered.filter(p => p.telefono1), [filtered]);

    // Stats
    const stats = useMemo(() => {
        const totalPacientes = filtered.length;
        const totalVisitas = filtered.reduce((s, p) => s + p.total_visitas, 0);
        const conTelefono = pacientesConTel.length;
        const sinTelefono = totalPacientes - conTelefono;
        return { totalPacientes, totalVisitas, conTelefono, sinTelefono };
    }, [filtered, pacientesConTel]);

    // Enviar mensaje individual
    const handleSendReminder = useCallback((paciente) => {
        if (!paciente.telefono1) {
            addToast?.('Este paciente no tiene teléfono registrado', 'error');
            return;
        }
        setChatPatient(paciente);
        setChatOpen(true);
    }, [addToast]);

    // Marcar asistencia
    const handleUpdateAsistencia = async (visitId, newStatus) => {
        try {
            await updateAsistencia(visitId, newStatus);
            // Optimistic update
            const updateItem = (p) => ({
                ...p,
                visitas: p.visitas.map(v => v.id === visitId ? { ...v, asistencia: newStatus } : v)
            });
            setSelectedPaciente(prev => prev ? updateItem(prev) : null);
            setPacientes(prev => prev.map(p => {
                if (p.visitas.some(v => v.id === visitId)) {
                    return updateItem(p);
                }
                return p;
            }));
            addToast?.(`Asistencia ${newStatus ? 'marcada como ' + newStatus : 'borrada'}`, 'success');
        } catch (error) {
            addToast?.('Error al actualizar la asistencia', 'error');
        }
    };

    // Agendar Chequeo Confirmado — persistido en Supabase
    const handleSaveSchedule = useCallback(async () => {
        if (!selectedPaciente || !scheduleDate) return;
        
        try {
            await upsertCheckup({
                dni: selectedPaciente.dni,
                paciente: selectedPaciente.paciente,
                telefono1: selectedPaciente.telefono1,
                obra_social: selectedPaciente.obra_social,
                fecha_turno: scheduleDate,
                estado: 'pendiente',
            });
            addToast?.(`Turno confirmado guardado para el ${formatDate(scheduleDate)}`, 'success');
            setShowScheduleModal(false);
            setScheduleDate('');
        } catch (e) {
            console.error('Error saving schedule:', e);
            addToast?.('Error al guardar el turno', 'error');
        }
    }, [selectedPaciente, scheduleDate, addToast]);

    // Abrir modal masivo
    const handleBulkStart = useCallback(() => {
        if (!pacientesConTel.length) {
            addToast?.('No hay pacientes con teléfono para enviar', 'error');
            return;
        }
        if (!bulkSelectionMode) {
            setBulkSelectionMode(true);
            setSelectedForBulk([]); // Empiezan sin seleccionar
        } else {
            if (selectedForBulk.length === 0) {
                addToast?.('Selecciona al menos un paciente para enviar', 'error');
                return;
            }
            setBulkMode(true);
            setMsgTarget(null);
            
            // Auto-select template para chequeos (evitar "captar_clientes" que es de quirófano)
            const defaultTpl = metaTemplates.find(t => {
                const name = (t.name || t.templateName || '').toLowerCase();
                return name === 'recordatorio_dia_semana_san_luis' || name === 'marketing' || name.includes('chequeo');
            });
            setSelectedMetaTemplate(defaultTpl || null);

            setShowMsgModal(true);
            setConfirmStep(false);
        }
    }, [pacientesConTel, bulkSelectionMode, selectedForBulk, addToast, metaTemplates]);

    const confirmSend = useCallback(async () => {
        if (!msgTarget?.telefono1 || !customMessage.trim()) return;
        setSendingTo(msgTarget.dni);
        try {
            // Mensajería desconectada — no se envía realmente
            addToast?.(`📋 Mensaje preparado para ${msgTarget.paciente}. Conectar mensajería en Configuración para enviar.`, 'info');
            setShowMsgModal(false);
            setMsgTarget(null);
        } catch (e) {
            console.error(e);
            addToast?.('Error al preparar mensaje', 'error');
        } finally {
            setSendingTo(null);
        }
    }, [msgTarget, customMessage, addToast]);

    // Envío masivo con plantilla Meta seleccionada
    const confirmBulkSend = useCallback(async () => {
        if (!selectedMetaTemplate) return;
        
        const targets = selectedForBulk;
        setBulkSending(true);
        setBulkProgress({ sent: 0, failed: 0, total: targets.length });
        bulkAbortRef.current = false;

        const templateName = selectedMetaTemplate.name || selectedMetaTemplate.templateName;
        const languageCode = selectedMetaTemplate.language || 'es_AR';
        const templateMessage = selectedMetaTemplate.body || selectedMetaTemplate.text || selectedMetaTemplate.components?.find(c => c.type === 'BODY')?.text || `[Plantilla: ${templateName}]`;

        for (let i = 0; i < targets.length; i++) {
            if (bulkAbortRef.current) break;

            const p = targets[i];
            const nombre = p.paciente?.split(',')[0]?.trim() || 'Paciente';
            const normalizedPhone = normalizeArgentinePhone(p.telefono1);

            try {
                // Detectar si la plantilla tiene variables {{N}} en el body
                const bodyComponent = selectedMetaTemplate.components?.find(c => c.type === 'BODY');
                const bodyText = bodyComponent?.text || selectedMetaTemplate.body || selectedMetaTemplate.text || '';
                const hasBodyVariables = /\{\{\d+\}\}/.test(bodyText);

                // Solo enviar components si la plantilla tiene variables
                const components = hasBodyVariables ? [
                    {
                        type: 'BODY',
                        parameters: [
                            { type: 'text', text: nombre }
                        ]
                    }
                ] : [];

                // Enviar plantilla Meta seleccionada
                await sendMetaTemplate({
                    to: normalizedPhone,
                    templateName: templateName,
                    languageCode: languageCode,
                    components,
                });

                // Registrar el mensaje enviado en la base de datos
                await saveOutgoingMessage({
                    phone: normalizedPhone,
                    content: `📋 [Plantilla Meta] ${templateName}: ${templateMessage.replace(/\{\{1\}\}/g, nombre)}`,
                    mediaType: 'text',
                    lineId: 'line_recepciones',
                }).catch(err => console.warn('Error saving outgoing msg:', err));

                setBulkProgress(prev => ({ ...prev, sent: prev.sent + 1 }));
            } catch (e) {
                console.error(`Error enviando plantilla a ${p.paciente}:`, e);
                setBulkProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
            }

            // Esperar 15 segundos antes del siguiente (excepto el último)
            if (i < targets.length - 1 && !bulkAbortRef.current) {
                await new Promise(r => setTimeout(r, 15000));
            }
        }

        setBulkSending(false);
        setShowMsgModal(false);
        setConfirmStep(false);
        setBulkSelectionMode(false);
        const finalProgress = { ...bulkProgress };
        addToast?.(
            `✅ Envío masivo completado: ${targets.length - finalProgress.failed} enviados, ${finalProgress.failed} fallidos.`,
            finalProgress.failed > 0 ? 'warning' : 'success'
        );
    }, [selectedForBulk, selectedMetaTemplate, addToast, bulkProgress]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatDateLong = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    const formatDateMonth = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    };

    const formatPhone = (phone) => {
        if (!phone) return null;
        if (phone.length === 13 && phone.startsWith('549')) {
            return `+54 9 ${phone.slice(3, 6)} ${phone.slice(6, 9)}-${phone.slice(9)}`;
        }
        return phone;
    };

    // Año actual para mostrar
    const targetYear = targetDate ? new Date(targetDate + 'T00:00:00').getFullYear() : '';
    const reminderYear = targetYear + 1;

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                        <h2 style={{
                            fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0,
                            display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Heart size={20} color="#fff" />
                            </div>
                            Chequeos Preventivos
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px' }}>
                            Gestión de recordatorios y seguimiento de pacientes
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {bulkSelectionMode && (
                            <button
                                onClick={() => setBulkSelectionMode(false)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                    background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b', fontWeight: 600,
                                }}
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            onClick={handleBulkStart}
                            disabled={loading || !pacientesConTel.length || bulkSending}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                                background: (!pacientesConTel.length || (bulkSelectionMode && selectedForBulk.length === 0)) ? '#cbd5e1' : 'linear-gradient(135deg, #25D366, #128C7E)',
                                border: 'none', borderRadius: '8px',
                                cursor: (!pacientesConTel.length || (bulkSelectionMode && selectedForBulk.length === 0)) ? 'default' : 'pointer',
                                fontSize: '0.8rem', color: '#fff', fontWeight: 700,
                                transition: 'all .15s',
                                opacity: loading ? 0.5 : 1,
                                boxShadow: (!pacientesConTel.length || (bulkSelectionMode && selectedForBulk.length === 0)) ? 'none' : '0 2px 8px rgba(37,211,102,.25)',
                            }}
                        >
                            <Send size={14} /> 
                            {bulkSelectionMode 
                                ? `Continuar (${selectedForBulk.length})` 
                                : `Enviar a Todos`}
                        </button>
                        <button onClick={loadData} disabled={loading} style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                            background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                            cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600,
                            transition: 'all .15s',
                        }}>
                            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
                        </button>
                    </div>
                </div>

                {/* Date Navigator */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px',
                    padding: '12px 18px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #eff6ff, #f0f4ff)',
                    border: '1px solid #dbeafe',
                }}>
                    <CalendarClock size={20} color="#1d4ed8" />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
                            Pacientes con Chequeo Preventivo (CHQ) el {isMensual ? 'mes' : 'día'}:
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'capitalize' }}>
                            {isMensual ? formatDateMonth(targetDate) : formatDateLong(targetDate)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                            Recordatorio anual → deben volver en {reminderYear}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button onClick={() => { setTargetDate(d => shiftDate(d, -1, isMensual)); setSelectedPaciente(null); }} disabled={loading} style={{
                            width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #dbeafe',
                            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: '#3b82f6', transition: 'all .15s',
                        }}><ArrowLeft size={16} /></button>

                        <input type={isMensual ? "month" : "date"} value={isMensual ? targetDate.substring(0, 7) : targetDate}
                            onChange={e => { if (e.target.value) { setTargetDate(isMensual ? e.target.value + '-01' : e.target.value); setSelectedPaciente(null); } }}
                            style={{
                                padding: '6px 10px', borderRadius: '8px', border: '1px solid #dbeafe',
                                fontSize: '0.82rem', fontWeight: 600, color: '#1d4ed8', background: '#fff',
                                cursor: 'pointer',
                            }} />

                        <button onClick={() => { setTargetDate(d => shiftDate(d, 1, isMensual)); setSelectedPaciente(null); }} disabled={loading} style={{
                            width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #dbeafe',
                            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: '#3b82f6', transition: 'all .15s',
                        }}><ArrowRight size={16} /></button>

                        <button onClick={() => { 
                            const d = new Date(getOneYearAgoToday() + 'T00:00:00');
                            if (isMensual) d.setDate(1);
                            setTargetDate(d.toISOString().split('T')[0]);
                            setSelectedPaciente(null); 
                        }} style={{
                            padding: '6px 14px', borderRadius: '8px', border: 'none',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                            transition: 'all .2s', boxShadow: '0 2px 6px rgba(245,158,11,.3)',
                        }}>Hoy -1 Año</button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    {[
                        { label: 'Pacientes CHQ', value: stats.totalPacientes.toLocaleString(), icon: Users, color: '#3b82f6', bg: '#eff6ff' },
                        { label: 'Con Teléfono', value: stats.conTelefono.toLocaleString(), icon: UserCheck, color: '#10b981', bg: '#ecfdf5' },
                        { label: 'Sin Teléfono', value: stats.sinTelefono.toLocaleString(), icon: AlertCircle, color: '#f59e0b', bg: '#fffbeb' },
                    ].map((stat, i) => (
                        <div key={i} style={{
                            background: '#fff', borderRadius: '12px', padding: '16px',
                            border: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', gap: '12px',
                            transition: 'all .2s',
                        }}>
                            <div style={{
                                width: '42px', height: '42px', borderRadius: '10px',
                                background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <stat.icon size={20} color={stat.color} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>{stat.value}</div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>{stat.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filters Row */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    {/* Search bar */}
                    <div style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                        padding: '0 14px', height: '42px',
                    }}>
                        <Search size={16} color="#94a3b8" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, DNI o teléfono..."
                            style={{
                                flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem',
                                background: 'transparent', color: '#1e293b',
                            }}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                                color: '#94a3b8',
                            }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    
                    {/* Filtro Obra Social */}
                    <div ref={osDropdownRef} style={{ position: 'relative', minWidth: '250px', maxWidth: '350px' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', height: '42px', padding: '0 14px',
                            borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff',
                            cursor: 'text'
                        }} onClick={() => {
                            setOsDropdownOpen(true);
                            osInputRef.current?.focus();
                        }}>
                            <Building2 size={16} color="#94a3b8" style={{ marginRight: '8px', flexShrink: 0 }} />
                            <input 
                                ref={osInputRef}
                                type="text"
                                placeholder={obraSocial ? obraSocial : "Buscar Obra Social..."}
                                value={osDropdownOpen ? osSearch : (obraSocial || '')}
                                onChange={e => {
                                    setOsSearch(e.target.value);
                                    setOsDropdownOpen(true);
                                }}
                                onFocus={() => {
                                    setOsSearch(''); // clear search to show all when focused
                                    setOsDropdownOpen(true);
                                }}
                                style={{
                                    border: 'none', outline: 'none', width: '100%',
                                    fontSize: '0.85rem', color: '#1e293b', background: 'transparent'
                                }}
                            />
                            {obraSocial && !osDropdownOpen && (
                                <X size={14} color="#94a3b8" style={{ cursor: 'pointer', marginLeft: '8px', flexShrink: 0 }} onClick={(e) => {
                                    e.stopPropagation();
                                    setObraSocial('');
                                    setOsSearch('');
                                }} />
                            )}
                            <ChevronDown size={16} color="#94a3b8" style={{ marginLeft: '8px', cursor: 'pointer', flexShrink: 0 }} onClick={(e) => {
                                e.stopPropagation();
                                setOsDropdownOpen(!osDropdownOpen);
                                osInputRef.current?.focus();
                            }} />
                        </div>

                        {osDropdownOpen && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,.1)', zIndex: 50,
                                maxHeight: '250px', overflowY: 'auto'
                            }}>
                                <div 
                                    onClick={() => {
                                        setObraSocial('');
                                        setOsSearch('');
                                        setOsDropdownOpen(false);
                                    }}
                                    style={{
                                        padding: '10px 14px', fontSize: '0.85rem', color: '#64748b',
                                        cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                                        background: obraSocial === '' ? '#f8fafc' : '#fff'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = obraSocial === '' ? '#f8fafc' : '#fff'}
                                >
                                    Todas las Obras Sociales
                                </div>
                                {filteredOsList.length === 0 ? (
                                    <div style={{ padding: '10px 14px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>
                                        No se encontraron resultados
                                    </div>
                                ) : (
                                    filteredOsList.map(os => (
                                        <div 
                                            key={os}
                                            onClick={() => {
                                                setObraSocial(os);
                                                setOsSearch('');
                                                setOsDropdownOpen(false);
                                            }}
                                            style={{
                                                padding: '10px 14px', fontSize: '0.85rem', color: '#1e293b',
                                                cursor: 'pointer',
                                                background: obraSocial === os ? '#eff6ff' : '#fff',
                                                color: obraSocial === os ? '#1d4ed8' : '#1e293b',
                                                fontWeight: obraSocial === os ? 600 : 400
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = obraSocial === os ? '#eff6ff' : '#fff'}
                                        >
                                            {os}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Filtro Periodo */}
                    <select
                        value={isMensual ? 'mes' : 'dia'}
                        onChange={e => {
                            const mens = e.target.value === 'mes';
                            setIsMensual(mens);
                            if (mens) {
                                // Asegurar que la fecha empieza en el 1er día si cambiamos a mensual
                                const d = new Date(targetDate + 'T00:00:00');
                                d.setDate(1);
                                setTargetDate(d.toISOString().split('T')[0]);
                            }
                        }}
                        style={{
                            height: '42px', padding: '0 14px', borderRadius: '10px',
                            border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
                            fontSize: '0.85rem', color: '#1e293b', outline: 'none',
                        }}
                    >
                        <option value="dia">Día Exacto</option>
                        <option value="mes">Mes Entero</option>
                    </select>
                </div>
            </div>

            {/* Main content: split view */}
            <div style={{ flex: 1, display: 'flex', gap: '16px', overflow: 'hidden', minHeight: 0 }}>
                {/* Patient list */}
                <div style={{
                    width: selectedPaciente ? '45%' : '100%',
                    transition: 'width .3s ease',
                    display: 'flex', flexDirection: 'column',
                    background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                }}>
                    {/* List header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
                        background: '#fafbfc',
                    }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                            {filtered.length.toLocaleString()} pacientes encontrados
                        </span>
                        {bulkSelectionMode ? (
                            <button 
                                onClick={() => {
                                    if (selectedForBulk.length > 0) {
                                        setSelectedForBulk([]);
                                    } else {
                                        const expectedYear = parseInt(targetDate.substring(0, 4), 10) + 1;
                                        const validTargets = pacientesConTel.filter(p => {
                                            return !p.visitas?.some(v => 
                                                v.fecha?.startsWith(expectedYear.toString()) && 
                                                (v.tipo_visita || v.tipo_agenda || '').toUpperCase().includes('CHQ')
                                            );
                                        });
                                        setSelectedForBulk(validTargets);
                                    }
                                }}
                                style={{
                                    background: 'none', border: 'none', color: '#3b82f6', 
                                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                {selectedForBulk.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Pendientes'}
                            </button>
                        ) : (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                Ordenados por frecuencia de visitas
                            </span>
                        )}
                    </div>

                    {/* Scrollable list */}
                    <div style={{ flex: 1, overflow: 'auto' }}>
                        {loading ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: '200px', color: '#94a3b8',
                            }}>
                                <Loader2 size={28} className="spin" />
                                <span style={{ marginTop: '8px', fontSize: '0.85rem' }}>Cargando pacientes...</span>
                                {loadProgress && (
                                    <span style={{ marginTop: '4px', fontSize: '0.75rem', color: '#3b82f6' }}>{loadProgress}</span>
                                )}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', height: '200px', color: '#94a3b8',
                            }}>
                                <Users size={32} />
                                <span style={{ marginTop: '8px', fontSize: '0.85rem' }}>Sin resultados</span>
                            </div>
                        ) : (
                            filtered.map((p, idx) => {
                                const isSelected = selectedPaciente?.dni === p.dni && selectedPaciente?.paciente === p.paciente;
                                const isChecked = selectedForBulk.some(sel => sel.dni === p.dni);
                                const hasPhone = !!p.telefono1;
                                const expectedVisitYear = parseInt(targetDate.substring(0, 4), 10) + 1;
                                const hasVisitedThisYear = p.visitas?.some(v => 
                                    v.fecha?.startsWith(expectedVisitYear.toString()) && 
                                    (v.tipo_visita || v.tipo_agenda || '').toUpperCase().includes('CHQ')
                                );
                                
                                return (
                                    <div
                                        key={p.dni || p.paciente || idx}
                                        onClick={() => {
                                            if (bulkSelectionMode) {
                                                if (!hasPhone) return;
                                                setSelectedForBulk(prev => 
                                                    prev.some(sel => sel.dni === p.dni)
                                                        ? prev.filter(sel => sel.dni !== p.dni)
                                                        : [...prev, p]
                                                );
                                            } else {
                                                setSelectedPaciente(isSelected ? null : p);
                                            }
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '12px 16px', cursor: (bulkSelectionMode && !hasPhone) ? 'not-allowed' : 'pointer',
                                            borderBottom: '1px solid #f8fafc',
                                            background: (bulkSelectionMode && isChecked) ? '#ecfdf5' : isSelected && !bulkSelectionMode ? '#eff6ff' : 'transparent',
                                            borderLeft: (bulkSelectionMode && isChecked) ? '3px solid #10b981' : isSelected && !bulkSelectionMode ? '3px solid #3b82f6' : '3px solid transparent',
                                            transition: 'all .15s',
                                            opacity: (bulkSelectionMode && !hasPhone) ? 0.5 : 1,
                                        }}
                                        onMouseEnter={e => { if (!isSelected && !(bulkSelectionMode && isChecked)) e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { if (!isSelected && !(bulkSelectionMode && isChecked)) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {bulkSelectionMode && (
                                            <div style={{
                                                width: '20px', height: '20px', borderRadius: '6px',
                                                border: isChecked ? 'none' : '2px solid #cbd5e1',
                                                background: isChecked ? '#10b981' : '#fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0, transition: 'all 0.15s',
                                            }}>
                                                {isChecked && <CheckCircle2 size={14} color="#fff" />}
                                            </div>
                                        )}
                                        {/* Avatar */}
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '10px',
                                            background: p.telefono1
                                                ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
                                                : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.75rem', fontWeight: 800, color: '#fff',
                                            flexShrink: 0,
                                        }}>
                                            {(p.paciente || '??').split(',')[0]?.substring(0, 2).toUpperCase()}
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '0.82rem', fontWeight: 700, color: '#1e293b',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {p.paciente || 'Sin nombre'}
                                            </div>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px',
                                            }}>
                                                {p.dni && <span>DNI {p.dni}</span>}
                                                {p.obra_social && <span>• {p.obra_social}</span>}
                                            </div>
                                        </div>

                                        {/* Right side: visits + phone indicator */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                            {hasVisitedThisYear && (
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    padding: '3px 8px', borderRadius: '8px',
                                                    background: '#ecfdf5', border: '1px solid #10b981',
                                                    fontSize: '0.65rem', fontWeight: 700, color: '#059669',
                                                }} title={`Tiene un chequeo agendado o realizado en ${expectedVisitYear}`}>
                                                    <CheckCircle2 size={12} /> Vino en '{expectedVisitYear.toString().slice(-2)}
                                                </div>
                                            )}
                                            <div style={{
                                                padding: '3px 10px', borderRadius: '12px',
                                                background: p.total_visitas >= 5 ? '#fef3c7' : '#f1f5f9',
                                                fontSize: '0.72rem', fontWeight: 700,
                                                color: p.total_visitas >= 5 ? '#92400e' : '#64748b',
                                            }}>
                                                {p.total_visitas} {p.total_visitas === 1 ? 'visita' : 'visitas'}
                                            </div>
                                            {p.telefono1 ? (
                                                <Phone size={14} color="#10b981" />
                                            ) : (
                                                <Phone size={14} color="#d1d5db" />
                                            )}
                                            <ChevronRight size={14} color="#cbd5e1" />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Detail panel */}
                {selectedPaciente && (
                    <div className="animate-fade-in" style={{
                        width: '55%',
                        display: 'flex', flexDirection: 'column',
                        background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                    }}>
                        {/* Patient header */}
                        <div style={{
                            padding: '20px', borderBottom: '1px solid #f1f5f9',
                            background: 'linear-gradient(135deg, #f8fafc, #eff6ff)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', gap: '14px' }}>
                                    <div style={{
                                        width: '52px', height: '52px', borderRadius: '14px',
                                        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1rem', fontWeight: 800, color: '#fff',
                                    }}>
                                        {(selectedPaciente.paciente || '??').split(',')[0]?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>
                                            {selectedPaciente.paciente || 'Paciente'}
                                        </h3>
                                        <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
                                            {selectedPaciente.dni && (
                                                <span style={tagStyle}>
                                                    <FileText size={12} /> DNI: {selectedPaciente.dni}
                                                </span>
                                            )}
                                            {selectedPaciente.obra_social && (
                                                <span style={tagStyle}>
                                                    <Building2 size={12} /> {selectedPaciente.obra_social}
                                                </span>
                                            )}
                                            {selectedPaciente.departamento && (
                                                <span style={tagStyle}>
                                                    <MapPin size={12} /> {selectedPaciente.departamento}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedPaciente(null)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#94a3b8', padding: '4px',
                                }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Phones + Send button */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                marginTop: '14px', flexWrap: 'wrap',
                            }}>
                                {selectedPaciente.telefono1 ? (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 14px', borderRadius: '8px',
                                        background: '#ecfdf5', border: '1px solid #a7f3d0',
                                        fontSize: '0.82rem', fontWeight: 600, color: '#065f46',
                                    }}>
                                        <Phone size={14} />
                                        {formatPhone(selectedPaciente.telefono1)}
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 14px', borderRadius: '8px',
                                        background: '#fef2f2', border: '1px solid #fecaca',
                                        fontSize: '0.82rem', fontWeight: 600, color: '#991b1b',
                                    }}>
                                        <XCircle size={14} />
                                        Sin teléfono registrado
                                    </div>
                                )}
                                {selectedPaciente.telefono2 && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 14px', borderRadius: '8px',
                                        background: '#f0fdf4', border: '1px solid #bbf7d0',
                                        fontSize: '0.8rem', color: '#166534',
                                    }}>
                                        <Phone size={13} />
                                        {formatPhone(selectedPaciente.telefono2)}
                                    </div>
                                )}
                                <button
                                    onClick={() => handleSendReminder(selectedPaciente)}
                                    disabled={!selectedPaciente.telefono1 || sendingTo === selectedPaciente.dni}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 18px', borderRadius: '8px',
                                        background: selectedPaciente.telefono1
                                            ? 'linear-gradient(135deg, #25D366, #128C7E)'
                                            : '#e2e8f0',
                                        border: 'none', cursor: selectedPaciente.telefono1 ? 'pointer' : 'not-allowed',
                                        fontSize: '0.82rem', fontWeight: 700,
                                        color: selectedPaciente.telefono1 ? '#fff' : '#94a3b8',
                                        transition: 'all .2s', boxShadow: selectedPaciente.telefono1 ? '0 2px 8px rgba(37,211,102,.3)' : 'none',
                                        marginLeft: 'auto',
                                    }}
                                >
                                    {sendingTo === selectedPaciente.dni ? (
                                        <><Loader2 size={15} className="spin" /> Enviando...</>
                                    ) : (
                                        <><MessageSquare size={15} /> Enviar Recordatorio</>
                                    )}
                                </button>
                                <button
                                    onClick={() => { setScheduleDate(''); setShowScheduleModal(true); }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 18px', borderRadius: '8px',
                                        background: '#fff', border: '1px solid #e2e8f0',
                                        cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                                        color: '#3b82f6', transition: 'all .2s',
                                    }}
                                >
                                    <CalendarClock size={15} /> Agendar Turno
                                </button>
                            </div>
                        </div>

                        {/* Visits timeline */}
                        <div style={{
                            padding: '16px 20px 8px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>
                                Historial de Visitas ({selectedPaciente.total_visitas})
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                Última: {formatDate(selectedPaciente.ultima_visita)}
                            </span>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
                            {selectedPaciente.visitas.map((v, i) => {
                                const isCHQ = (v.tipo_visita || '').toUpperCase().includes('CHQ');
                                return (
                                <div key={v.id || i} style={{
                                    display: 'flex', gap: '12px', marginBottom: '8px',
                                    padding: '10px 14px', borderRadius: '10px',
                                    background: isCHQ ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#fafbfc',
                                    border: isCHQ ? '1px solid #1d4ed8' : '1px solid #f1f5f9',
                                    transition: 'all .15s',
                                    boxShadow: isCHQ ? '0 2px 8px rgba(29,78,216,.25)' : 'none',
                                }}
                                    onMouseEnter={e => {
                                        if (!isCHQ) { e.currentTarget.style.background = '#f0f4ff'; e.currentTarget.style.borderColor = '#dbeafe'; }
                                    }}
                                    onMouseLeave={e => {
                                        if (!isCHQ) { e.currentTarget.style.background = '#fafbfc'; e.currentTarget.style.borderColor = '#f1f5f9'; }
                                    }}
                                >
                                    {/* Date badge */}
                                    <div style={{
                                        minWidth: '56px', textAlign: 'center', flexShrink: 0,
                                        padding: '6px 0',
                                    }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isCHQ ? '#fff' : '#1d4ed8' }}>
                                            {v.fecha ? new Date(v.fecha + 'T00:00:00').getDate() : '-'}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: isCHQ ? 'rgba(255,255,255,.75)' : '#64748b', textTransform: 'uppercase' }}>
                                            {v.fecha ? new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) : ''}
                                        </div>
                                    </div>

                                    {/* Divider line */}
                                    <div style={{ width: '2px', background: isCHQ ? 'rgba(255,255,255,.3)' : '#e2e8f0', borderRadius: '2px', flexShrink: 0 }} />

                                    {/* Visit info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.8rem', fontWeight: 700, color: isCHQ ? '#fff' : '#1e293b',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {v.tipo_visita || v.tipo_agenda || 'Consulta'}
                                        </div>
                                        <div style={{
                                            display: 'flex', gap: '10px', marginTop: '4px',
                                            fontSize: '0.72rem', color: isCHQ ? 'rgba(255,255,255,.8)' : '#64748b', flexWrap: 'wrap',
                                        }}>
                                            {v.hora && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Clock size={11} /> {v.hora}
                                                </span>
                                            )}
                                            {v.medico && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Stethoscope size={11} /> {v.medico}
                                                </span>
                                            )}
                                            {v.especialidad && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Activity size={11} /> {v.especialidad}
                                                </span>
                                            )}
                                            {v.centro && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Building2 size={11} /> {v.centro}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Asistencia buttons */}
                                    <div style={{ flexShrink: 0, alignSelf: 'center', display: 'flex', gap: '6px' }}>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleUpdateAsistencia(v.id, v.asistencia === 'Presente' ? null : 'Presente'); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                                background: v.asistencia === 'Presente' ? '#10b981' : (isCHQ ? 'rgba(255,255,255,.15)' : '#e2e8f0'),
                                                color: v.asistencia === 'Presente' ? '#fff' : (isCHQ ? 'rgba(255,255,255,.7)' : '#64748b'),
                                                fontSize: '0.7rem', fontWeight: 600, transition: 'all .15s'
                                            }}
                                            title="Vino al turno"
                                        >
                                            <CheckCircle2 size={12} /> Vino
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleUpdateAsistencia(v.id, v.asistencia === 'Ausente' ? null : 'Ausente'); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                                background: v.asistencia === 'Ausente' ? '#ef4444' : (isCHQ ? 'rgba(255,255,255,.15)' : '#e2e8f0'),
                                                color: v.asistencia === 'Ausente' ? '#fff' : (isCHQ ? 'rgba(255,255,255,.7)' : '#64748b'),
                                                fontSize: '0.7rem', fontWeight: 600, transition: 'all .15s'
                                            }}
                                            title="No vino al turno"
                                        >
                                            <XCircle size={12} /> No vino
                                        </button>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Send Message Modal — Individual + Masivo */}
            {showMsgModal && (msgTarget || bulkMode) && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(4px)',
                }} onClick={() => { if (!bulkSending) { setShowMsgModal(false); setConfirmStep(false); setBulkMode(false); } }}>
                    <div className="animate-fade-in" onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: '16px', width: '560px',
                        maxHeight: '85vh', overflow: 'auto',
                        boxShadow: '0 25px 50px rgba(0,0,0,.15)',
                    }}>
                        {/* Modal header */}
                        <div style={{
                            padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', gap: '12px',
                        }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: confirmStep
                                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                    : 'linear-gradient(135deg, #25D366, #128C7E)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {confirmStep
                                    ? <AlertCircle size={20} color="#fff" />
                                    : <MessageSquare size={20} color="#fff" />
                                }
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                    {bulkSending ? 'Enviando mensajes...' : confirmStep ? 'Confirmar Envío' : bulkMode ? 'Envío Masivo de Recordatorios' : 'Enviar Recordatorio'}
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                                    {bulkMode
                                        ? `${selectedForBulk.length} pacientes con teléfono`
                                        : `A: ${msgTarget?.paciente} • ${formatPhone(msgTarget?.telefono1)}`
                                    }
                                </p>
                            </div>
                            {!bulkSending && (
                                <button onClick={() => { setShowMsgModal(false); setConfirmStep(false); setBulkMode(false); }} style={{
                                    background: 'none', border: 'none',
                                    cursor: 'pointer', color: '#94a3b8', padding: '4px',
                                }}>
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        {bulkSending ? (
                            /* PANTALLA DE PROGRESO MASIVO */
                            <div style={{ padding: '30px 24px' }}>
                                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                                    <Loader2 size={36} className="spin" color="#25D366" style={{ marginBottom: '12px' }} />
                                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                        Enviando mensaje {bulkProgress.sent + bulkProgress.failed + 1} de {bulkProgress.total}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                                        Intervalo de 15 segundos entre cada envío para evitar bloqueos
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div style={{
                                    width: '100%', height: '8px', borderRadius: '4px',
                                    background: '#f1f5f9', overflow: 'hidden', marginBottom: '16px',
                                }}>
                                    <div style={{
                                        height: '100%', borderRadius: '4px',
                                        background: 'linear-gradient(90deg, #25D366, #128C7E)',
                                        width: `${((bulkProgress.sent + bulkProgress.failed) / bulkProgress.total * 100)}%`,
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '16px' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>{bulkProgress.sent}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Enviados</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{bulkProgress.failed}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Fallidos</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#94a3b8' }}>{bulkProgress.total - bulkProgress.sent - bulkProgress.failed}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Pendientes</div>
                                    </div>
                                </div>

                                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#94a3b8' }}>
                                    ⏱ Tiempo restante estimado: ~{Math.ceil((bulkProgress.total - bulkProgress.sent - bulkProgress.failed) * 15 / 60)} min
                                </p>

                                {/* Warning: don't close */}
                                <div style={{
                                    margin: '16px 0', padding: '12px 16px', borderRadius: '10px',
                                    background: '#FFFBEB', border: '1px solid #FDE68A',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                }}>
                                    <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0 }} />
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#92400E', lineHeight: 1.4 }}>
                                        <strong>No cierres esta ventana ni navegues a otra sección.</strong> Si lo hacés, el envío se detendrá y los mensajes pendientes no se enviarán.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                                    <button onClick={() => { bulkAbortRef.current = true; }} style={{
                                        padding: '8px 24px', borderRadius: '8px', border: '1px solid #fecaca',
                                        background: '#fef2f2', cursor: 'pointer', fontSize: '0.82rem',
                                        color: '#ef4444', fontWeight: 700,
                                    }}>
                                        ⏹ Detener envío
                                    </button>
                                </div>
                            </div>
                        ) : !confirmStep ? (
                            <>
                                {/* PASO 1: Elegir plantilla Meta */}
                                <div style={{ padding: '20px 24px' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        marginBottom: '16px', background: '#eff6ff',
                                        padding: '12px 16px', borderRadius: '10px', border: '1px solid #bfdbfe'
                                    }}>
                                        <AlertCircle size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.4 }}>
                                            Estás iniciando conversaciones fuera de la ventana de 24 horas. 
                                            <strong> La única forma de comunicarte es enviando una plantilla oficial aprobada por Meta.</strong>
                                        </p>
                                    </div>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '8px', display: 'block' }}>
                                        Selecciona la plantilla oficial de Meta
                                    </label>
                                    
                                    <select
                                        value={selectedMetaTemplate ? (selectedMetaTemplate.name || selectedMetaTemplate.templateName) : ''}
                                        onChange={e => {
                                            const t = metaTemplates.find(tpl => (tpl.name || tpl.templateName) === e.target.value);
                                            setSelectedMetaTemplate(t || null);
                                        }}
                                        style={{
                                            width: '100%', padding: '12px', borderRadius: '10px',
                                            border: '1px solid #e2e8f0', fontSize: '0.85rem',
                                            outline: 'none', background: '#fff', cursor: 'pointer',
                                            marginBottom: '16px', fontWeight: 600, color: '#1e293b'
                                        }}
                                    >
                                        <option value="" disabled>-- Selecciona una plantilla --</option>
                                        {metaTemplates.map(t => (
                                            <option key={t.id || t.name || t.templateName} value={t.name || t.templateName}>
                                                {t.name || t.templateName}
                                            </option>
                                        ))}
                                    </select>

                                    {selectedMetaTemplate && (
                                        <div style={{
                                            background: '#f8fafc', padding: '16px', borderRadius: '10px',
                                            border: '1px dashed #cbd5e1'
                                        }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                                                Contenido del mensaje
                                            </div>
                                            <p style={{
                                                fontSize: '0.85rem', color: '#334155', margin: 0,
                                                lineHeight: 1.5, whiteSpace: 'pre-wrap', fontStyle: 'italic'
                                            }}>
                                                {selectedMetaTemplate.body || selectedMetaTemplate.text || selectedMetaTemplate.components?.find(c => c.type === 'BODY')?.text || '[Sin contenido]'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <div style={{
                                    padding: '16px 24px', borderTop: '1px solid #f1f5f9',
                                    display: 'flex', justifyContent: 'flex-end', gap: '10px',
                                }}>
                                    <button onClick={() => { setShowMsgModal(false); setConfirmStep(false); setBulkMode(false); }} style={{
                                        padding: '8px 20px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                        background: '#fff', cursor: 'pointer', fontSize: '0.82rem',
                                        color: '#64748b', fontWeight: 600,
                                    }}>
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => setConfirmStep(true)}
                                        disabled={!selectedMetaTemplate}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 24px', borderRadius: '8px', border: 'none',
                                            background: 'linear-gradient(135deg, #25D366, #128C7E)',
                                            cursor: 'pointer', fontSize: '0.82rem',
                                            color: '#fff', fontWeight: 700,
                                            opacity: !selectedMetaTemplate ? 0.6 : 1,
                                            boxShadow: '0 2px 8px rgba(37,211,102,.3)',
                                        }}
                                    >
                                        <Send size={15} /> Continuar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* PASO 2: Confirmación de costo */}
                                <div style={{ padding: '20px 24px' }}>
                                    {/* Warning box */}
                                    <div style={{
                                        background: bulkMode ? '#fef2f2' : '#fffbeb',
                                        border: `1px solid ${bulkMode ? '#fecaca' : '#fde68a'}`,
                                        borderRadius: '12px', padding: '16px 18px',
                                        marginBottom: '16px',
                                    }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            marginBottom: '10px',
                                        }}>
                                            <AlertCircle size={18} color={bulkMode ? '#dc2626' : '#d97706'} />
                                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: bulkMode ? '#991b1b' : '#92400e' }}>
                                                {bulkMode ? '⚠️ Aviso de costo masivo por plantillas' : 'Aviso de costo por plantilla'}
                                            </span>
                                        </div>
                                        <p style={{
                                            fontSize: '0.82rem', color: bulkMode ? '#7f1d1d' : '#78350f', lineHeight: 1.6,
                                            margin: 0,
                                        }}>
                                            {bulkMode ? (
                                                <>Se enviarán <strong>{selectedForBulk.length} plantillas "{selectedMetaTemplate?.name || selectedMetaTemplate?.templateName}" de Meta (WhatsApp Business API)</strong>. Cada plantilla tiene un <strong>costo asociado</strong> que se cobra por conversación iniciada. El costo total será de <strong>{selectedForBulk.length} plantillas × costo unitario</strong>.</>
                                            ) : (
                                                <>Para iniciar esta conversación se enviará una <strong>plantilla de mensaje de Meta (WhatsApp Business API)</strong>. Cada plantilla enviada tiene un <strong>costo asociado</strong> que se cobra por conversación iniciada.</>
                                            )}
                                        </p>
                                    </div>

                                    {/* Resumen de envío */}
                                    <div style={{
                                        background: '#f8fafc', borderRadius: '10px',
                                        padding: '14px 16px', border: '1px solid #e2e8f0',
                                    }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                                            Resumen del envío
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {bulkMode ? (
                                                <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                        <span style={{ color: '#64748b' }}>Destinatarios</span>
                                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedForBulk.length} pacientes</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                        <span style={{ color: '#64748b' }}>Intervalo entre envíos</span>
                                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>15 segundos</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                        <span style={{ color: '#64748b' }}>Tiempo estimado total</span>
                                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>~{Math.ceil(selectedForBulk.length * 15 / 60)} minutos</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                        <span style={{ color: '#64748b' }}>Destinatario</span>
                                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{msgTarget?.paciente?.split(',')[0]}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                        <span style={{ color: '#64748b' }}>Teléfono</span>
                                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatPhone(msgTarget?.telefono1)}</span>
                                                    </div>
                                                </>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                <span style={{ color: '#64748b' }}>Tipo</span>
                                                <span style={{
                                                    fontWeight: 600, color: '#d97706',
                                                    background: '#fef3c7', padding: '1px 8px', borderRadius: '6px',
                                                    fontSize: '0.75rem',
                                                }}>Plantilla Meta (costo por envío)</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                                                <span style={{ color: '#64748b' }}>Total de plantillas</span>
                                                <span style={{ fontWeight: 700, color: bulkMode ? '#dc2626' : '#1e293b', fontSize: '0.88rem' }}>
                                                    {bulkMode ? selectedForBulk.length : 1}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <p style={{
                                        fontSize: '0.85rem', color: '#475569', marginTop: '16px',
                                        textAlign: 'center', fontWeight: 700,
                                    }}>
                                        {bulkMode
                                            ? `¿Estás seguro de enviar ${selectedForBulk.length} mensajes con costo?`
                                            : '¿Estás seguro de enviar este mensaje?'
                                        }
                                    </p>
                                </div>

                                <div style={{
                                    padding: '16px 24px', borderTop: '1px solid #f1f5f9',
                                    display: 'flex', justifyContent: 'flex-end', gap: '10px',
                                }}>
                                    <button onClick={() => setConfirmStep(false)} style={{
                                        padding: '8px 20px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                        background: '#fff', cursor: 'pointer', fontSize: '0.82rem',
                                        color: '#64748b', fontWeight: 600,
                                    }}>
                                        ← Volver
                                    </button>
                                    <button onClick={() => { setShowMsgModal(false); setConfirmStep(false); setBulkMode(false); }} style={{
                                        padding: '8px 20px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                        background: '#fff', cursor: 'pointer', fontSize: '0.82rem',
                                        color: '#ef4444', fontWeight: 600,
                                    }}>
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (bulkMode) {
                                                confirmBulkSend();
                                            } else {
                                                confirmSend();
                                                setConfirmStep(false);
                                            }
                                        }}
                                        disabled={sendingTo}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 24px', borderRadius: '8px', border: 'none',
                                            background: 'linear-gradient(135deg, #25D366, #128C7E)',
                                            cursor: 'pointer', fontSize: '0.82rem',
                                            color: '#fff', fontWeight: 700,
                                            opacity: sendingTo ? 0.6 : 1,
                                            boxShadow: '0 2px 8px rgba(37,211,102,.3)',
                                        }}
                                    >
                                        {sendingTo ? (
                                            <><Loader2 size={15} className="spin" /> Enviando...</>
                                        ) : (
                                            <><Send size={15} /> {bulkMode ? `Sí, enviar ${selectedForBulk.length} plantillas` : 'Sí, enviar plantilla'}</>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Schedule Checkup Modal */}
            {showScheduleModal && selectedPaciente && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(4px)',
                }} onClick={() => setShowScheduleModal(false)}>
                    <div className="animate-fade-in" onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: '16px', width: '400px',
                        boxShadow: '0 25px 50px rgba(0,0,0,.15)',
                    }}>
                        <div style={{
                            padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', gap: '12px',
                        }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <CalendarClock size={20} color="#fff" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                                    Confirmar Turno
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                                    {selectedPaciente.paciente}
                                </p>
                            </div>
                        </div>

                        <div style={{ padding: '20px 24px' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '8px', display: 'block' }}>
                                Fecha del Turno Confirmado
                            </label>
                            <input 
                                type="date" 
                                value={scheduleDate}
                                onChange={(e) => setScheduleDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                style={{
                                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                                    border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none',
                                    color: '#1e293b'
                                }}
                            />
                            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '10px', lineHeight: 1.5 }}>
                                Este paciente aparecerá en el panel de <strong>Recordatorios</strong> para enviar notificaciones cuando se acerque la fecha de este turno.
                            </p>
                        </div>

                        <div style={{
                            padding: '16px 24px', borderTop: '1px solid #f1f5f9',
                            display: 'flex', justifyContent: 'flex-end', gap: '10px',
                        }}>
                            <button onClick={() => setShowScheduleModal(false)} style={{
                                padding: '8px 20px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                background: '#fff', cursor: 'pointer', fontSize: '0.82rem',
                                color: '#64748b', fontWeight: 600,
                            }}>
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveSchedule}
                                disabled={!scheduleDate}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 24px', borderRadius: '8px', border: 'none',
                                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                                    cursor: 'pointer', fontSize: '0.82rem',
                                    color: '#fff', fontWeight: 700,
                                    opacity: !scheduleDate ? 0.6 : 1,
                                }}
                            >
                                Guardar Turno
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {chatOpen && chatPatient && chatPatient.telefono1 && (
                <ChatWindow
                    open={chatOpen}
                    onClose={() => setChatOpen(false)}
                    patientName={chatPatient.paciente}
                    patientPhone={normalizeArgentinePhone(chatPatient.telefono1)}
                    patientContext={{
                        dni: chatPatient.dni,
                        idPaciente: chatPatient.id,
                        obraSocial: chatPatient.obra_social,
                    }}
                    addToast={addToast}
                    defaultLineLabel="Recepciones Chequeos"
                    autoShowTemplates
                />
            )}
        </div>
    );
}

const tagStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '2px 8px', borderRadius: '6px',
    background: '#f1f5f9', fontSize: '0.72rem', color: '#475569', fontWeight: 500,
};
