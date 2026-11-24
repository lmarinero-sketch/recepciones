import { useState, useEffect, useCallback } from 'react';
import {
    Settings, Eye, EyeOff, Save, RotateCw, CheckCircle, AlertTriangle,
    Key, Building2, Globe, Copy, ExternalLink, Zap, Shield,
    Phone, ToggleLeft, ToggleRight, Smartphone, DollarSign,
} from 'lucide-react';
import { getAllConfig, updateConfig, updateMultipleConfigs, getAllWhatsAppLines, updateWhatsAppLine, testWhatsAppLineConnection } from '../services/configService';

// Configuración de los campos con metadata para UI
const FIELD_META = {
    whatsapp_phone: {
        icon: Smartphone, placeholder: '5492641234567',
        description: 'Número de WhatsApp vinculado al bot (formato internacional sin +).',
    },
    area_code: {
        icon: Globe, placeholder: '264',
        description: 'Código de área predeterminado para normalización de teléfonos.',
        options: ['11', '221', '223', '261', '264', '266', '280', '291', '299', '341', '342', '351', '370', '376', '379', '381', '383', '385', '387', '388'],
    },
    clinic_name: {
        icon: Building2, placeholder: 'Sanatorio Argentino',
        description: 'Nombre que aparece en las notificaciones y mensajes de WhatsApp.',
    },
    webhook_url: {
        icon: ExternalLink, placeholder: '',
        description: 'Consultar las URLs de webhook en la sección de Líneas WhatsApp.',
        readOnly: true, copyable: false,
    },
    // Legacy keys (still shown for reference)
    builderbot_api_key: {
        icon: Key, placeholder: 'bb-xxxxxxxx-...',
        description: 'API Key legada (ahora se gestiona por línea). Se usa como fallback.',
        link: 'https://app.builderbot.cloud',
    },
    builderbot_project_id: {
        icon: Globe, placeholder: 'xxxxxxxx-xxxx-...',
        description: 'Project ID legado (ahora se gestiona por línea). Se usa como fallback.',
    },
};

const CATEGORY_LABELS = {
    whatsapp: { label: 'WhatsApp General', icon: Smartphone, color: '#25D366' },
    general: { label: 'General', icon: Building2, color: '#6366F1' },
};

export default function ConfigPanel({ addToast }) {
    const [configs, setConfigs] = useState([]);
    const [editValues, setEditValues] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSecrets, setShowSecrets] = useState({});
    const [hasChanges, setHasChanges] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [testing, setTesting] = useState(false);

    // WhatsApp Lines state
    const [lines, setLines] = useState([]);
    const [lineEdits, setLineEdits] = useState({});
    const [lineShowSecrets, setLineShowSecrets] = useState({});
    const [lineSaving, setLineSaving] = useState({});
    const [lineTesting, setLineTesting] = useState({});
    const [lineTestResults, setLineTestResults] = useState({});
    const [lineHasChanges, setLineHasChanges] = useState({});

    // Parámetros de precios para plantillas Meta (OSP)
    const [precioLab, setPrecioLab] = useState('$30.000');
    const [precioEco, setPrecioEco] = useState('$10.000');
    const [savingPrecios, setSavingPrecios] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            setLoading(true);
            const [data, linesData] = await Promise.all([
                getAllConfig(),
                getAllWhatsAppLines(),
            ]);
            setConfigs(data);
            const vals = {};
            data.forEach(c => { vals[c.key] = c.value; });
            setEditValues(vals);
            if (vals.precio_deposito_laboratorio) setPrecioLab(vals.precio_deposito_laboratorio);
            if (vals.precio_diferencia_ecografia) setPrecioEco(vals.precio_diferencia_ecografia);
            setHasChanges(false);

            // Lines
            setLines(linesData);
            const edits = {};
            linesData.forEach(l => {
                edits[l.id] = {
                    api_key: l.api_key || '',
                    project_id: l.project_id || '',
                    label: l.label || '',
                    phone: l.phone || '',
                    is_active: l.is_active ?? true,
                };
            });
            setLineEdits(edits);
            setLineHasChanges({});
        } catch (e) {
            console.error(e);
            addToast?.('Error al cargar configuración', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const handleChange = (key, value) => {
        setEditValues(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
        setTestResult(null);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const changed = {};
            configs.forEach(c => {
                const meta = FIELD_META[c.key];
                if (!meta?.readOnly && editValues[c.key] !== c.value) {
                    changed[c.key] = editValues[c.key];
                }
            });

            if (Object.keys(changed).length === 0) {
                addToast?.('No hay cambios para guardar', 'info');
                return;
            }

            await updateMultipleConfigs(changed);
            addToast?.('✅ Configuración guardada correctamente', 'success');
            await loadConfig();
        } catch (e) {
            console.error(e);
            addToast?.('Error al guardar: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // === LINE HANDLERS ===
    const handleLineChange = (lineId, field, value) => {
        setLineEdits(prev => ({
            ...prev,
            [lineId]: { ...prev[lineId], [field]: value },
        }));
        setLineHasChanges(prev => ({ ...prev, [lineId]: true }));
        setLineTestResults(prev => ({ ...prev, [lineId]: null }));
    };

    const handleLineSave = async (lineId) => {
        try {
            setLineSaving(prev => ({ ...prev, [lineId]: true }));
            const edits = lineEdits[lineId];
            if (!edits) return;

            await updateWhatsAppLine(lineId, {
                api_key: edits.api_key,
                project_id: edits.project_id,
                label: edits.label,
                phone: edits.phone,
                is_active: edits.is_active,
            });
            addToast?.(`✅ Línea ${edits.label} guardada`, 'success');
            setLineHasChanges(prev => ({ ...prev, [lineId]: false }));
            await loadConfig();
        } catch (e) {
            console.error(e);
            addToast?.('Error al guardar línea: ' + e.message, 'error');
        } finally {
            setLineSaving(prev => ({ ...prev, [lineId]: false }));
        }
    };

    const handleLineTest = async (lineId) => {
        setLineTesting(prev => ({ ...prev, [lineId]: true }));
        setLineTestResults(prev => ({ ...prev, [lineId]: null }));
        try {
            const edits = lineEdits[lineId];
            if (!edits?.api_key || !edits?.project_id || edits.api_key === 'configurar-desde-panel') {
                setLineTestResults(prev => ({ ...prev, [lineId]: 'error' }));
                addToast?.('Completá las credenciales primero', 'error');
                return;
            }
            await testWhatsAppLineConnection(lineId);
            setLineTestResults(prev => ({ ...prev, [lineId]: 'success' }));
            addToast?.('✅ Conexión exitosa', 'success');
        } catch (e) {
            setLineTestResults(prev => ({ ...prev, [lineId]: 'error' }));
            addToast?.('❌ Error: ' + e.message, 'error');
        } finally {
            setLineTesting(prev => ({ ...prev, [lineId]: false }));
        }
    };

    const handleCopy = (value) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => {
                addToast?.('📋 Copiado al portapapeles', 'success');
            }).catch(() => fallbackCopy(value));
        } else {
            fallbackCopy(value);
        }
    };

    const fallbackCopy = (text) => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            addToast?.('📋 Copiado al portapapeles', 'success');
        } catch (e) {
            addToast?.('No se pudo copiar', 'error');
        }
    };

    const toggleSecret = (key) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleLineSecret = (key) => {
        setLineShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSavePrecios = async () => {
        try {
            setSavingPrecios(true);
            await Promise.all([
                updateConfig('precio_deposito_laboratorio', precioLab.trim() || '$30.000', {
                    label: 'Depósito de Laboratorio (OSP)',
                    category: 'precios_plantillas',
                }),
                updateConfig('precio_diferencia_ecografia', precioEco.trim() || '$10.000', {
                    label: 'Valor Aproximado por Ecografía (sin coseguro)',
                    category: 'precios_plantillas',
                }),
            ]);
            addToast?.('✅ Precios de plantillas actualizados correctamente', 'success');
            await loadConfig();
        } catch (e) {
            console.error(e);
            addToast?.('Error al guardar precios: ' + e.message, 'error');
        } finally {
            setSavingPrecios(false);
        }
    };

    // Agrupar configs por categoría (excluyendo precios_plantillas que tiene su tarjeta propia)
    const grouped = {};
    configs.forEach(c => {
        if (c.category === 'precios_plantillas') return;
        if (!grouped[c.category]) grouped[c.category] = [];
        grouped[c.category].push(c);
    });

    if (loading) {
        return (
            <div className="content no-print">
                <div className="cart animate-fade-in" style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <RotateCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-400)' }} />
                    <p style={{ marginTop: '12px', color: 'var(--neutral-400)' }}>Cargando configuración...</p>
                </div>
            </div>
        );
    }

    const WEBHOOK_BASE = 'https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/whatsapp-webhook';

    return (
        <div className="content no-print">
            <div className="cart animate-fade-in">
                {/* Header */}
                <div className="cart__header" style={{ borderBottom: '2px solid var(--neutral-100)', paddingBottom: '16px' }}>
                    <div className="cart__title-group">
                        <div className="cart__icon-badge" style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
                            <Settings size={18} color="#fff" />
                        </div>
                        <div>
                            <h3 className="cart__title" style={{ margin: 0 }}>Configuración del Sistema</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
                                Credenciales, líneas WhatsApp y preferencias
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={loadConfig}
                            disabled={saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                background: 'var(--neutral-50)', color: 'var(--neutral-600)',
                                border: '1px solid var(--neutral-200)', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s',
                            }}
                        >
                            <RotateCw size={14} /> Recargar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 20px', borderRadius: 'var(--radius-md)',
                                background: hasChanges ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'var(--neutral-100)',
                                color: hasChanges ? '#fff' : 'var(--neutral-400)',
                                border: 'none', cursor: hasChanges ? 'pointer' : 'not-allowed',
                                fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.2s',
                                boxShadow: hasChanges ? '0 3px 12px rgba(34,197,94,0.3)' : 'none',
                            }}
                        >
                            {saving ? <RotateCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>

                {/* ========== PARÁMETROS DE PRECIOS PARA PLANTILLAS META (OSP) ========== */}
                <div style={{ marginTop: '24px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        marginBottom: '14px', paddingBottom: '8px',
                        borderBottom: '2px solid #0284C720',
                    }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: '#0284C715', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <DollarSign size={16} color="#0284C7" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                Parámetros de Precios — Plantillas Meta (Obra Social Provincia)
                            </h4>
                            <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: 'var(--neutral-400)' }}>
                                Estos valores se completan automáticamente en la plantilla oficial de Meta y en el atajo <code>/osp_deposito</code>
                            </p>
                        </div>
                        <button
                            onClick={handleSavePrecios}
                            disabled={savingPrecios}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                                color: '#fff', border: 'none', cursor: savingPrecios ? 'not-allowed' : 'pointer',
                                fontSize: '0.78rem', fontWeight: 700,
                                boxShadow: '0 2px 8px rgba(2,132,199,0.28)',
                            }}
                        >
                            {savingPrecios ? <RotateCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                            {savingPrecios ? 'Guardando...' : 'Guardar Precios'}
                        </button>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '14px',
                        marginBottom: '14px',
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--neutral-200)',
                            borderRadius: '10px',
                            padding: '14px 16px',
                        }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--neutral-700)', marginBottom: '6px' }}>
                                🧪 Depósito de Laboratorio (Variable <code>{'{{1}}'}</code>)
                            </label>
                            <input
                                type="text"
                                value={precioLab}
                                onChange={e => setPrecioLab(e.target.value)}
                                placeholder="$30.000"
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                                    border: '1px solid var(--neutral-300)', fontSize: '0.92rem',
                                    fontWeight: 700, color: '#0F172A', background: '#F8FAFC',
                                    boxSizing: 'border-box',
                                }}
                            />
                            <p style={{ margin: '5px 0 0', fontSize: '0.7rem', color: 'var(--neutral-400)' }}>
                                Monto a dejar en laboratorio por análisis pendientes (OSP).
                            </p>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--neutral-200)',
                            borderRadius: '10px',
                            padding: '14px 16px',
                        }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--neutral-700)', marginBottom: '6px' }}>
                                🩺 Valor Aproximado por Ecografía (Variable <code>{'{{2}}'}</code>)
                            </label>
                            <input
                                type="text"
                                value={precioEco}
                                onChange={e => setPrecioEco(e.target.value)}
                                placeholder="$10.000"
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: '8px',
                                    border: '1px solid var(--neutral-300)', fontSize: '0.92rem',
                                    fontWeight: 700, color: '#0F172A', background: '#F8FAFC',
                                    boxSizing: 'border-box',
                                }}
                            />
                            <p style={{ margin: '5px 0 0', fontSize: '0.7rem', color: 'var(--neutral-400)' }}>
                                Diferencia aproximada por ecografía cuando el paciente no cuenta con coseguro.
                            </p>
                        </div>
                    </div>

                    {/* Vista previa en vivo del mensaje */}
                    <div style={{
                        background: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        fontSize: '0.8rem',
                        color: '#14532D',
                        lineHeight: 1.5,
                    }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803D', textTransform: 'uppercase', marginBottom: '6px' }}>
                            Vista previa del mensaje que recibirá el paciente:
                        </div>
                        <div>
                            Te informamos que con la obra social Provincia, los análisis suelen quedar pendientes al momento del chequeo clínico, por este motivo deberá dejar en laboratorio un depósito de <strong>{precioLab || '$30.000'}</strong> por el momento; este monto puede abonarse en efectivo o con transferencia.
                            <br />
                            Por otro lado, si no cuenta con coseguro, deberá abonar una diferencia por cada ecografía que le indique el médico clínico. El valor aproximado por el momento es de <strong>{precioEco || '$10.000'}</strong> por ecografía.
                            <br />
                            Muchas gracias por su comprensión!!
                        </div>
                    </div>
                </div>

                {/* ========== LÍNEA WHATSAPP (ÚNICA) ========== */}
                {lines.length > 0 && (() => {
                    const line = lines[0];
                    const edits = lineEdits[line.id] || {};
                    const isChanged = lineHasChanges[line.id];
                    const isSaving = lineSaving[line.id];
                    const isTesting = lineTesting[line.id];
                    const testRes = lineTestResults[line.id];
                    const showApiKey = lineShowSecrets[`${line.id}_api`];
                    const webhookUrl = `${WEBHOOK_BASE}?line=${line.id}`;
                    const lineColor = line.color || '#25D366';

                    return (
                        <div style={{ marginTop: '24px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                marginBottom: '16px', paddingBottom: '8px',
                                borderBottom: '2px solid #25D36620',
                            }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: '#25D36615', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Phone size={16} color="#25D366" />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                    Línea WhatsApp
                                </h4>
                                <span style={{
                                    background: edits.is_active ? '#DCFCE7' : '#FEF2F2',
                                    color: edits.is_active ? '#16A34A' : '#EF4444',
                                    fontSize: '0.65rem', fontWeight: 700,
                                    padding: '2px 8px', borderRadius: '8px',
                                }}>
                                    {edits.is_active ? 'Activa' : 'Inactiva'}
                                </span>
                            </div>

                            <div style={{
                                borderRadius: '12px',
                                border: `2px solid ${isChanged ? '#F59E0B40' : lineColor + '30'}`,
                                background: isChanged ? '#FFFBEB' : '#fff',
                                overflow: 'hidden', transition: 'all 0.2s',
                            }}>
                                {/* Line Header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '14px 16px',
                                    background: `linear-gradient(135deg, ${lineColor}08 0%, ${lineColor}03 100%)`,
                                    borderBottom: `1px solid ${lineColor}15`,
                                }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        background: `${lineColor}20`, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <Phone size={18} color={lineColor} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1E293B' }}>
                                            {line.label}
                                        </div>
                                        <div style={{ fontSize: '0.73rem', color: '#64748B', fontFamily: 'monospace' }}>
                                            +{line.phone} · {line.id}
                                        </div>
                                    </div>

                                    {/* Active toggle */}
                                    <button
                                        onClick={() => handleLineChange(line.id, 'is_active', !edits.is_active)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '4px 10px', borderRadius: '8px',
                                            border: 'none', cursor: 'pointer',
                                            background: edits.is_active ? '#DCFCE7' : '#FEF2F2',
                                            color: edits.is_active ? '#16A34A' : '#EF4444',
                                            fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.15s',
                                        }}
                                    >
                                        {edits.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                        {edits.is_active ? 'Activa' : 'Inactiva'}
                                    </button>

                                    {/* Test button */}
                                    <button
                                        onClick={() => handleLineTest(line.id)}
                                        disabled={isTesting}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '4px 10px', borderRadius: '8px',
                                            background: testRes === 'success' ? '#DCFCE7'
                                                : testRes === 'error' ? '#FEF2F2' : '#F0F9FF',
                                            color: testRes === 'success' ? '#16A34A'
                                                : testRes === 'error' ? '#EF4444' : '#0284C7',
                                            border: 'none', cursor: isTesting ? 'wait' : 'pointer',
                                            fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.15s',
                                        }}
                                    >
                                        {isTesting ? (
                                            <><RotateCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Probando...</>
                                        ) : testRes === 'success' ? (
                                            <><CheckCircle size={12} /> OK</>
                                        ) : testRes === 'error' ? (
                                            <><AlertTriangle size={12} /> Error</>
                                        ) : (
                                            <><Zap size={12} /> Test</>
                                        )}
                                    </button>

                                    {/* Save button */}
                                    <button
                                        onClick={() => handleLineSave(line.id)}
                                        disabled={!isChanged || isSaving}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            padding: '4px 12px', borderRadius: '8px',
                                            background: isChanged ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'var(--neutral-100)',
                                            color: isChanged ? '#fff' : 'var(--neutral-400)',
                                            border: 'none', cursor: isChanged ? 'pointer' : 'not-allowed',
                                            fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.15s',
                                        }}
                                    >
                                        {isSaving ? <RotateCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                                        {isSaving ? '...' : 'Guardar'}
                                    </button>
                                </div>

                                {/* Line Fields */}
                                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* API Key */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                            <Key size={12} color="var(--neutral-400)" />
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)' }}>
                                                API Key de BuilderBot
                                            </label>
                                            <Shield size={10} color="#EAB308" title="Dato sensible" />
                                            <button
                                                onClick={() => toggleLineSecret(`${line.id}_api`)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: '1px' }}
                                            >
                                                {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                                            </button>
                                        </div>
                                        <input
                                            type={showApiKey ? 'text' : 'password'}
                                            value={edits.api_key || ''}
                                            onChange={e => handleLineChange(line.id, 'api_key', e.target.value)}
                                            placeholder="bb-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                            style={{
                                                width: '100%', padding: '8px 12px', borderRadius: '8px',
                                                border: '1px solid var(--neutral-200)', fontSize: '0.8rem',
                                                fontFamily: 'monospace', background: '#FAFAFA',
                                                boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>

                                    {/* Project ID */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                            <Globe size={12} color="var(--neutral-400)" />
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)' }}>
                                                Project ID de BuilderBot
                                            </label>
                                        </div>
                                        <input
                                            type="text"
                                            value={edits.project_id || ''}
                                            onChange={e => handleLineChange(line.id, 'project_id', e.target.value)}
                                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                            style={{
                                                width: '100%', padding: '8px 12px', borderRadius: '8px',
                                                border: '1px solid var(--neutral-200)', fontSize: '0.8rem',
                                                fontFamily: 'monospace', background: '#FAFAFA',
                                                boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>

                                    {/* Webhook URL (readonly) */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                            <ExternalLink size={12} color="var(--neutral-400)" />
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-600)' }}>
                                                URL del Webhook
                                            </label>
                                            <span style={{ fontSize: '0.6rem', color: '#94A3B8', fontWeight: 500 }}>(copiar en BuilderBot)</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <input
                                                type="text"
                                                value={webhookUrl}
                                                readOnly
                                                style={{
                                                    flex: 1, padding: '8px 12px', borderRadius: '8px',
                                                    border: '1px solid var(--neutral-200)', fontSize: '0.72rem',
                                                    fontFamily: 'monospace', background: 'var(--neutral-50)',
                                                    color: 'var(--neutral-500)', cursor: 'default',
                                                }}
                                            />
                                            <button
                                                onClick={() => handleCopy(webhookUrl)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    padding: '8px 12px', borderRadius: '8px',
                                                    background: 'var(--neutral-100)', border: '1px solid var(--neutral-200)',
                                                    cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                                                    color: 'var(--neutral-600)', transition: 'all 0.15s',
                                                }}
                                            >
                                                <Copy size={12} /> Copiar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ========== SECCIONES POR CATEGORÍA (app_config) ========== */}
                {Object.entries(grouped).map(([category, items]) => {
                    const catMeta = CATEGORY_LABELS[category] || { label: category, icon: Settings, color: '#64748B' };
                    const CatIcon = catMeta.icon;

                    return (
                        <div key={category} style={{ marginTop: '24px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                marginBottom: '16px', paddingBottom: '8px',
                                borderBottom: `2px solid ${catMeta.color}20`,
                            }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: `${catMeta.color}15`, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <CatIcon size={16} color={catMeta.color} />
                                </div>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                    {catMeta.label}
                                </h4>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {items.map(config => {
                                    const meta = FIELD_META[config.key] || {};
                                    const FieldIcon = meta.icon || Settings;
                                    const isSecret = config.is_secret;
                                    const isReadOnly = meta.readOnly;
                                    const isVisible = !isSecret || showSecrets[config.key];
                                    const currentValue = editValues[config.key] || '';
                                    const isConfigChanged = currentValue !== config.value;

                                    return (
                                        <div key={config.key} style={{
                                            background: isConfigChanged ? '#FFFBEB' : '#fff',
                                            borderRadius: 'var(--radius-md)',
                                            border: `1px solid ${isConfigChanged ? '#F59E0B40' : 'var(--neutral-200)'}`,
                                            padding: '14px 16px', transition: 'all 0.2s',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <FieldIcon size={14} color="var(--neutral-400)" />
                                                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--neutral-700)', flex: 1 }}>
                                                    {config.label || config.key}
                                                </label>
                                                {isSecret && (
                                                    <button
                                                        onClick={() => toggleSecret(config.key)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: '2px' }}
                                                        title={isVisible ? 'Ocultar' : 'Mostrar'}
                                                    >
                                                        {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                )}
                                                {isConfigChanged && (
                                                    <span style={{
                                                        fontSize: '0.65rem', fontWeight: 700, color: '#F59E0B',
                                                        background: '#FEF3C7', padding: '1px 6px', borderRadius: '8px',
                                                    }}>Modificado</span>
                                                )}
                                                {isSecret && <Shield size={12} color="#EAB308" title="Dato sensible" />}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {meta.options ? (
                                                    <select
                                                        value={currentValue}
                                                        onChange={e => handleChange(config.key, e.target.value)}
                                                        style={{
                                                            flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid var(--neutral-200)', fontSize: '0.82rem',
                                                            fontFamily: 'monospace', background: '#FAFAFA',
                                                        }}
                                                    >
                                                        {meta.options.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={isSecret && !isVisible ? 'password' : 'text'}
                                                        value={currentValue}
                                                        onChange={e => handleChange(config.key, e.target.value)}
                                                        readOnly={isReadOnly}
                                                        placeholder={meta.placeholder}
                                                        style={{
                                                            flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid var(--neutral-200)', fontSize: '0.82rem',
                                                            fontFamily: 'monospace',
                                                            background: isReadOnly ? 'var(--neutral-50)' : '#FAFAFA',
                                                            color: isReadOnly ? 'var(--neutral-500)' : 'var(--neutral-800)',
                                                            cursor: isReadOnly ? 'default' : 'text',
                                                        }}
                                                    />
                                                )}
                                                {meta.copyable && (
                                                    <button
                                                        onClick={() => handleCopy(currentValue)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                                            background: 'var(--neutral-100)', border: '1px solid var(--neutral-200)',
                                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                                            color: 'var(--neutral-600)', transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        <Copy size={13} /> Copiar
                                                    </button>
                                                )}
                                                {meta.link && (
                                                    <a
                                                        href={meta.link} target="_blank" rel="noopener noreferrer"
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                                            background: 'var(--neutral-100)', border: '1px solid var(--neutral-200)',
                                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                                            color: 'var(--neutral-600)', textDecoration: 'none',
                                                        }}
                                                    >
                                                        <ExternalLink size={13} /> Abrir
                                                    </a>
                                                )}
                                            </div>
                                            {meta.description && (
                                                <p style={{
                                                    margin: '6px 0 0', fontSize: '0.72rem',
                                                    color: 'var(--neutral-400)', lineHeight: 1.4,
                                                }}>{meta.description}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {/* Footer info */}
                <div style={{
                    marginTop: '24px', padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, #EFF6FF 0%, #F0F9FF 100%)',
                    border: '1px solid #BFDBFE40',
                    fontSize: '0.73rem', color: '#1E40AF',
                    display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                    <Shield size={14} />
                    <span>
                        Las credenciales se almacenan en la tabla <strong>whatsapp_lines</strong>.
                        Los cambios en API Key y Project ID requieren <strong>re-deploy</strong> de las Edge Functions para tomar efecto.
                    </span>
                </div>
            </div>
        </div>
    );
}
