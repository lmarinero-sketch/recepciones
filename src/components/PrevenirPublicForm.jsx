import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Heart, ShieldCheck, User, Calendar, Phone, CheckCircle2,
    AlertCircle, Sparkles, Send, RefreshCw, FileText, ChevronRight,
    Users, Plus, Check, Clock, ExternalLink
} from 'lucide-react';
import {
    calculateAge,
    normalizeArgentinePhone,
    formatPhoneDisplay,
    isValidArgentinePhone,
    savePrevenirLead,
    fetchPrevenirLeads,
    sendPrevenirWhatsApp
} from '../services/prevenirService';

const CHEQUEO_OPTIONS = [
    { id: 'General', label: 'Chequeo General', icon: '🩺' },
    { id: 'Mujer', label: 'Chequeo Mujer / Gineco', icon: '🌸' },
    { id: 'Hombre', label: 'Chequeo Hombre / Uro', icon: '👔' },
    { id: 'Cardiológico', label: 'Cardiológico', icon: '🫀' },
    { id: 'Deportivo', label: 'Deportivo', icon: '🏃' },
];

const CAPTADORES = ['Gisela', 'Pasante', 'Otro'];

export default function PrevenirPublicForm() {
    // Form state
    const [nombre, setNombre] = useState('');
    const [fechaNacimiento, setFechaNacimiento] = useState('');
    const [telefono, setTelefono] = useState('');
    const [dni, setDni] = useState('');
    const [obraSocial, setObraSocial] = useState('Obra Social Provincia');
    const [tipoChequeo, setTipoChequeo] = useState('General');
    const [registradoPor, setRegistradoPor] = useState(() => localStorage.getItem('prevenir_captador') || 'Gisela');
    const [otroCaptador, setOtroCaptador] = useState('');
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

    const nombreInputRef = useRef(null);

    // Guardar captador en localStorage
    const handleCaptadorChange = (val) => {
        setRegistradoPor(val);
        localStorage.setItem('prevenir_captador', val);
    };

    // Cálculo dinámico de edad en tiempo real
    const computedAge = useMemo(() => {
        return calculateAge(fechaNacimiento);
    }, [fechaNacimiento]);

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
        const captadorFinal = registradoPor === 'Otro' ? (otroCaptador.trim() || 'Otro') : registradoPor;

        try {
            // 1. Guardar en Supabase
            const saved = await savePrevenirLead({
                nombre_completo: nombre,
                fecha_nacimiento: fechaNacimiento || null,
                edad: computedAge,
                telefono: telefono,
                dni: dni,
                obra_social: obraSocial,
                tipo_chequeo: tipoChequeo,
                lugar_captacion: 'Obra Social Provincia',
                registrado_por: captadorFinal,
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
                setSuccessMessage(`¡Excelente! ${primerNombre} fue registrado y se le envió el WhatsApp de bienvenida.`);
            } else if (waStatus === 'error_wa') {
                setSuccessMessage(`¡Registrado con éxito! ${primerNombre} quedó guardado (el mensaje de WhatsApp podrá enviarse luego).`);
            } else {
                setSuccessMessage(`¡Registrado con éxito! ${primerNombre} guardado en el Programa Prevenir.`);
            }

            // Limpiar formulario para el siguiente entrevistado
            setNombre('');
            setFechaNacimiento('');
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                border: '1px solid #bfdbfe'
                            }}>
                                Programa Prevenir
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>• OSP</span>
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

            {/* Banner Campaña */}
            <div style={{
                width: '100%',
                maxWidth: '480px',
                background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                color: '#ffffff',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '14px',
                boxShadow: '0 4px 14px rgba(29, 78, 216, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div>
                    <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.85, fontWeight: 700 }}>
                        Stand Obra Social Provincia
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: '1px' }}>
                        Captación de Chequeos
                    </div>
                </div>
                <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <Heart size={20} color="#fff" />
                </div>
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

                {/* Fecha de Nacimiento + Cálculo Automático de Edad */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                            Fecha de Nacimiento
                        </label>
                        {computedAge !== null ? (
                            <span style={{
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                background: '#fef3c7',
                                color: '#92400e',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                border: '1px solid #fde68a'
                            }}>
                                🎂 {computedAge} años
                            </span>
                        ) : (
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                (Calcula edad al instante)
                            </span>
                        )}
                    </div>
                    <input
                        type="date"
                        value={fechaNacimiento}
                        onChange={(e) => setFechaNacimiento(e.target.value)}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '48px',
                            padding: '10px 14px',
                            fontSize: '0.98rem',
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            outline: 'none',
                            background: '#ffffff',
                            color: '#1e293b',
                            cursor: 'pointer'
                        }}
                    />
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

                {/* Obra Social */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        Obra Social
                    </label>
                    <select
                        value={obraSocial}
                        onChange={(e) => setObraSocial(e.target.value)}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            height: '46px',
                            padding: '10px 14px',
                            fontSize: '0.92rem',
                            fontWeight: 600,
                            borderRadius: '10px',
                            border: '1.5px solid #cbd5e1',
                            outline: 'none',
                            background: '#ffffff',
                            color: '#1e293b',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="Obra Social Provincia">Obra Social Provincia (OSP)</option>
                        <option value="Particular / Sin Cobertura">Particular / Sin Cobertura</option>
                        <option value="PAMI">PAMI</option>
                        <option value="OSDE">OSDE</option>
                        <option value="Swiss Medical">Swiss Medical</option>
                        <option value="DAMSU">DAMSU</option>
                        <option value="OSECAC">OSECAC</option>
                        <option value="Otra Obra Social">Otra Obra Social</option>
                    </select>
                </div>

                {/* Tipo de Chequeo / Interés (Chips de 1 toque) */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        Tipo de Chequeo de Interés
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {CHEQUEO_OPTIONS.map(opt => {
                            const isSelected = tipoChequeo === opt.id;
                            return (
                                <button
                                    type="button"
                                    key={opt.id}
                                    onClick={() => setTipoChequeo(opt.id)}
                                    style={{
                                        flex: '1 1 auto',
                                        minWidth: '130px',
                                        padding: '8px 12px',
                                        borderRadius: '10px',
                                        border: isSelected ? '1.5px solid #1d4ed8' : '1px solid #e2e8f0',
                                        background: isSelected ? '#eff6ff' : '#f8fafc',
                                        color: isSelected ? '#1d4ed8' : '#475569',
                                        fontSize: '0.78rem',
                                        fontWeight: isSelected ? 800 : 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span>{opt.icon}</span>
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Registrado por (Gisela / Pasante) */}
                <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                        Entrevistado por
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {CAPTADORES.map(cap => {
                            const isSel = registradoPor === cap;
                            return (
                                <button
                                    type="button"
                                    key={cap}
                                    onClick={() => handleCaptadorChange(cap)}
                                    style={{
                                        flex: 1,
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: isSel ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
                                        background: isSel ? '#1d4ed8' : '#ffffff',
                                        color: isSel ? '#ffffff' : '#334155',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {cap}
                                </button>
                            );
                        })}
                    </div>
                    {registradoPor === 'Otro' && (
                        <input
                            type="text"
                            placeholder="Nombre del captador..."
                            value={otroCaptador}
                            onChange={(e) => setOtroCaptador(e.target.value)}
                            style={{
                                marginTop: '6px',
                                width: '100%',
                                boxSizing: 'border-box',
                                height: '40px',
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1'
                            }}
                        />
                    )}
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
                                Enviar WhatsApp automático
                            </div>
                            <div style={{ fontSize: '0.7rem', color: autoSendWhatsapp ? '#047857' : '#64748b' }}>
                                Bienvenida del Programa Prevenir al registrar
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
                                                <span>📞 {item.telefono}</span>
                                                <span style={{ color: '#1d4ed8' }}>• {item.tipo_chequeo}</span>
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
                                                    WA Enviado
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    background: '#fef3c7',
                                                    color: '#d97706',
                                                    padding: '3px 7px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #fde68a'
                                                }}>
                                                    Guardado
                                                </span>
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
