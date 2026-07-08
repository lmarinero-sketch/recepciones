/**
 * NovedadesPanel — Log automático de novedades + generador de mail para Sandra
 * 
 * Muestra las altas/bajas/cambios registrados automáticamente por los triggers.
 * Genera el texto formateado del mail que Valeria envía a Sandra.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileText, Calendar, ChevronLeft, ChevronRight, Filter,
    Mail, Copy, Check, Loader2, ArrowUpRight, ArrowDownRight,
    ArrowRightLeft, RefreshCw, Building2, X, Download,
} from 'lucide-react';
import {
    fetchNovedades, fetchSedes, generarTextoMail, getPeriodoActual,
} from '../services/alquileresService';

const TIPO_CONFIG = {
    alta: { label: 'Alta', icon: ArrowUpRight, color: '#22C55E', bg: '#F0FDF4' },
    baja: { label: 'Baja', icon: ArrowDownRight, color: '#EF4444', bg: '#FEF2F2' },
    cambio_horario: { label: 'Cambio Horario', icon: ArrowRightLeft, color: '#F59E0B', bg: '#FFFBEB' },
    cambio_sede: { label: 'Cambio Sede', icon: Building2, color: '#8B5CF6', bg: '#F5F3FF' },
    cambio_consultorio: { label: 'Cambio Cons.', icon: ArrowRightLeft, color: '#3B82F6', bg: '#EFF6FF' },
};

function parsePeriodo(p) { const [y, m] = p.split('-').map(Number); return { year: y, month: m }; }
function formatPeriodo(p) {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const { year, month } = parsePeriodo(p);
    return `${meses[month - 1]} ${year}`;
}
function shiftPeriodo(p, delta) {
    const { year, month } = parsePeriodo(p);
    const d = new Date(year, month - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function NovedadesPanel({ addToast }) {
    const [periodo, setPeriodo] = useState(getPeriodoActual());
    const [novedades, setNovedades] = useState([]);
    const [sedes, setSedes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const [filtroSede, setFiltroSede] = useState('todas');
    const [showMailPreview, setShowMailPreview] = useState(false);
    const [copied, setCopied] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [nov, sed] = await Promise.all([
                fetchNovedades(periodo),
                fetchSedes(),
            ]);
            setNovedades(nov);
            setSedes(sed);
        } catch (err) {
            addToast?.('Error cargando novedades: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [periodo, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const filtered = useMemo(() => {
        return novedades.filter(n => {
            if (filtroTipo !== 'todos' && n.tipo !== filtroTipo) return false;
            if (filtroSede !== 'todas' && n.sede_id !== filtroSede) return false;
            return true;
        });
    }, [novedades, filtroTipo, filtroSede]);

    const mailTexto = useMemo(() => {
        return generarTextoMail(novedades, sedes, periodo);
    }, [novedades, sedes, periodo]);

    const handleCopy = () => {
        navigator.clipboard.writeText(mailTexto).then(() => {
            setCopied(true);
            addToast?.('Texto copiado al portapapeles', 'success');
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const countByType = useMemo(() => {
        const counts = { alta: 0, baja: 0, cambio_horario: 0, cambio_sede: 0, cambio_consultorio: 0 };
        novedades.forEach(n => { if (counts[n.tipo] !== undefined) counts[n.tipo]++; });
        return counts;
    }, [novedades]);

    return (
        <div className="content" style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {/* Periodo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, -1))} style={iconBtn}><ChevronLeft size={16} /></button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--neutral-700)', minWidth: '130px', textAlign: 'center' }}>
                            <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {formatPeriodo(periodo)}
                        </span>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, 1))} style={iconBtn}><ChevronRight size={16} /></button>
                    </div>
                    <button onClick={loadData} style={iconBtn} title="Recargar"><RefreshCw size={14} /></button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setShowMailPreview(true)} style={{
                        padding: '8px 16px', borderRadius: '8px',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
                        color: 'white', border: 'none', fontWeight: 600,
                        fontSize: '0.82rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                        <Mail size={14} /> Generar Mail para Sandra
                    </button>
                </div>
            </div>

            {/* Counters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
                    <button
                        key={key}
                        onClick={() => setFiltroTipo(filtroTipo === key ? 'todos' : key)}
                        style={{
                            padding: '6px 14px', borderRadius: '20px',
                            border: filtroTipo === key ? `2px solid ${cfg.color}` : '1px solid var(--neutral-200)',
                            background: filtroTipo === key ? cfg.bg : 'white',
                            color: cfg.color, fontWeight: 600, fontSize: '0.78rem',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                        }}
                    >
                        <cfg.icon size={12} /> {cfg.label} ({countByType[key]})
                    </button>
                ))}
                {/* Sede filter */}
                <select
                    value={filtroSede}
                    onChange={e => setFiltroSede(e.target.value)}
                    style={{
                        marginLeft: 'auto', padding: '6px 12px', borderRadius: '8px',
                        border: '1px solid var(--neutral-200)', fontSize: '0.78rem',
                        color: 'var(--neutral-600)', cursor: 'pointer',
                    }}
                >
                    <option value="todas">Todas las sedes</option>
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
            </div>

            {/* Novedades list */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={28} className="spin" style={{ color: 'var(--primary-400)' }} />
                </div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--neutral-400)' }}>
                    <FileText size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <p style={{ fontSize: '0.88rem' }}>No hay novedades para este período</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map(n => {
                        const cfg = TIPO_CONFIG[n.tipo] || TIPO_CONFIG.alta;
                        const Icon = cfg.icon;
                        return (
                            <div key={n.id} style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '12px 16px', borderRadius: '10px',
                                border: '1px solid var(--neutral-100)',
                                background: 'white', transition: 'all 0.15s',
                            }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: cfg.bg, display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <Icon size={16} style={{ color: cfg.color }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--neutral-800)' }}>
                                        {n.descripcion}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', marginTop: '2px' }}>
                                        {n.sede?.nombre && <span>{n.sede.nombre} · </span>}
                                        {new Date(n.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <span style={{
                                    padding: '3px 10px', borderRadius: '12px', fontSize: '0.68rem',
                                    fontWeight: 600, background: cfg.bg, color: cfg.color,
                                }}>
                                    {cfg.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Mail Preview Modal */}
            {showMailPreview && (
                <div onClick={e => { if (e.target === e.currentTarget) setShowMailPreview(false); }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 100,
                        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                    }}
                >
                    <div style={{
                        background: 'white', borderRadius: '16px',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
                        maxHeight: '85vh', overflowY: 'auto',
                        maxWidth: '640px', width: '100%', padding: '24px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                <Mail size={18} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary-500)' }} />
                                Mail de Novedades — {formatPeriodo(periodo)}
                            </h3>
                            <button onClick={() => setShowMailPreview(false)} style={iconBtn}><X size={18} /></button>
                        </div>
                        <pre style={{
                            background: 'var(--neutral-50)', borderRadius: '10px',
                            padding: '16px', fontSize: '0.78rem', lineHeight: 1.6,
                            whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                            color: 'var(--neutral-700)', border: '1px solid var(--neutral-200)',
                            maxHeight: '50vh', overflowY: 'auto',
                        }}>
                            {mailTexto}
                        </pre>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                            <button onClick={handleCopy} style={{
                                padding: '10px 20px', borderRadius: '8px',
                                background: copied ? '#22C55E' : 'var(--primary-500)',
                                color: 'white', border: 'none', fontWeight: 600,
                                fontSize: '0.82rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                transition: 'all 0.2s',
                            }}>
                                {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar al portapapeles</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const iconBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '30px', height: '30px', borderRadius: '8px',
    border: '1px solid var(--neutral-200)', background: 'white',
    cursor: 'pointer', color: 'var(--neutral-500)',
};
