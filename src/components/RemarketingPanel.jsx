import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    RefreshCw, Users, Search, Phone, Loader2, X, ChevronRight,
    UserCheck, UserX, CalendarClock, CheckCircle2, Send,
    Clock, ArrowRight, Building2, Filter, Calendar
} from 'lucide-react';

const PIPELINE_STATES = [
    { key: 'pendiente', label: 'Pendiente', icon: Clock, color: '#94a3b8', bg: '#f8fafc' },
    { key: 'enviado', label: 'Enviado', icon: Send, color: '#3b82f6', bg: '#eff6ff' },
    { key: 'confirmo', label: 'Confirmó', icon: CheckCircle2, color: '#10b981', bg: '#ecfdf5' },
    { key: 'cancelo', label: 'Canceló', icon: UserX, color: '#ef4444', bg: '#fef2f2' },
    { key: 'reprogramo', label: 'Reprogramó', icon: CalendarClock, color: '#f59e0b', bg: '#fffbeb' },
];

const STORAGE_KEY = 'scheduled_checkups_v1';

function loadTracking() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveTracking(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function RemarketingPanel({ addToast }) {
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tracking, setTracking] = useState(() => loadTracking());
    const [search, setSearch] = useState('');
    const [filterState, setFilterState] = useState('todos');

    const loadData = useCallback(() => {
        setLoading(true);
        try {
            const data = loadTracking();
            setTracking(data);
            const list = Object.values(data).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            setCandidates(list);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando datos', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const updateStatus = useCallback((dni, newState) => {
        setTracking(prev => {
            const next = {
                ...prev,
                [dni]: {
                    ...prev[dni],
                    estado: newState,
                    intentos: (prev[dni]?.intentos || 0) + (newState === 'enviado' ? 1 : 0),
                }
            };
            saveTracking(next);
            
            const list = Object.values(next).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            setCandidates(list);
            
            return next;
        });
        const stateLabel = PIPELINE_STATES.find(s => s.key === newState)?.label || newState;
        addToast?.(`Estado actualizado: ${stateLabel}`, 'success');
    }, [addToast]);

    const getState = useCallback((dni) => {
        return tracking[dni]?.estado || 'pendiente';
    }, [tracking]);

    const filtered = useMemo(() => {
        let list = candidates;
        if (search.trim()) {
            const s = search.toLowerCase();
            list = list.filter(p =>
                (p.paciente && p.paciente.toLowerCase().includes(s)) ||
                (p.dni && p.dni.includes(s))
            );
        }
        if (filterState !== 'todos') {
            list = list.filter(p => getState(p.dni) === filterState);
        }
        return list;
    }, [candidates, search, filterState, getState]);

    // Funnel stats
    const funnel = useMemo(() => {
        const counts = {};
        PIPELINE_STATES.forEach(s => { counts[s.key] = 0; });
        candidates.forEach(p => {
            const state = getState(p.dni);
            if (counts[state] !== undefined) counts[state]++;
        });
        return counts;
    }, [candidates, getState]);

    const formatPhone = (phone) => {
        if (!phone) return null;
        if (phone.length === 13 && phone.startsWith('549'))
            return `+54 9 ${phone.slice(3, 6)} ${phone.slice(6, 9)}-${phone.slice(9)}`;
        return phone;
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#94a3b8' }}>
                <Loader2 size={32} className="spin" />
                <span style={{ marginTop: '10px', fontSize: '0.88rem' }}>Cargando pipeline...</span>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
                <div>
                    <h2 style={{
                        fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0,
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <CalendarClock size={20} color="#fff" />
                        </div>
                        Remarketing — Recordatorios
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px' }}>
                        Pipeline de seguimiento para pacientes con turnos confirmados a futuro
                    </p>
                </div>
                <button onClick={loadData} disabled={loading} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                    background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                    cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600,
                }}>
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
                        <div key={state.key} style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                            <button onClick={() => setFilterState(isActive ? 'todos' : state.key)} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                padding: '12px 18px', borderRadius: '12px', border: `2px solid ${isActive ? state.color : 'transparent'}`,
                                background: isActive ? state.bg : '#fff', cursor: 'pointer',
                                minWidth: '90px', transition: 'all .15s',
                                boxShadow: isActive ? `0 2px 8px ${state.color}20` : '0 1px 3px rgba(0,0,0,.04)',
                            }}>
                                <Icon size={20} color={state.color} />
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{count}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: state.color, whiteSpace: 'nowrap' }}>{state.label}</span>
                            </button>
                            {idx < PIPELINE_STATES.length - 1 && idx < 4 && (
                                <ArrowRight size={14} color="#cbd5e1" style={{ margin: '0 -2px', flexShrink: 0 }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Search */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexShrink: 0,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0 14px', height: '40px',
            }}>
                <Search size={15} color="#94a3b8" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar paciente..."
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.82rem', background: 'transparent', color: '#1e293b' }}
                />
                {search && <X size={14} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setSearch('')} />}
                {filterState !== 'todos' && (
                    <button onClick={() => setFilterState('todos')} style={{
                        padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                        fontSize: '0.72rem', fontWeight: 600, background: '#e2e8f0', color: '#475569',
                        display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                        <X size={10} /> Limpiar filtro
                    </button>
                )}
            </div>

            {/* Patient List with Status */}
            <div style={{
                flex: 1, background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                <div style={{
                    padding: '10px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc',
                    fontSize: '0.78rem', fontWeight: 700, color: '#475569',
                }}>
                    {filtered.length.toLocaleString()} pacientes en pipeline
                </div>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {filtered.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#94a3b8' }}>
                            <Users size={32} /><span style={{ marginTop: '8px' }}>Sin resultados</span>
                        </div>
                    ) : (
                        filtered.map((p, idx) => {
                            const currentState = getState(p.dni);
                            const stateInfo = PIPELINE_STATES.find(s => s.key === currentState) || PIPELINE_STATES[0];
                            const StateIcon = stateInfo.icon;
                            const trackData = tracking[p.dni];

                            return (
                                <div key={p.dni || idx} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '12px 16px', borderBottom: '1px solid #f8fafc',
                                    transition: 'all .15s',
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
                                        <div style={{
                                            fontSize: '0.82rem', fontWeight: 700, color: '#1e293b',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>{p.paciente || 'Sin nombre'}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', display: 'flex', gap: '8px' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: '#3b82f6' }}>
                                                <Calendar size={12} /> {new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </span>
                                            {p.telefono1 && <span>• {formatPhone(p.telefono1)}</span>}
                                            {trackData?.intentos > 0 && <span>• {trackData.intentos} intento(s)</span>}
                                        </div>
                                    </div>

                                    {/* Current State Badge */}
                                    <div style={{
                                        padding: '4px 10px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700,
                                        background: stateInfo.bg, color: stateInfo.color,
                                        display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                                    }}>
                                        <StateIcon size={12} />
                                        {stateInfo.label}
                                    </div>

                                    {/* State Selector */}
                                    <select
                                        value={currentState}
                                        onChange={e => updateStatus(p.dni, e.target.value)}
                                        style={{
                                            height: '32px', padding: '0 8px', borderRadius: '8px',
                                            border: '1px solid #e2e8f0', fontSize: '0.72rem',
                                            color: '#475569', cursor: 'pointer', background: '#fff',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {PIPELINE_STATES.map(s => (
                                            <option key={s.key} value={s.key}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
