/**
 * OcupacionPanel — Grilla interactiva de ocupación de consultorios
 * 
 * Componente principal del módulo de Alquileres.
 * Muestra una grilla día × franja × consultorio para cada sede.
 * Permite asignar, desasignar y mover médicos entre slots.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Building2, Calendar, ChevronLeft, ChevronRight, UserPlus, UserMinus,
    ArrowRightLeft, X, Search, Check, AlertCircle, BarChart3, RefreshCw,
    User, Stethoscope, Hash, Loader2, Plus, Trash2, GripVertical,
} from 'lucide-react';
import {
    fetchSedes, fetchConsultorios, fetchAsignaciones,
    fetchMedicos, asignarMedico, desasignarMedico, moverMedico,
    createMedico,
    buildGrilla, calcularMetricasLocal, getPeriodoActual,
    DIAS, FRANJAS, DIAS_LABELS, FRANJAS_LABELS,
} from '../services/alquileresService';

// ── Periodo helpers ──
function parsePeriodo(p) {
    const [y, m] = p.split('-').map(Number);
    return { year: y, month: m };
}
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

// ── Franja colors ──
const FRANJA_COLORS = {
    'mañana': { bg: '#EFF6FF', border: '#3B82F6', dot: '#3B82F6' },
    'siesta': { bg: '#FFF7ED', border: '#F59E0B', dot: '#F59E0B' },
    'tarde':  { bg: '#F0FDF4', border: '#22C55E', dot: '#22C55E' },
};

export default function OcupacionPanel({ addToast }) {
    // ── State ──
    const [sedes, setSedes] = useState([]);
    const [selectedSede, setSelectedSede] = useState(null);
    const [consultorios, setConsultorios] = useState([]);
    const [asignaciones, setAsignaciones] = useState([]);
    const [periodo, setPeriodo] = useState(getPeriodoActual());
    const [loading, setLoading] = useState(true);
    const [grilla, setGrilla] = useState({});
    const [metricas, setMetricas] = useState(null);

    // Modal state
    const [modal, setModal] = useState(null); // { type: 'asignar'|'detalle'|'mover', ... }
    const [medicos, setMedicos] = useState([]);
    const [medicoSearch, setMedicoSearch] = useState('');
    const [saving, setSaving] = useState(false);

    // New medico inline
    const [showNewMedico, setShowNewMedico] = useState(false);
    const [newMedico, setNewMedico] = useState({ nombre: '', apellido: '', matricula: '', especialidad: '' });

    // ── Load sedes on mount ──
    useEffect(() => {
        (async () => {
            try {
                const sedesData = await fetchSedes();
                setSedes(sedesData);
                if (sedesData.length > 0) setSelectedSede(sedesData[0]);
            } catch (err) {
                addToast?.('Error cargando sedes: ' + err.message, 'error');
            }
        })();
    }, []);

    // ── Load consultorios + asignaciones when sede or periodo changes ──
    const loadData = useCallback(async () => {
        if (!selectedSede) return;
        setLoading(true);
        try {
            const [cons, asig] = await Promise.all([
                fetchConsultorios(selectedSede.id),
                fetchAsignaciones(periodo, selectedSede.id),
            ]);
            setConsultorios(cons);
            setAsignaciones(asig);
            const g = buildGrilla(asig, cons);
            setGrilla(g);
            setMetricas(calcularMetricasLocal(g, cons));
        } catch (err) {
            addToast?.('Error cargando datos: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [selectedSede, periodo, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Filtered consultorios (only alquilable for metrics, show all in grid) ──
    const alquilableConsultorios = useMemo(() => consultorios.filter(c => c.es_alquilable), [consultorios]);

    // ── Load medicos for modal ──
    useEffect(() => {
        if (modal?.type === 'asignar' || modal?.type === 'mover') {
            fetchMedicos({ estado: 'activo' }).then(setMedicos).catch(() => {});
        }
    }, [modal?.type]);

    const filteredMedicos = useMemo(() => {
        if (!medicoSearch) return medicos;
        const s = medicoSearch.toLowerCase();
        return medicos.filter(m => 
            m.nombre_display?.toLowerCase().includes(s) || 
            m.matricula?.includes(s) ||
            m.especialidad?.toLowerCase().includes(s)
        );
    }, [medicos, medicoSearch]);

    // ── Handlers ──
    const handleCellClick = (consultorio, dia, franja) => {
        const asig = grilla[consultorio.id]?.[dia]?.[franja];
        if (asig) {
            setModal({ type: 'detalle', asignacion: asig, consultorio, dia, franja });
        } else {
            if (dia === 'sabado' && franja !== 'mañana') return; // No slot
            setModal({ type: 'asignar', consultorio, dia, franja });
            setMedicoSearch('');
        }
    };

    const handleAsignar = async (medico) => {
        if (!modal || saving) return;
        setSaving(true);
        try {
            await asignarMedico({
                consultorioId: modal.consultorio.id,
                dia: modal.dia,
                franja: modal.franja,
                medicoId: medico.id,
                periodo,
            });
            // Novedad se registra automáticamente via trigger SQL
            addToast?.(`${medico.nombre_display} asignado correctamente`, 'success');
            setModal(null);
            await loadData();
        } catch (err) {
            addToast?.(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDesasignar = async () => {
        if (!modal?.asignacion || saving) return;
        setSaving(true);
        try {
            const a = modal.asignacion;
            await desasignarMedico(a.id);
            // Novedad se registra automáticamente via trigger SQL
            addToast?.(`${a.medico?.nombre_display} dado de baja del slot`, 'success');
            setModal(null);
            await loadData();
        } catch (err) {
            addToast?.(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateMedico = async () => {
        if (!newMedico.nombre || !newMedico.apellido || saving) return;
        setSaving(true);
        try {
            const display = `${newMedico.apellido.toUpperCase()} ${newMedico.nombre.charAt(0).toUpperCase()}`;
            const created = await createMedico({
                ...newMedico,
                nombre_display: display,
            });
            addToast?.(`Médico ${display} creado`, 'success');
            setMedicos(prev => [...prev, created].sort((a, b) => a.nombre_display.localeCompare(b.nombre_display)));
            setNewMedico({ nombre: '', apellido: '', matricula: '', especialidad: '' });
            setShowNewMedico(false);
        } catch (err) {
            addToast?.(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── Render ──
    if (loading && sedes.length === 0) {
        return (
            <div className="content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <Loader2 size={32} className="spin" style={{ color: 'var(--primary-500)' }} />
            </div>
        );
    }

    return (
        <div className="content" style={{ padding: '0' }}>
            {/* ── Top Bar: Sede tabs + Periodo selector + Metrics ── */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 20,
                background: 'white', borderBottom: '1px solid var(--neutral-200)',
                padding: '16px 24px',
            }}>
                {/* Sede Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Building2 size={18} style={{ color: 'var(--neutral-400)' }} />
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {sedes.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSelectedSede(s)}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    border: selectedSede?.id === s.id ? '2px solid var(--primary-500)' : '1px solid var(--neutral-200)',
                                    background: selectedSede?.id === s.id ? 'var(--primary-50)' : 'white',
                                    color: selectedSede?.id === s.id ? 'var(--primary-700)' : 'var(--neutral-600)',
                                    fontWeight: selectedSede?.id === s.id ? 700 : 500,
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {s.nombre}
                            </button>
                        ))}
                    </div>

                    {/* Periodo selector */}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, -1))} style={{ ...iconBtnStyle }}>
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-700)', minWidth: '130px', textAlign: 'center' }}>
                            <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {formatPeriodo(periodo)}
                        </span>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, 1))} style={{ ...iconBtnStyle }}>
                            <ChevronRight size={16} />
                        </button>
                        <button onClick={loadData} title="Recargar" style={{ ...iconBtnStyle }}>
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>

                {/* Metrics bar */}
                {metricas && (
                    <div style={{
                        display: 'flex', gap: '24px', alignItems: 'center',
                        padding: '8px 16px',
                        background: 'var(--neutral-50)',
                        borderRadius: '10px',
                        fontSize: '0.8rem',
                    }}>
                        <MetricBadge icon={<BarChart3 size={14} />} label="Ocupación" value={`${metricas.totalOcupado}/${metricas.totalDisponible}`} accent="var(--primary-500)" />
                        <MetricBadge icon={null} label="Tasa" value={`${metricas.tasaGeneral}%`} accent={metricas.tasaGeneral >= 90 ? '#22C55E' : metricas.tasaGeneral >= 70 ? '#F59E0B' : '#EF4444'} />
                        <MetricBadge icon={null} label="Ocupados" value={metricas.totalOcupado} accent="#3B82F6" />
                        <MetricBadge icon={null} label="Libres" value={metricas.totalLibre} accent="#94A3B8" />
                    </div>
                )}
            </div>

            {/* ── Grilla ── */}
            <div style={{ padding: '16px 24px', overflowX: 'auto' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                        <Loader2 size={28} className="spin" style={{ color: 'var(--primary-400)' }} />
                    </div>
                ) : (
                    <table style={{
                        width: '100%',
                        borderCollapse: 'separate',
                        borderSpacing: '0',
                        fontSize: '0.72rem',
                    }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, width: '100px', position: 'sticky', left: 0, zIndex: 10, background: 'white' }}>Día / Franja</th>
                                {consultorios.map(c => (
                                    <th key={c.id} style={{
                                        ...thStyle,
                                        minWidth: '90px',
                                        background: !c.es_alquilable ? '#FEF3C7' : 'var(--neutral-50)',
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            <span style={{ fontWeight: 700 }}>Cons. {c.numero}</span>
                                            {metricas?.porConsultorio?.[c.id] && c.es_alquilable && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    color: metricas.porConsultorio[c.id].tasa >= 90 ? '#22C55E' : metricas.porConsultorio[c.id].tasa >= 70 ? '#F59E0B' : '#EF4444',
                                                    fontWeight: 600,
                                                }}>
                                                    {metricas.porConsultorio[c.id].tasa}%
                                                </span>
                                            )}
                                            {!c.es_alquilable && (
                                                <span style={{ fontSize: '0.6rem', color: '#92400E', fontWeight: 600 }}>{c.tipo === 'sum' ? 'PEDIATRÍA' : c.tipo.toUpperCase()}</span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {DIAS.map(dia => (
                                FRANJAS.map((franja, fi) => {
                                    // Skip siesta/tarde for sabado
                                    if (dia === 'sabado' && franja !== 'mañana') return null;
                                    const isFirstFranja = fi === 0;
                                    const franjaCount = dia === 'sabado' ? 1 : 3;

                                    return (
                                        <tr key={`${dia}-${franja}`}>
                                            <td style={{
                                                ...tdLabelStyle,
                                                position: 'sticky', left: 0, zIndex: 5,
                                                background: 'white',
                                                borderTop: isFirstFranja ? '2px solid var(--neutral-300)' : 'none',
                                            }}>
                                                {isFirstFranja && (
                                                    <div style={{
                                                        fontWeight: 800, fontSize: '0.72rem', color: 'var(--neutral-700)',
                                                        marginBottom: '2px', letterSpacing: '0.03em',
                                                    }}>
                                                        {DIAS_LABELS[dia]}
                                                    </div>
                                                )}
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    color: FRANJA_COLORS[franja].dot,
                                                    fontWeight: 600, fontSize: '0.68rem',
                                                }}>
                                                    <div style={{
                                                        width: '6px', height: '6px', borderRadius: '50%',
                                                        background: FRANJA_COLORS[franja].dot,
                                                    }} />
                                                    {FRANJAS_LABELS[franja]}
                                                </div>
                                            </td>
                                            {consultorios.map(c => {
                                                const asig = grilla[c.id]?.[dia]?.[franja];
                                                const isOccupied = !!asig;
                                                const isDisabled = !c.es_alquilable || (dia === 'sabado' && franja !== 'mañana');

                                                return (
                                                    <td
                                                        key={c.id}
                                                        onClick={() => !isDisabled && handleCellClick(c, dia, franja)}
                                                        style={{
                                                            ...tdCellStyle,
                                                            borderTop: isFirstFranja ? '2px solid var(--neutral-300)' : '1px solid var(--neutral-100)',
                                                            background: isDisabled ? '#F9FAFB' :
                                                                isOccupied ? FRANJA_COLORS[franja].bg : 'white',
                                                            cursor: isDisabled ? 'default' : 'pointer',
                                                            transition: 'all 0.15s',
                                                        }}
                                                        onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--primary-300)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                                                        title={isOccupied ? `${asig.medico?.nombre_display}\n${asig.medico?.especialidad || ''}\nMat: ${asig.medico?.matricula || 'S/N'}` : 'Click para asignar'}
                                                    >
                                                        {isOccupied ? (
                                                            <div style={{
                                                                fontWeight: 600,
                                                                color: 'var(--neutral-800)',
                                                                fontSize: '0.7rem',
                                                                lineHeight: 1.2,
                                                                textAlign: 'center',
                                                            }}>
                                                                {asig.medico?.nombre_display}
                                                                {asig.es_residente && (
                                                                    <span style={{ display: 'block', fontSize: '0.55rem', color: '#7C3AED', fontWeight: 700 }}>RESIDENTE</span>
                                                                )}
                                                                {asig.es_rotativo && (
                                                                    <span style={{ display: 'block', fontSize: '0.55rem', color: '#0891B2', fontWeight: 700 }}>ROTATIVO</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            !isDisabled && (
                                                                <Plus size={12} style={{ color: 'var(--neutral-300)' }} />
                                                            )
                                                        )}
                                                        {isDisabled && !isOccupied && c.tipo === 'sum' && (
                                                            <span style={{ fontSize: '0.6rem', color: '#D97706', fontWeight: 600 }}>PED</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Modal: Asignar Médico ── */}
            {modal?.type === 'asignar' && (
                <ModalOverlay onClose={() => setModal(null)}>
                    <div style={{ padding: '24px', maxWidth: '480px', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                <UserPlus size={18} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary-500)' }} />
                                Asignar Médico
                            </h3>
                            <button onClick={() => setModal(null)} style={iconBtnStyle}><X size={18} /></button>
                        </div>
                        <div style={{
                            padding: '10px 14px', borderRadius: '8px', background: 'var(--neutral-50)',
                            marginBottom: '16px', fontSize: '0.8rem', color: 'var(--neutral-600)',
                        }}>
                            <strong>Consultorio {modal.consultorio.numero}</strong> · {DIAS_LABELS[modal.dia]} · {FRANJAS_LABELS[modal.franja]}
                        </div>

                        {/* Search */}
                        <div style={{ position: 'relative', marginBottom: '12px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--neutral-400)' }} />
                            <input
                                type="text"
                                placeholder="Buscar médico por nombre, matrícula o especialidad..."
                                value={medicoSearch}
                                onChange={e => setMedicoSearch(e.target.value)}
                                autoFocus
                                style={{
                                    width: '100%', padding: '8px 12px 8px 32px',
                                    borderRadius: '8px', border: '1px solid var(--neutral-200)',
                                    fontSize: '0.82rem', outline: 'none',
                                }}
                            />
                        </div>

                        {/* Medicos list */}
                        <div style={{ maxHeight: '280px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--neutral-200)' }}>
                            {filteredMedicos.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => handleAsignar(m)}
                                    disabled={saving}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        width: '100%', padding: '10px 14px',
                                        border: 'none', borderBottom: '1px solid var(--neutral-100)',
                                        background: 'white', cursor: 'pointer', textAlign: 'left',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-50)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                >
                                    <User size={16} style={{ color: 'var(--neutral-400)', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--neutral-800)' }}>{m.nombre_display}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--neutral-500)' }}>
                                            {m.especialidad && <span>{m.especialidad} · </span>}
                                            {m.matricula && <span>Mat. {m.matricula}</span>}
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {filteredMedicos.length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--neutral-400)', fontSize: '0.82rem' }}>
                                    No se encontraron médicos
                                </div>
                            )}
                        </div>

                        {/* New medico */}
                        <div style={{ marginTop: '12px' }}>
                            {!showNewMedico ? (
                                <button onClick={() => setShowNewMedico(true)} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 14px', borderRadius: '8px', border: '1px dashed var(--neutral-300)',
                                    background: 'white', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--neutral-500)',
                                    width: '100%', justifyContent: 'center',
                                }}>
                                    <Plus size={14} /> Crear nuevo médico
                                </button>
                            ) : (
                                <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--primary-200)', background: 'var(--primary-50)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                        <input placeholder="Nombre" value={newMedico.nombre} onChange={e => setNewMedico(p => ({ ...p, nombre: e.target.value }))} style={inputStyle} />
                                        <input placeholder="Apellido" value={newMedico.apellido} onChange={e => setNewMedico(p => ({ ...p, apellido: e.target.value }))} style={inputStyle} />
                                        <input placeholder="Matrícula" value={newMedico.matricula} onChange={e => setNewMedico(p => ({ ...p, matricula: e.target.value }))} style={inputStyle} />
                                        <input placeholder="Especialidad" value={newMedico.especialidad} onChange={e => setNewMedico(p => ({ ...p, especialidad: e.target.value }))} style={inputStyle} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setShowNewMedico(false)} style={{ ...btnSmall, background: 'white' }}>Cancelar</button>
                                        <button onClick={handleCreateMedico} disabled={!newMedico.nombre || !newMedico.apellido || saving} style={{ ...btnSmall, background: 'var(--primary-500)', color: 'white' }}>
                                            {saving ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Crear
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </ModalOverlay>
            )}

            {/* ── Modal: Detalle / Desasignar ── */}
            {modal?.type === 'detalle' && (
                <ModalOverlay onClose={() => setModal(null)}>
                    <div style={{ padding: '24px', maxWidth: '400px', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                <Stethoscope size={18} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--primary-500)' }} />
                                Detalle del Slot
                            </h3>
                            <button onClick={() => setModal(null)} style={iconBtnStyle}><X size={18} /></button>
                        </div>

                        <div style={{
                            padding: '16px', borderRadius: '10px', background: 'var(--neutral-50)',
                            marginBottom: '16px',
                        }}>
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--neutral-800)', marginBottom: '8px' }}>
                                {modal.asignacion.medico?.nombre_display}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {modal.asignacion.medico?.especialidad && (
                                    <span><Stethoscope size={12} style={{ marginRight: '4px' }} />{modal.asignacion.medico.especialidad}</span>
                                )}
                                {modal.asignacion.medico?.matricula && (
                                    <span><Hash size={12} style={{ marginRight: '4px' }} />Matrícula: {modal.asignacion.medico.matricula}</span>
                                )}
                                <span><Building2 size={12} style={{ marginRight: '4px' }} />Consultorio {modal.consultorio.numero} · {selectedSede?.nombre}</span>
                                <span><Calendar size={12} style={{ marginRight: '4px' }} />{DIAS_LABELS[modal.dia]} · {FRANJAS_LABELS[modal.franja]}</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleDesasignar}
                                disabled={saving}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '8px',
                                    border: '1px solid #FCA5A5', background: '#FEF2F2',
                                    color: '#DC2626', fontWeight: 600, fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', gap: '6px',
                                }}
                            >
                                {saving ? <Loader2 size={14} className="spin" /> : <UserMinus size={14} />}
                                Quitar Médico
                            </button>
                        </div>
                    </div>
                </ModalOverlay>
            )}
        </div>
    );
}

// ── Sub-components ──

function ModalOverlay({ children, onClose }) {
    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
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
                animation: 'fadeInUp 0.2s ease',
            }}>
                {children}
            </div>
        </div>
    );
}

function MetricBadge({ icon, label, value, accent }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {icon && <span style={{ color: accent }}>{icon}</span>}
            <span style={{ color: 'var(--neutral-500)', fontWeight: 500 }}>{label}:</span>
            <span style={{ color: accent, fontWeight: 700 }}>{value}</span>
        </div>
    );
}

// ── Styles ──
const iconBtnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '30px', height: '30px', borderRadius: '8px',
    border: '1px solid var(--neutral-200)', background: 'white',
    cursor: 'pointer', color: 'var(--neutral-500)',
    transition: 'all 0.15s',
};

const thStyle = {
    padding: '8px 6px',
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--neutral-600)',
    textAlign: 'center',
    background: 'var(--neutral-50)',
    borderBottom: '2px solid var(--neutral-200)',
    whiteSpace: 'nowrap',
};

const tdLabelStyle = {
    padding: '4px 10px',
    verticalAlign: 'top',
    borderRight: '2px solid var(--neutral-200)',
    whiteSpace: 'nowrap',
};

const tdCellStyle = {
    padding: '4px',
    textAlign: 'center',
    verticalAlign: 'middle',
    minHeight: '28px',
    height: '28px',
    borderRight: '1px solid var(--neutral-100)',
};

const inputStyle = {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid var(--neutral-200)',
    fontSize: '0.78rem',
    outline: 'none',
};

const btnSmall = {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid var(--neutral-200)',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
};
