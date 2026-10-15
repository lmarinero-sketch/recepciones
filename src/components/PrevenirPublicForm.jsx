import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Heart, ShieldCheck, User, Calendar, Phone, CheckCircle2,
    AlertCircle, Sparkles, Send, RefreshCw, FileText, ChevronRight,
    Users, Plus, Check, Clock, ExternalLink, Search, Building2, ChevronDown, X
} from 'lucide-react';
import {
    calculateAge,
    normalizeArgentinePhone,
    formatPhoneDisplay,
    isValidArgentinePhone,
    savePrevenirLead,
    fetchPrevenirLeads,
    sendPrevenirWhatsApp,
    fetchSalusObrasSociales,
    DEFAULT_SALUS_OBRAS_SOCIALES
} from '../services/prevenirService';

const CHEQUEO_OPTIONS = [
    {
        id: 'Prevenir',
        label: 'Prevenir',
        icon: '🌸',
        color: '#db2777',
        activeBg: '#ec4899',
        activeText: '#ffffff',
        inactiveBg: '#fdf2f8',
        borderColor: '#f472b6',
        hoverBg: '#fce7f3'
    },
    {
        id: 'Chequeo anual',
        label: 'Chequeo anual',
        icon: '🩺',
        color: '#059669',
        activeBg: '#10b981',
        activeText: '#ffffff',
        inactiveBg: '#f0fdf4',
        borderColor: '#6ee7b7',
        hoverBg: '#dcfce7'
    },
];

export default function PrevenirPublicForm() {
    // Form state
    const [nombre, setNombre] = useState('');
    const [edad, setEdad] = useState('');
    const [telefono, setTelefono] = useState('');
    const [dni, setDni] = useState('');
    const [obraSocial, setObraSocial] = useState('001 - PROVINCIA');
    const [obrasSocialesList, setObrasSocialesList] = useState(DEFAULT_SALUS_OBRAS_SOCIALES);
    const [osSearch, setOsSearch] = useState('');
    const [osDropdownOpen, setOsDropdownOpen] = useState(false);
    const osDropdownRef = useRef(null);
    const osInputRef = useRef(null);
    const [tipoChequeo, setTipoChequeo] = useState('Prevenir');
    const [observaciones, setObservaciones] = useState('');
    const [autoSendWhatsapp, setAutoSendWhatsapp] = useState(true);

    // Status state
    const [submitting, setSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);

    // Today's leads counter & drawer
    const [todayLeads, setTodayLeads] = useState([]);
    const [loadingLeads, setLoadingLeads] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const [sendingLeadId, setSendingLeadId] = useState(null);

    const nombreInputRef = useRef(null);

    // Cargar Obras Sociales registradas en SALUS
    useEffect(() => {
        fetchSalusObrasSociales().then(list => {
            if (list && list.length > 0) {
                setObrasSocialesList(list);
            }
        }).catch(console.warn);
    }, []);

    // Cerrar dropdown de Obra Social al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (osDropdownRef.current && !osDropdownRef.current.contains(e.target)) {
                setOsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    // Filtrar Obras Sociales por el texto del buscador
    const filteredOsList = useMemo(() => {
        if (!osSearch.trim()) return obrasSocialesList;
        const s = osSearch.toLowerCase().trim();
        return obrasSocialesList.filter(os => os.toLowerCase().includes(s));
    }, [obrasSocialesList, osSearch]);


    // Normalización de teléfono en tiempo real
    const phoneNorm = useMemo(() => {
        if (!telefono) return { raw: '', norm: '', valid: false, display: '' };
        const norm = normalizeArgentinePhone(telefono);
        const valid = isValidArgentinePhone(telefono);
        const display = formatPhoneDisplay(telefono);
        return { raw: telefono, norm, valid, display };
    }, [telefono]);

    // Cargar leads registrados hoy para el contador
    const loadTodayLeads = async () => {
        try {
            setLoadingLeads(true);
            const data = await fetchPrevenirLeads({ dateFilter: 'today' });
            setTodayLeads(data || []);
        } catch (e) {
            console.warn('Error loading today leads:', e);
        } finally {
            setLoadingLeads(false);
        }
    };

    useEffect(() => {
        loadTodayLeads();
    }, []);

    // Reenviar plantilla de WhatsApp desde el drawer móvil
    const handleResendWhatsApp = async (lead) => {
        if (!lead || !lead.id || sendingLeadId === lead.id) return;
        setSendingLeadId(lead.id);
        try {
            await sendPrevenirWhatsApp({ lead });
            const primerNombre = lead.nombre_completo ? lead.nombre_completo.split(' ')[0] : 'El paciente';
            setSuccessMessage(`¡Plantilla enviada con éxito a ${primerNombre}!`);
            await loadTodayLeads();
        } catch (err) {
            console.error('Error reenviando plantilla:', err);
            setErrorMessage(`No se pudo enviar la plantilla: ${err.message || 'Error de conexión'}`);
        } finally {
            setSendingLeadId(null);
        }
    };

    // Enviar formulario
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!nombre.trim()) {
            setErrorMessage('Por favor ingresá el nombre y apellido.');
            nombreInputRef.current?.focus();
            return;
        }

        if (!telefono.trim()) {
            setErrorMessage('Por favor ingresá el número de teléfono/WhatsApp.');
            return;
        }

        if (!phoneNorm.valid) {
            setErrorMessage(`El teléfono ingresado (${telefono}) no parece tener los 10 dígitos requeridos (ej: 2645438114).`);
            return;
        }

        setSubmitting(true);

        try {
            // 1. Guardar en Supabase
            const saved = await savePrevenirLead({
                nombre_completo: nombre,
                fecha_nacimiento: null,
                edad: edad ? parseInt(edad, 10) : null,
                telefono: telefono,
                dni: dni,
                obra_social: obraSocial,
                tipo_chequeo: tipoChequeo,
                lugar_captacion: 'Obra Social Provincia',
                registrado_por: 'Stand OSP',
                observaciones: observaciones,
            });

            // 2. Si tiene activo auto-send WhatsApp, disparar mensaje
            let waStatus = 'guardado';
            if (autoSendWhatsapp && saved) {
                try {
                    await sendPrevenirWhatsApp({ lead: saved });
                    waStatus = 'enviado';
                } catch (waErr) {
                    console.error('Error enviando WhatsApp:', waErr);
                    waStatus = 'error_wa';
                }
            }

            // Notificación amigable
            const primerNombre = nombre.trim().split(' ')[0];
            if (waStatus === 'enviado') {
                setSuccessMessage(`¡Excelente! ${primerNombre} fue registrado y recibió el WhatsApp oficial de bienvenida.`);
            } else if (waStatus === 'error_wa') {
                setSuccessMessage(`¡Registrado con éxito! ${primerNombre} quedó guardado (podés enviar el WhatsApp desde el historial arriba).`);
            } else {
                setSuccessMessage(`¡Registrado con éxito! ${primerNombre} guardado en el Programa Prevenir.`);
            }

            // Limpiar formulario para el siguiente entrevistado
            setNombre('');
            setEdad('');
            setTelefono('');
            setDni('');
            setObservaciones('');
            // Mantenemos: obraSocial, tipoChequeo, captador y autoSendWhatsapp para velocidad

            // Recargar contador
            loadTodayLeads();

            // Auto-focus en el primer campo
            setTimeout(() => {
                nombreInputRef.current?.focus();
            }, 300);

            // Auto-ocultar mensaje de éxito tras 5s
            setTimeout(() => {
                setSuccessMessage(null);
            }, 5000);
        } catch (err) {
            console.error(err);
            setErrorMessage('Ocurrió un error al guardar los datos. Verificá la conexión a internet e intentá nuevamente.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f8fafc',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            color: '#1e293b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 14px 40px',
            boxSizing: 'border-box'
        }}>
            {/* Header móvil institucional */}
            <div style={{
                width: '100%',
                maxWidth: '480px',
                background: '#ffffff',
                borderRadius: '16px',
                padding: '14px 16px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'contain' }}
                    />
                    <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                            Sanatorio Argentino
                        </div>
                    </div>
                </div>

                {/* Botón flotante para ver registros del día */}
                <button
                    onClick={() => setShowDrawer(prev => !prev)}
                    style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        color: '#166534',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                >
                    <Users size={14} />
                    Hoy: <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{todayLeads.length}</span>
                </button>
            </div>



            {/* Notificaciones */}
            {successMessage && (
                <div style={{
                    width: '100%',
                    maxWidth: '480px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    color: '#065f46',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    marginBottom: '12px',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <CheckCircle2 size={20} color="#059669" style={{ flexShrink: 0 }} />
                    <span>{successMessage}</span>
                </div>
            )}

            {errorMessage && (
                <div style={{
                    width: '100%',
                    maxWidth: '480px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    marginBottom: '12px',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                }}>
                    <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
                    <span>{errorMessage}</span>
                </div>
            )}

            {/* Formulario Principal */}
            <form
                onSubmit={handleSubmit}
                style={{
                    width: '100%',
                    maxWidth: '480px',
                    background: '#ffffff',
                    borderRadius: '18px',
                    padding: '18px 16px',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    boxSizing: 'border-box'
                }}
            >
                {/* Nombre Completo */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Nombre y Apellido <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            ref={nombreInputRef}
                            type="text"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Ej: Laura Sanchez"
                            autoComplete="off"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                height: '48px',
                                padding: '10px 14px',
                                fontSize: '1rem',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                                textTransform: 'words',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#1d4ed8'}
                            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                        />
                    </div>
                </div>

                {/* Edad (rápido, solo número) */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Edad <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>(años)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            min="1"
                            max="120"
                            value={edad}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                if (val.length <= 3) setEdad(val);
                            }}
                            placeholder="Ej: 45"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                height: '48px',
                                padding: '10px 14px',
                                fontSize: '1rem',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                outline: 'none',
                                background: '#ffffff',
                                color: '#1e293b',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#1d4ed8'}
                            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                        />
                        {edad && (
                            <span style={{
                                position: 'absolute',
                                right: '14px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                color: '#64748b',
                                pointerEvents: 'none'
                            }}>
                                años
                            </span>
                        )}
                    </div>
                </div>

                {/* Teléfono / WhatsApp con mapeo automático para BuilderBot */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                            Teléfono / WhatsApp <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Sin 0 ni 15 (Ej: 2645438114)
                        </span>
                    </div>
                    <input
                        type="tel"
                        inputMode="numeric"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="2645438114"
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '48px',
                            padding: '10px 14px',
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                            borderRadius: '10px',
                            border: phoneNorm.valid
                                ? '1.5px solid #10b981'
                                : (telefono ? '1.5px solid #f59e0b' : '1.5px solid #cbd5e1'),
                            outline: 'none',
                            background: phoneNorm.valid ? '#f0fdf4' : '#ffffff',
                        }}
                    />

                    {/* Previsualización del mapeo API BuilderBot */}
                    {telefono && (
                        <div style={{
                            marginTop: '6px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: phoneNorm.valid ? '#ecfdf5' : '#fffbeb',
                            border: phoneNorm.valid ? '1px solid #a7f3d0' : '1px solid #fef3c7',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <span style={{ color: '#64748b' }}>API BuilderBot: </span>
                                <strong style={{ color: phoneNorm.valid ? '#047857' : '#b45309' }}>
                                    {phoneNorm.norm}
                                </strong>
                                {phoneNorm.valid && (
                                    <span style={{ color: '#047857', marginLeft: '6px' }}>
                                        ({phoneNorm.display})
                                    </span>
                                )}
                            </div>
                            {phoneNorm.valid ? (
                                <span style={{ color: '#059669', fontWeight: 700, fontSize: '0.72rem' }}>
                                    ✅ Listo para WhatsApp
                                </span>
                            ) : (
                                <span style={{ color: '#d97706', fontWeight: 600, fontSize: '0.72rem' }}>
                                    ⚠️ Incompleto
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* DNI */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        DNI <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>(opcional)</span>
                    </label>
                    <input
                        type="tel"
                        inputMode="numeric"
                        value={dni}
                        onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                        placeholder="Ej: 32456789"
                        maxLength={9}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '46px',
                            padding: '10px 14px',
                            fontSize: '0.98rem',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            outline: 'none',
                        }}
                    />
                </div>

                {/* Obra Social con Buscador y SALUS */}
                <div ref={osDropdownRef} style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                            Obra Social (SALUS)
                        </label>
                        <span style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600 }}>
                            {filteredOsList.length} opciones
                        </span>
                    </div>

                    {/* Chips rápidos de 1 toque */}
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', marginBottom: '4px', scrollbarWidth: 'none' }}>
                        {[
                            { id: '001 - PROVINCIA', label: '001 - PROVINCIA' },
                            { id: '042 - PARTICULARES', label: 'PARTICULARES' },
                            { id: '005 - OSDE BINARIO', label: 'OSDE' },
                            { id: '004 - DAMSU', label: 'DAMSU' },
                            { id: '121 - SWISS MEDICAL S.A.', label: 'SWISS' },
                        ].map(chip => (
                            <button
                                key={chip.id}
                                type="button"
                                onClick={() => {
                                    setObraSocial(chip.id);
                                    setOsDropdownOpen(false);
                                    setOsSearch('');
                                }}
                                style={{
                                    whiteSpace: 'nowrap',
                                    padding: '4px 9px',
                                    borderRadius: '14px',
                                    fontSize: '0.72rem',
                                    fontWeight: obraSocial === chip.id ? 800 : 600,
                                    background: obraSocial === chip.id ? '#1d4ed8' : '#f1f5f9',
                                    color: obraSocial === chip.id ? '#fff' : '#475569',
                                    border: obraSocial === chip.id ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>

                    {/* Input Buscador */}
                    <div
                        onClick={() => {
                            setOsDropdownOpen(true);
                            osInputRef.current?.focus();
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            height: '48px',
                            padding: '0 12px',
                            borderRadius: '10px',
                            border: osDropdownOpen ? '1.5px solid #1d4ed8' : '1.5px solid #cbd5e1',
                            background: '#ffffff',
                            boxSizing: 'border-box',
                            boxShadow: osDropdownOpen ? '0 0 0 3px rgba(29, 78, 216, 0.1)' : 'none',
                            cursor: 'text',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Search size={17} color={osDropdownOpen ? '#1d4ed8' : '#94a3b8'} style={{ marginRight: '8px', flexShrink: 0 }} />
                        <input
                            ref={osInputRef}
                            type="text"
                            placeholder="Buscar obra social (Ej: 001, OSP, OSDE, DAMSU)..."
                            value={osDropdownOpen ? osSearch : (obraSocial || '')}
                            onChange={(e) => {
                                setOsSearch(e.target.value);
                                setOsDropdownOpen(true);
                            }}
                            onFocus={() => {
                                setOsSearch('');
                                setOsDropdownOpen(true);
                            }}
                            style={{
                                border: 'none',
                                outline: 'none',
                                width: '100%',
                                fontSize: '0.92rem',
                                fontWeight: 600,
                                color: '#1e293b',
                                background: 'transparent'
                            }}
                        />

                        {obraSocial && !osDropdownOpen && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setObraSocial('');
                                    setOsSearch('');
                                    setOsDropdownOpen(true);
                                    osInputRef.current?.focus();
                                }}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: '#94a3b8'
                                }}
                            >
                                <X size={15} />
                            </button>
                        )}

                        <ChevronDown
                            size={16}
                            color="#94a3b8"
                            style={{
                                marginLeft: '6px',
                                flexShrink: 0,
                                transform: osDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease'
                            }}
                        />
                    </div>

                    {/* Dropdown flotante con lista filtrada de SALUS */}
                    {osDropdownOpen && (
                        <div style={{
                            position: 'absolute',
                            top: 'calc(100% + 4px)',
                            left: 0,
                            right: 0,
                            background: '#ffffff',
                            borderRadius: '12px',
                            border: '1px solid #cbd5e1',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                            maxHeight: '260px',
                            overflowY: 'auto',
                            zIndex: 9999,
                            padding: '4px'
                        }}>
                            {/* Opción personalizada si el texto no coincide con ninguno */}
                            {osSearch.trim() && !filteredOsList.some(item => item.toLowerCase() === osSearch.trim().toLowerCase()) && (
                                <div
                                    onClick={() => {
                                        setObraSocial(osSearch.trim().toUpperCase());
                                        setOsDropdownOpen(false);
                                        setOsSearch('');
                                    }}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        color: '#1d4ed8',
                                        background: '#eff6ff',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        marginBottom: '4px'
                                    }}
                                >
                                    <Plus size={15} />
                                    <span>Usar: <strong>"{osSearch.trim().toUpperCase()}"</strong></span>
                                </div>
                            )}

                            {filteredOsList.length === 0 ? (
                                <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                                    No se encontraron obras sociales con "{osSearch}"
                                </div>
                            ) : (
                                filteredOsList.map((item) => {
                                    const isSelected = obraSocial === item;
                                    return (
                                        <div
                                            key={item}
                                            onClick={() => {
                                                setObraSocial(item);
                                                setOsDropdownOpen(false);
                                                setOsSearch('');
                                            }}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                fontSize: '0.85rem',
                                                fontWeight: isSelected ? 800 : 500,
                                                color: isSelected ? '#1d4ed8' : '#1e293b',
                                                background: isSelected ? '#eff6ff' : 'transparent',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                                            }}
                                        >
                                            <span>{item}</span>
                                            {isSelected && <Check size={16} color="#1d4ed8" />}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* Tipo de Interés (Prevenir en rosado / Chequeo anual en verde) */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        Tipo de Interés
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {CHEQUEO_OPTIONS.map(opt => {
                            const isSelected = tipoChequeo === opt.id;
                            return (
                                <button
                                    type="button"
                                    key={opt.id}
                                    onClick={() => setTipoChequeo(opt.id)}
                                    style={{
                                        padding: '12px 10px',
                                        borderRadius: '12px',
                                        border: isSelected ? `2.5px solid ${opt.activeBg}` : `1.5px solid ${opt.borderColor}`,
                                        background: isSelected ? opt.activeBg : opt.inactiveBg,
                                        color: isSelected ? opt.activeText : opt.color,
                                        fontSize: '0.92rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: isSelected ? `0 4px 12px ${opt.color}40` : 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span style={{ fontSize: '1.1rem' }}>{opt.icon}</span>
                                    <span>{opt.label}</span>
                                    {isSelected && <Check size={16} color="#ffffff" style={{ marginLeft: '2px' }} />}
                                </button>
                            );
                        })}
                    </div>
                </div>



                {/* Observaciones opcionales */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Notas u Observaciones <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>(opcional)</span>
                    </label>
                    <textarea
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                        placeholder="Ej: Prefiere horario matutino / llamar por la tarde..."
                        rows={2}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 12px',
                            fontSize: '0.85rem',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            outline: 'none',
                            fontFamily: 'inherit',
                            resize: 'none'
                        }}
                    />
                </div>

                {/* Switch Enviar WhatsApp Automático */}
                <div
                    onClick={() => setAutoSendWhatsapp(prev => !prev)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: autoSendWhatsapp ? '#ecfdf5' : '#f8fafc',
                        borderRadius: '10px',
                        border: autoSendWhatsapp ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        userSelect: 'none'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Send size={16} color={autoSendWhatsapp ? '#059669' : '#94a3b8'} />
                        <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: autoSendWhatsapp ? '#065f46' : '#475569' }}>
                                Enviar WhatsApp oficial automático
                            </div>
                            <div style={{ fontSize: '0.7rem', color: autoSendWhatsapp ? '#047857' : '#64748b' }}>
                                Plantilla Meta: bienvenida_programa_prevenir (vía BuilderBot)
                            </div>
                        </div>
                    </div>
                    <div style={{
                        width: '42px',
                        height: '24px',
                        borderRadius: '12px',
                        background: autoSendWhatsapp ? '#10b981' : '#cbd5e1',
                        position: 'relative',
                        transition: 'background 0.2s ease',
                    }}>
                        <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            position: 'absolute',
                            top: '2px',
                            left: autoSendWhatsapp ? '20px' : '2px',
                            transition: 'left 0.2s ease',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                    </div>
                </div>

                {/* Botón Principal Guardar */}
                <button
                    type="submit"
                    disabled={submitting}
                    style={{
                        height: '52px',
                        width: '100%',
                        borderRadius: '12px',
                        border: 'none',
                        background: submitting
                            ? '#94a3b8'
                            : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                        color: '#ffffff',
                        fontSize: '1rem',
                        fontWeight: 800,
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(29, 78, 216, 0.3)',
                        transition: 'all 0.15s ease',
                        marginTop: '4px'
                    }}
                >
                    {submitting ? (
                        <>
                            <RefreshCw size={18} className="spin" />
                            <span>Guardando...</span>
                        </>
                    ) : (
                        <>
                            <Check size={20} />
                            <span>Registrar Paciente {autoSendWhatsapp && '(+ WhatsApp)'}</span>
                        </>
                    )}
                </button>
            </form>

            {/* Drawer / Modal de Registros del Día */}
            {showDrawer && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.5)',
                    backdropFilter: 'blur(3px)',
                    zIndex: 99999,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                }}>
                    <div
                        onClick={() => setShowDrawer(false)}
                        style={{ flex: 1 }}
                    />
                    <div style={{
                        background: '#ffffff',
                        borderTopLeftRadius: '20px',
                        borderTopRightRadius: '20px',
                        padding: '18px 16px 28px',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '14px',
                            borderBottom: '1px solid #f1f5f9',
                            paddingBottom: '10px'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                                    Entrevistados de Hoy ({todayLeads.length})
                                </h3>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                    Operativo OSP — Programa Prevenir
                                </div>
                            </div>
                            <button
                                onClick={() => setShowDrawer(false)}
                                style={{
                                    border: 'none',
                                    background: '#f1f5f9',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    color: '#475569'
                                }}
                            >
                                Cerrar
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {todayLeads.length === 0 ? (
                                <div style={{ padding: '30px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Aún no hay personas registradas hoy en el stand.
                                </div>
                            ) : (
                                todayLeads.map((item, idx) => (
                                    <div
                                        key={item.id || idx}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>
                                                {item.nombre_completo}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                                {item.edad !== null && <span>🎂 {item.edad} años</span>}
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: 800,
                                                    color: item.tipo_chequeo === 'Prevenir' ? '#db2777' : '#059669',
                                                    background: item.tipo_chequeo === 'Prevenir' ? '#fdf2f8' : '#f0fdf4',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    border: item.tipo_chequeo === 'Prevenir' ? '1px solid #fbcfe8' : '1px solid #bbf7d0'
                                                }}>
                                                    {item.tipo_chequeo}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>
                                                Por {item.registrado_por} • {new Date(item.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>

                                        <div>
                                            {item.mensaje_enviado ? (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    background: '#ecfdf5',
                                                    color: '#059669',
                                                    padding: '3px 7px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #a7f3d0'
                                                }}>
                                                    ✓ WA Enviado
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleResendWhatsApp(item)}
                                                    disabled={sendingLeadId === item.id}
                                                    style={{
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        background: '#25D366',
                                                        color: '#ffffff',
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        cursor: sendingLeadId === item.id ? 'not-allowed' : 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {sendingLeadId === item.id ? 'Enviando...' : '📲 Enviar WA'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
