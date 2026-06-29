import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, Users, Calendar, Phone, Send, X, RefreshCw,
    MessageSquare, UserCheck, AlertCircle, Loader2,
    CheckCircle2, ClipboardCheck, Building2, ChevronDown,
    Star, Clock, Mail, MailCheck
} from 'lucide-react';
import { fetchPacientesPresentes, fetchRecordatoriosObrasSociales } from '../services/recordatoriosService';
import { fetchEncuestasPreventivos } from '../services/visitasService';
import { sendMetaTemplate, fetchMetaTemplates } from '../services/metaTemplateService';
import { normalizeArgentinePhone } from '../services/builderbotApi';
import { saveOutgoingMessage } from '../services/chatService';
import ChatWindow from './ChatWindow';

// We will use DB instead of localStorage for surveys

// Generate month options from April 2026 to current month
function getMonthOptions() {
    const months = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    // Start from April 2026 (month index 3)
    const startYear = 2026;
    const startMonth = 3; // April

    let y = startYear;
    let m = startMonth;
    while (y < currentYear || (y === currentYear && m <= currentMonth)) {
        const monthName = new Date(y, m, 1).toLocaleDateString('es-AR', { month: 'long' });
        const shortYear = String(y).slice(2);
        const label = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${shortYear}`;
        const desde = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        // Last day of month
        const lastDay = new Date(y, m + 1, 0).getDate();
        const hasta = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        months.push({ label, desde, hasta, key: `${y}-${m}` });
        m++;
        if (m > 11) { m = 0; y++; }
    }
    return months;
}

const MONTH_OPTIONS = getMonthOptions();

export default function EncuestaCalidadPanel({ addToast }) {
    const [pacientes, setPacientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadProgress, setLoadProgress] = useState('');
    const [search, setSearch] = useState('');

    // Month selector
    const [selectedMonth, setSelectedMonth] = useState(() => MONTH_OPTIONS.length > 0 ? MONTH_OPTIONS[MONTH_OPTIONS.length - 1].key : '');

    const currentMonthOpt = useMemo(() => MONTH_OPTIONS.find(m => m.key === selectedMonth), [selectedMonth]);
    const fechaDesde = currentMonthOpt?.desde || '';
    const fechaHasta = currentMonthOpt?.hasta || '';

    // Obra Social filter
    const [obraSocial, setObraSocial] = useState('');
    const [obrasSocialesList, setObrasSocialesList] = useState([]);
    const [osSearch, setOsSearch] = useState('');
    const [osDropdownOpen, setOsDropdownOpen] = useState(false);
    const osDropdownRef = useRef(null);
    const osInputRef = useRef(null);

    // Sending state
    const [sendingTo, setSendingTo] = useState(null);

    // Bulk
    const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
    const [selectedForBulk, setSelectedForBulk] = useState([]);
    const [bulkSending, setBulkSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ sent: 0, failed: 0, total: 0 });
    const bulkAbortRef = useRef(false);
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    // Chat
    const [chatOpen, setChatOpen] = useState(false);
    const [chatPatient, setChatPatient] = useState(null);

    // Meta template (cached)
    const [encuestaTemplate, setEncuestaTemplate] = useState(null);

    // Sent surveys tracker (from DB)
    const [sentPhones, setSentPhones] = useState(new Set());

    // Close OS dropdown on outside click
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

    // Load obras sociales + find encuesta template
    useEffect(() => {
        fetchRecordatoriosObrasSociales().then(list => {
            setObrasSocialesList(list);
        }).catch(console.error);

        fetchMetaTemplates().then(templates => {
            const encuesta = templates.find(t =>
                (t.name || t.templateName) === 'encuesta_de_satisfaccion'
            );
            setEncuestaTemplate(encuesta || null);
            if (!encuesta) {
                console.warn('⚠️ Plantilla "encuesta_de_satisfaccion" no encontrada en Meta Templates');
            }
        }).catch(console.error);
    }, []);

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadProgress('Buscando pacientes y encuestas...');
        try {
            const [data, encuestasDB] = await Promise.all([
                fetchPacientesPresentes({
                    fechaDesde,
                    fechaHasta,
                    obraSocial,
                    tipoAgenda: 'CHEQUEO',
                }, (_pages, _rows, msg) => {
                    setLoadProgress(msg || 'Cargando...');
                }),
                fetchEncuestasPreventivos()
            ]);
            setLoadProgress('');
            setPacientes(data);
            const sentPhonesSet = new Set(encuestasDB.map(e => e.telefono));
            setSentPhones(sentPhonesSet);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando datos', 'error');
        } finally {
            setLoading(false);
        }
    }, [fechaDesde, fechaHasta, obraSocial, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // Search filter
    const filtered = useMemo(() => {
        if (!search.trim()) return pacientes;
        const s = search.toLowerCase();
        return pacientes.filter(p =>
            (p.paciente && p.paciente.toLowerCase().includes(s)) ||
            (p.dni && p.dni.includes(s)) ||
            (p.telefono1 && p.telefono1.includes(s))
        );
    }, [pacientes, search]);

    const pacientesConTel = useMemo(() => filtered.filter(p => p.telefono1), [filtered]);

    // Stats
    const stats = useMemo(() => {
        const total = filtered.length;
        const conTel = pacientesConTel.length;
        const sinTel = total - conTel;
        const enviados = filtered.filter(p => p.telefono1 && sentPhones.has(normalizeArgentinePhone(p.telefono1))).length;
        return { total, conTel, sinTel, enviados };
    }, [filtered, pacientesConTel, sentPhones]);

    // Send individual survey
    const handleSendEncuesta = useCallback(async (paciente) => {
        if (!paciente.telefono1) {
            addToast?.('Este paciente no tiene teléfono registrado', 'error');
            return;
        }
        if (!encuestaTemplate) {
            addToast?.('Plantilla "encuesta_de_satisfaccion" no encontrada. Verificar en Meta Business', 'error');
            return;
        }

        const phone = normalizeArgentinePhone(paciente.telefono1);
        if (sentPhones.has(phone)) {
            addToast?.('Ya se envió la encuesta a este paciente', 'warning');
            return;
        }

        setSendingTo(paciente.dni);
        try {
            const nombre = paciente.paciente?.split(',')[0]?.trim() || 'Paciente';
            const templateName = encuestaTemplate.name || encuestaTemplate.templateName;
            const lang = encuestaTemplate.language || 'es_AR';

            // Detect body variables
            const bodyComponent = encuestaTemplate.components?.find(c => c.type === 'BODY');
            const bodyText = bodyComponent?.text || encuestaTemplate.body || encuestaTemplate.text || '';
            const hasBodyVars = /\{\{\d+\}\}/.test(bodyText);

            const components = hasBodyVars ? [{
                type: 'BODY',
                parameters: [{ type: 'text', text: nombre }]
            }] : [];

            await sendMetaTemplate({
                to: phone,
                templateName,
                languageCode: lang,
                components,
            });

            await saveOutgoingMessage({
                phone,
                content: `📋 [Encuesta Calidad] ${templateName}: ${bodyText.replace(/\{\{1\}\}/g, nombre)}`,
                mediaType: 'text',
                lineId: 'line_recepciones',
            }).catch(err => console.warn('Error saving outgoing msg:', err));

            setSentPhones(prev => {
                const updated = new Set(prev);
                updated.add(phone);
                return updated;
            });
            addToast?.(`✅ Encuesta enviada a ${nombre}`, 'success');
        } catch (e) {
            console.error('Error enviando encuesta:', e);
            addToast?.(`Error enviando encuesta: ${e.message}`, 'error');
        } finally {
            setSendingTo(null);
        }
    }, [encuestaTemplate, addToast, sentPhones]);

    // Bulk send
    const handleBulkStart = useCallback(() => {
        if (!pacientesConTel.length) {
            addToast?.('No hay pacientes con teléfono para enviar', 'error');
            return;
        }
        if (!bulkSelectionMode) {
            setBulkSelectionMode(true);
            setSelectedForBulk([]);
        } else {
            if (selectedForBulk.length === 0) {
                addToast?.('Selecciona al menos un paciente', 'error');
                return;
            }
            setShowBulkConfirm(true);
        }
    }, [pacientesConTel, bulkSelectionMode, selectedForBulk, addToast]);

    const confirmBulkSend = useCallback(async () => {
        if (!encuestaTemplate || !selectedForBulk.length) return;

        setShowBulkConfirm(false);
        setBulkSending(true);
        setBulkProgress({ sent: 0, failed: 0, total: selectedForBulk.length });
        bulkAbortRef.current = false;

        const templateName = encuestaTemplate.name || encuestaTemplate.templateName;
        const lang = encuestaTemplate.language || 'es_AR';
        const bodyComponent = encuestaTemplate.components?.find(c => c.type === 'BODY');
        const bodyText = bodyComponent?.text || encuestaTemplate.body || encuestaTemplate.text || '';
        const hasBodyVars = /\{\{\d+\}\}/.test(bodyText);

        let sent = 0, failed = 0;

        for (let i = 0; i < selectedForBulk.length; i++) {
            if (bulkAbortRef.current) break;

            const p = selectedForBulk[i];
            const nombre = p.paciente?.split(',')[0]?.trim() || 'Paciente';
            const phone = normalizeArgentinePhone(p.telefono1);

            try {
                const components = hasBodyVars ? [{
                    type: 'BODY',
                    parameters: [{ type: 'text', text: nombre }]
                }] : [];

                await sendMetaTemplate({
                    to: phone,
                    templateName,
                    languageCode: lang,
                    components,
                });

                await saveOutgoingMessage({
                    phone,
                    content: `📋 [Encuesta Calidad] ${templateName}: ${bodyText.replace(/\{\{1\}\}/g, nombre)}`,
                    mediaType: 'text',
                    lineId: 'line_recepciones',
                }).catch(() => {});

                setSentPhones(prev => {
                    const updated = new Set(prev);
                    updated.add(phone);
                    return updated;
                });
                sent++;
                setBulkProgress(prev => ({ ...prev, sent: prev.sent + 1 }));
            } catch (e) {
                console.error(`Error enviando encuesta a ${p.paciente}:`, e);
                failed++;
                setBulkProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
            }

            // Wait 15s between messages (except last)
            if (i < selectedForBulk.length - 1 && !bulkAbortRef.current) {
                await new Promise(r => setTimeout(r, 15000));
            }
        }

        setBulkSending(false);
        setBulkSelectionMode(false);
        setSelectedForBulk([]);
        addToast?.(
            `✅ Envío completado: ${sent} enviados, ${failed} fallidos`,
            failed > 0 ? 'warning' : 'success'
        );
    }, [selectedForBulk, encuestaTemplate, addToast]);

    // Chat
    const handleOpenChat = useCallback((paciente) => {
        if (!paciente.telefono1) { addToast?.('Sin teléfono', 'error'); return; }
        setChatPatient(paciente);
        setChatOpen(true);
    }, [addToast]);

    // Helpers
    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatPhone = (phone) => {
        if (!phone) return null;
        if (phone.length === 13 && phone.startsWith('549')) {
            return `+54 9 ${phone.slice(3, 6)} ${phone.slice(6, 9)}-${phone.slice(9)}`;
        }
        return phone;
    };

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
                                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <ClipboardCheck size={20} color="#fff" />
                            </div>
                            Encuestas de Calidad
                            {!encuestaTemplate && (
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 600, padding: '3px 10px', borderRadius: '10px',
                                    background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca',
                                }}>
                                    ⚠️ Plantilla no encontrada
                                </span>
                            )}
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px' }}>
                            Envío de encuesta post-chequeo a pacientes con asistencia presente
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {bulkSelectionMode && (
                            <button
                                onClick={() => { setBulkSelectionMode(false); setSelectedForBulk([]); }}
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
                            disabled={loading || !pacientesConTel.length || bulkSending || !encuestaTemplate}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                                background: (!pacientesConTel.length || !encuestaTemplate || (bulkSelectionMode && selectedForBulk.length === 0))
                                    ? '#cbd5e1' : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                                border: 'none', borderRadius: '8px',
                                cursor: (!pacientesConTel.length || !encuestaTemplate || (bulkSelectionMode && selectedForBulk.length === 0))
                                    ? 'default' : 'pointer',
                                fontSize: '0.8rem', color: '#fff', fontWeight: 700,
                                transition: 'all .15s', opacity: loading ? 0.5 : 1,
                                boxShadow: (!pacientesConTel.length || !encuestaTemplate || (bulkSelectionMode && selectedForBulk.length === 0))
                                    ? 'none' : '0 2px 8px rgba(139,92,246,.25)',
                            }}
                        >
                            <Send size={14} />
                            {bulkSelectionMode
                                ? `Enviar Encuesta (${selectedForBulk.length})`
                                : 'Enviar a Todos'}
                        </button>
                        <button onClick={loadData} disabled={loading} style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                            background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                            cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600,
                        }}>
                            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    {[
                        { label: 'Con Asistencia', value: stats.total.toLocaleString(), icon: Users, color: '#8b5cf6', bg: '#f5f3ff' },
                        { label: 'Con Teléfono', value: stats.conTel.toLocaleString(), icon: UserCheck, color: '#10b981', bg: '#ecfdf5' },
                        { label: 'Sin Teléfono', value: stats.sinTel.toLocaleString(), icon: AlertCircle, color: '#f59e0b', bg: '#fffbeb' },
                        { label: 'Encuesta Enviada', value: stats.enviados.toLocaleString(), icon: MailCheck, color: '#3b82f6', bg: '#eff6ff' },
                    ].map((stat, i) => (
                        <div key={i} style={{
                            background: '#fff', borderRadius: '12px', padding: '16px',
                            border: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', gap: '12px',
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

                {/* Month Tabs */}
                <div style={{
                    display: 'flex', gap: '6px', marginBottom: '14px',
                    background: '#f1f5f9', borderRadius: '10px', padding: '4px',
                    overflowX: 'auto',
                }}>
                    {MONTH_OPTIONS.map(month => {
                        const isActive = selectedMonth === month.key;
                        return (
                            <button
                                key={month.key}
                                onClick={() => setSelectedMonth(month.key)}
                                style={{
                                    padding: '8px 18px', border: 'none', borderRadius: '8px',
                                    fontSize: '0.82rem', fontWeight: isActive ? 700 : 500,
                                    cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
                                    background: isActive ? '#fff' : 'transparent',
                                    color: isActive ? '#6d28d9' : '#64748b',
                                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                                }}
                            >
                                📅 {month.label}
                            </button>
                        );
                    })}
                </div>

                {/* Filters Row */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>

                    {/* Search */}
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                        padding: '0 14px', height: '42px',
                    }}>
                        <Search size={16} color="#94a3b8" />
                        <input
                            type="text" value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, DNI o teléfono..."
                            style={{
                                flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem',
                                background: 'transparent', color: '#1e293b',
                            }}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#94a3b8',
                            }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Obra Social Combobox */}
                    <div ref={osDropdownRef} style={{ position: 'relative', minWidth: '220px' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', height: '42px', padding: '0 14px',
                            borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff',
                            cursor: 'text',
                        }} onClick={() => {
                            setOsDropdownOpen(true);
                            osInputRef.current?.focus();
                        }}>
                            <Building2 size={16} color="#94a3b8" style={{ marginRight: '8px', flexShrink: 0 }} />
                            <input
                                ref={osInputRef}
                                type="text"
                                placeholder={obraSocial || "Obra Social..."}
                                value={osDropdownOpen ? osSearch : (obraSocial || '')}
                                onChange={e => { setOsSearch(e.target.value); setOsDropdownOpen(true); }}
                                onFocus={() => { setOsSearch(''); setOsDropdownOpen(true); }}
                                style={{
                                    border: 'none', outline: 'none', width: '100%',
                                    fontSize: '0.85rem', color: '#1e293b', background: 'transparent',
                                }}
                            />
                            {obraSocial && !osDropdownOpen && (
                                <X size={14} color="#94a3b8" style={{ cursor: 'pointer', marginLeft: '8px', flexShrink: 0 }}
                                    onClick={(e) => { e.stopPropagation(); setObraSocial(''); setOsSearch(''); }} />
                            )}
                            <ChevronDown size={16} color="#94a3b8" style={{ marginLeft: '8px', cursor: 'pointer', flexShrink: 0 }}
                                onClick={(e) => { e.stopPropagation(); setOsDropdownOpen(!osDropdownOpen); osInputRef.current?.focus(); }} />
                        </div>
                        {osDropdownOpen && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,.1)', zIndex: 50,
                                maxHeight: '250px', overflowY: 'auto',
                            }}>
                                <div
                                    onClick={() => { setObraSocial(''); setOsSearch(''); setOsDropdownOpen(false); }}
                                    style={{
                                        padding: '10px 14px', fontSize: '0.85rem', color: '#64748b',
                                        cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                                        background: obraSocial === '' ? '#f8fafc' : '#fff',
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
                                            onClick={() => { setObraSocial(os); setOsSearch(''); setOsDropdownOpen(false); }}
                                            style={{
                                                padding: '10px 14px', fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                background: obraSocial === os ? '#f5f3ff' : '#fff',
                                                color: obraSocial === os ? '#6d28d9' : '#1e293b',
                                                fontWeight: obraSocial === os ? 600 : 400,
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = obraSocial === os ? '#f5f3ff' : '#fff'}
                                        >
                                            {os}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main content: Patient list */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
                overflow: 'hidden',
            }}>
                {/* List header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc',
                }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        {filtered.length.toLocaleString()} pacientes con asistencia presente
                    </span>
                    {bulkSelectionMode ? (
                        <button
                            onClick={() => {
                                if (selectedForBulk.length > 0) {
                                    setSelectedForBulk([]);
                                } else {
                                    // Select all with phone that haven't been sent
                                    const pending = pacientesConTel.filter(p => !sentPhones.has(normalizeArgentinePhone(p.telefono1)));
                                    setSelectedForBulk(pending);
                                }
                            }}
                            style={{
                                background: 'none', border: 'none', color: '#8b5cf6',
                                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            {selectedForBulk.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Pendientes'}
                        </button>
                    ) : (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            Ordenados por fecha de visita más reciente
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
                                <span style={{ marginTop: '4px', fontSize: '0.75rem', color: '#8b5cf6' }}>{loadProgress}</span>
                            )}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', height: '200px', color: '#94a3b8',
                        }}>
                            <Users size={32} />
                            <span style={{ marginTop: '8px', fontSize: '0.85rem' }}>Sin pacientes con asistencia presente en este rango</span>
                        </div>
                    ) : (
                        filtered.map((p, idx) => {
                            const hasPhone = !!p.telefono1;
                            const phoneNormalized = hasPhone ? normalizeArgentinePhone(p.telefono1) : null;
                            const alreadySent = phoneNormalized && sentPhones.has(phoneNormalized);
                            const isChecked = selectedForBulk.some(sel => sel.dni === p.dni);
                            const isSending = sendingTo === p.dni;

                            return (
                                <div
                                    key={p.dni || p.paciente || idx}
                                    onClick={() => {
                                        if (bulkSelectionMode) {
                                            if (!hasPhone || alreadySent) return;
                                            setSelectedForBulk(prev =>
                                                prev.some(sel => sel.dni === p.dni)
                                                    ? prev.filter(sel => sel.dni !== p.dni)
                                                    : [...prev, p]
                                            );
                                        }
                                    }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '12px 16px',
                                        cursor: bulkSelectionMode ? (hasPhone && !alreadySent ? 'pointer' : 'not-allowed') : 'default',
                                        borderBottom: '1px solid #f8fafc',
                                        background: (bulkSelectionMode && isChecked) ? '#f5f3ff' : 'transparent',
                                        borderLeft: (bulkSelectionMode && isChecked)
                                            ? '3px solid #8b5cf6' : '3px solid transparent',
                                        transition: 'all .15s',
                                        opacity: (bulkSelectionMode && (!hasPhone || alreadySent)) ? 0.5 : 1,
                                    }}
                                    onMouseEnter={e => { if (!(bulkSelectionMode && isChecked)) e.currentTarget.style.background = '#f8fafc'; }}
                                    onMouseLeave={e => { if (!(bulkSelectionMode && isChecked)) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    {/* Checkbox (bulk mode) */}
                                    {bulkSelectionMode && (
                                        <div style={{
                                            width: '20px', height: '20px', borderRadius: '6px',
                                            border: isChecked ? 'none' : '2px solid #cbd5e1',
                                            background: isChecked ? '#8b5cf6' : '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, transition: 'all 0.15s',
                                        }}>
                                            {isChecked && <CheckCircle2 size={14} color="#fff" />}
                                        </div>
                                    )}

                                    {/* Avatar */}
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '10px',
                                        background: alreadySent
                                            ? 'linear-gradient(135deg, #10b981, #059669)'
                                            : hasPhone
                                                ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                                                : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.75rem', fontWeight: 800, color: '#fff', flexShrink: 0,
                                    }}>
                                        {alreadySent
                                            ? <MailCheck size={18} />
                                            : (p.paciente || '??').split(',')[0]?.substring(0, 2).toUpperCase()
                                        }
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

                                    {/* Visit date */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        fontSize: '0.72rem', color: '#64748b', flexShrink: 0,
                                    }}>
                                        <Calendar size={12} />
                                        <span>{formatDate(p.fecha_visita)}</span>
                                    </div>

                                    {/* Phone */}
                                    <div style={{
                                        fontSize: '0.72rem', color: hasPhone ? '#10b981' : '#ef4444',
                                        flexShrink: 0, minWidth: '120px',
                                    }}>
                                        {hasPhone ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Phone size={12} />
                                                {formatPhone(p.telefono1)}
                                            </span>
                                        ) : (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <AlertCircle size={12} />
                                                Sin teléfono
                                            </span>
                                        )}
                                    </div>

                                    {/* Status badge */}
                                    {alreadySent && (
                                        <div style={{
                                            padding: '3px 10px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: 700,
                                            background: '#ecfdf5', color: '#10b981', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                        }}>
                                            <CheckCircle2 size={12} />
                                            Enviada
                                        </div>
                                    )}

                                    {/* Actions (only outside bulk mode) */}
                                    {!bulkSelectionMode && hasPhone && (
                                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                            <button
                                                onClick={() => handleSendEncuesta(p)}
                                                disabled={isSending || alreadySent || !encuestaTemplate}
                                                title={alreadySent ? 'Ya enviada' : 'Enviar encuesta de calidad'}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                                                    background: (isSending || alreadySent || !encuestaTemplate)
                                                        ? '#e2e8f0'
                                                        : 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                                                    cursor: (isSending || alreadySent || !encuestaTemplate) ? 'default' : 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#fff', transition: 'all .15s',
                                                }}
                                            >
                                                {isSending
                                                    ? <Loader2 size={14} className="spin" />
                                                    : <Send size={14} />
                                                }
                                            </button>
                                            <button
                                                onClick={() => handleOpenChat(p)}
                                                title="Abrir chat"
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '8px',
                                                    border: '1px solid #e2e8f0', background: '#fff',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', color: '#3b82f6',
                                                }}
                                            >
                                                <MessageSquare size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Bulk progress bar */}
            {bulkSending && (
                <div style={{
                    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
                    background: '#fff', borderRadius: '16px', padding: '20px 28px',
                    boxShadow: '0 25px 50px rgba(0,0,0,.15)', border: '1px solid #e2e8f0',
                    minWidth: '400px', zIndex: 1000,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Loader2 size={18} className="spin" color="#8b5cf6" />
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
                                Enviando encuestas...
                            </span>
                        </div>
                        <button
                            onClick={() => { bulkAbortRef.current = true; }}
                            style={{
                                padding: '4px 12px', borderRadius: '6px', border: '1px solid #fecaca',
                                background: '#fef2f2', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Detener
                        </button>
                    </div>
                    <div style={{
                        height: '8px', borderRadius: '4px', background: '#f1f5f9', overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%', borderRadius: '4px',
                            background: 'linear-gradient(90deg, #8b5cf6, #6d28d9)',
                            width: `${((bulkProgress.sent + bulkProgress.failed) / bulkProgress.total) * 100}%`,
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                        <span>✅ {bulkProgress.sent} enviados</span>
                        {bulkProgress.failed > 0 && <span style={{ color: '#ef4444' }}>❌ {bulkProgress.failed} fallidos</span>}
                        <span>{bulkProgress.sent + bulkProgress.failed} / {bulkProgress.total}</span>
                    </div>
                </div>
            )}

            {/* Bulk confirm modal */}
            {showBulkConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setShowBulkConfirm(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: '16px', width: '420px',
                        padding: '28px', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,.15)',
                    }}>
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 16px',
                            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Send size={24} color="#fff" />
                        </div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            Enviar encuesta masiva
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
                            Se enviará la plantilla <strong>"encuesta_de_satisfaccion"</strong> a:
                        </p>
                        <div style={{
                            padding: '12px', borderRadius: '10px', background: '#f5f3ff',
                            marginBottom: '16px', fontSize: '1.5rem', fontWeight: 800, color: '#6d28d9',
                        }}>
                            {selectedForBulk.length} pacientes
                        </div>
                        <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '20px' }}>
                            ⏱ Delay de 15 segundos entre cada envío • Tiempo estimado: ~{Math.ceil(selectedForBulk.length * 15 / 60)} min
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button onClick={() => setShowBulkConfirm(false)} style={{
                                padding: '10px 24px', borderRadius: '8px', border: '1px solid #e2e8f0',
                                background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', fontWeight: 600,
                            }}>Cancelar</button>
                            <button onClick={confirmBulkSend} style={{
                                padding: '10px 24px', borderRadius: '8px', border: 'none',
                                background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                                cursor: 'pointer', fontSize: '0.85rem', color: '#fff', fontWeight: 700,
                                boxShadow: '0 4px 12px rgba(139,92,246,.3)',
                            }}>Confirmar Envío</button>
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
                    defaultLineLabel="Recepciones"
                    autoShowTemplates
                />
            )}
        </div>
    );
}
