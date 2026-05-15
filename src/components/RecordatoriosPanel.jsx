import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Search, Calendar, Phone, ChevronDown, Clock, X, RefreshCw,
    Users, AlertCircle, CalendarClock, ArrowLeft, ArrowRight,
    MapPin, Building2, Stethoscope, CheckCircle2, XCircle,
    Bell, CalendarDays, UserX, MessageSquare, Send
} from 'lucide-react';
import {
    fetchRecordatorios,
    fetchRecordatoriosStats,
    fetchRecordatoriosCentros,
    fetchRecordatoriosObrasSociales,
    fetchTiposAgenda,
} from '../services/recordatoriosService';
import ChatWindow from './ChatWindow';

function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

export default function RecordatoriosPanel({ addToast }) {
    // Rango: hoy por defecto (puede cambiarse)
    const [fechaDesde, setFechaDesde] = useState(() => getTodayStr());
    const [fechaHasta, setFechaHasta] = useState(() => getTodayStr());
    const [viewMode, setViewMode] = useState('hoy'); // hoy | semana | rango
    const [turnos, setTurnos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [stats, setStats] = useState({ turnosHoy: 0, turnosFuturos: 0, ausentesAyer: 0 });
    const [filtroAsistencia, setFiltroAsistencia] = useState('');
    const [tipoAgenda, setTipoAgenda] = useState('CHEQUEO');
    const [tiposAgendaList, setTiposAgendaList] = useState([]);

    // Chat
    const [chatOpen, setChatOpen] = useState(false);
    const [chatPatient, setChatPatient] = useState(null);

    // Selected row
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        if (viewMode === 'hoy') {
            const hoy = getTodayStr();
            setFechaDesde(hoy);
            setFechaHasta(hoy);
        } else if (viewMode === 'semana') {
            const hoy = getTodayStr();
            setFechaDesde(hoy);
            setFechaHasta(addDays(hoy, 6));
        }
    }, [viewMode]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, statsData] = await Promise.all([
                fetchRecordatorios({
                    fechaDesde,
                    fechaHasta,
                    search: '',
                    asistencia: filtroAsistencia || undefined,
                    tipoAgenda,
                }),
                fetchRecordatoriosStats(),
            ]);
            setTurnos(data);
            setStats(statsData);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando recordatorios', 'error');
        } finally {
            setLoading(false);
        }
    }, [fechaDesde, fechaHasta, filtroAsistencia, tipoAgenda, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Cargar tipos de agenda al montar
    useEffect(() => {
        fetchTiposAgenda().then(tipos => {
            console.log('Tipos de agenda encontrados:', tipos);
            setTiposAgendaList(tipos);
        });
    }, []);

    // Filtro de búsqueda local
    const filtered = useMemo(() => {
        if (!search.trim()) return turnos;
        const s = search.toLowerCase();
        return turnos.filter(t =>
            (t.paciente && t.paciente.toLowerCase().includes(s)) ||
            (t.dni && t.dni.includes(s)) ||
            (t.telefono1 && t.telefono1.includes(s)) ||
            (t.medico && t.medico.toLowerCase().includes(s))
        );
    }, [turnos, search]);

    // Agrupar por fecha
    const groupedByDate = useMemo(() => {
        const groups = {};
        for (const t of filtered) {
            const key = t.fecha || 'Sin fecha';
            if (!groups[key]) groups[key] = [];
            groups[key].push(t);
        }
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [filtered]);

    // Stats locales
    const localStats = useMemo(() => {
        const total = filtered.length;
        const conTel = filtered.filter(t => t.telefono1).length;
        const ausentes = filtered.filter(t => t.asistencia === 'Ausente').length;
        const presentes = filtered.filter(t => t.asistencia === 'Presente').length;
        return { total, conTel, ausentes, presentes };
    }, [filtered]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const formatPhone = (phone) => {
        if (!phone) return null;
        if (phone.length === 13 && phone.startsWith('549')) {
            return `+54 9 ${phone.slice(3, 6)} ${phone.slice(6, 9)}-${phone.slice(9)}`;
        }
        return phone;
    };

    const isToday = (dateStr) => dateStr === getTodayStr();
    const isFuture = (dateStr) => dateStr > getTodayStr();
    const isPast = (dateStr) => dateStr < getTodayStr();

    const handleOpenChat = (turno) => {
        if (!turno.telefono1) {
            addToast?.('Este paciente no tiene teléfono registrado', 'error');
            return;
        }
        setChatPatient({
            paciente: turno.paciente,
            telefono1: turno.telefono1,
            dni: turno.dni,
            obra_social: turno.obra_social,
        });
        setChatOpen(true);
    };

    const asistenciaColor = (asistencia) => {
        if (!asistencia) return { bg: '#f8fafc', color: '#94a3b8', label: 'Pendiente' };
        switch (asistencia) {
            case 'Presente': return { bg: '#ecfdf5', color: '#059669', label: 'Presente' };
            case 'Ausente': return { bg: '#fef2f2', color: '#dc2626', label: 'Ausente' };
            default: return { bg: '#fefce8', color: '#ca8a04', label: asistencia };
        }
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
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Bell size={20} color="#fff" />
                            </div>
                            Recordatorios de Turnos
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px' }}>
                            Turnos agendados (CHQ/ECO) — Desde el sync de SALUS
                        </p>
                    </div>
                    <button onClick={loadData} disabled={loading} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                        background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                        cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600,
                    }}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
                    </button>
                </div>

                {/* View Mode Tabs */}
                <div style={{
                    display: 'flex', gap: '4px', marginBottom: '14px',
                    background: '#f1f5f9', borderRadius: '10px', padding: '4px',
                }}>
                    {[
                        { key: 'hoy', label: 'Hoy', icon: CalendarDays },
                        { key: 'semana', label: 'Próximos 7 días', icon: CalendarClock },
                        { key: 'rango', label: 'Rango personalizado', icon: Calendar },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setViewMode(tab.key)}
                            style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '6px', padding: '8px 12px', border: 'none', borderRadius: '8px',
                                fontSize: '0.82rem', fontWeight: viewMode === tab.key ? 700 : 500,
                                cursor: 'pointer', transition: 'all .15s',
                                background: viewMode === tab.key ? '#fff' : 'transparent',
                                color: viewMode === tab.key ? '#1d4ed8' : '#64748b',
                                boxShadow: viewMode === tab.key ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                            }}
                        >
                            <tab.icon size={14} /> {tab.label}
                        </button>
                    ))}
                </div>

                {/* Custom Range (only visible in rango mode) */}
                {viewMode === 'rango' && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px',
                        padding: '10px 16px', background: '#eff6ff', borderRadius: '10px',
                        border: '1px solid #dbeafe',
                    }}>
                        <Calendar size={16} color="#3b82f6" />
                        <span style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 600 }}>Desde:</span>
                        <input type="date" value={fechaDesde}
                            onChange={e => e.target.value && setFechaDesde(e.target.value)}
                            style={{
                                padding: '5px 10px', borderRadius: '8px', border: '1px solid #dbeafe',
                                fontSize: '0.82rem', fontWeight: 600, color: '#1d4ed8', background: '#fff',
                            }}
                        />
                        <span style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 600 }}>Hasta:</span>
                        <input type="date" value={fechaHasta}
                            onChange={e => e.target.value && setFechaHasta(e.target.value)}
                            style={{
                                padding: '5px 10px', borderRadius: '8px', border: '1px solid #dbeafe',
                                fontSize: '0.82rem', fontWeight: 600, color: '#1d4ed8', background: '#fff',
                            }}
                        />
                    </div>
                )}

                {/* Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    {[
                        { label: 'Turnos Hoy', value: stats.turnosHoy, icon: CalendarDays, color: '#3b82f6', bg: '#eff6ff' },
                        { label: 'Turnos Futuros', value: stats.turnosFuturos, icon: CalendarClock, color: '#8b5cf6', bg: '#f5f3ff' },
                        { label: 'Ausentes Ayer', value: stats.ausentesAyer, icon: UserX, color: '#ef4444', bg: '#fef2f2' },
                        { label: 'En Vista', value: localStats.total, icon: Users, color: '#10b981', bg: '#ecfdf5' },
                    ].map((stat, i) => (
                        <div key={i} style={{
                            background: '#fff', borderRadius: '12px', padding: '14px',
                            border: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                            <div style={{
                                width: '38px', height: '38px', borderRadius: '10px',
                                background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <stat.icon size={18} color={stat.color} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>{stat.value}</div>
                                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500 }}>{stat.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Search + Filters */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                        padding: '0 14px', height: '40px',
                    }}>
                        <Search size={16} color="#94a3b8" />
                        <input
                            type="text" value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, DNI, teléfono o médico..."
                            style={{
                                flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem',
                                background: 'transparent', color: '#1e293b',
                            }}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#94a3b8',
                            }}><X size={14} /></button>
                        )}
                    </div>

                    {/* Filtro asistencia */}
                    <select
                        value={filtroAsistencia}
                        onChange={e => setFiltroAsistencia(e.target.value)}
                        style={{
                            padding: '0 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
                            fontSize: '0.82rem', fontWeight: 600, color: '#475569', background: '#fff',
                            cursor: 'pointer', minWidth: '160px',
                        }}
                    >
                        <option value="">Todas las asistencias</option>
                        <option value="Presente">✅ Presente</option>
                        <option value="Ausente">❌ Ausente</option>
                    </select>

                    {/* Filtro tipo agenda */}
                    <select
                        value={tipoAgenda}
                        onChange={e => setTipoAgenda(e.target.value)}
                        style={{
                            padding: '0 14px', borderRadius: '10px', border: '1px solid #e2e8f0',
                            fontSize: '0.82rem', fontWeight: 600, color: '#475569', background: '#fff',
                            cursor: 'pointer', minWidth: '140px',
                        }}
                    >
                        <option value="todos">📋 Todos los tipos</option>
                        {tiposAgendaList.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Main Content — Scrollable */}
            <div style={{ flex: 1, overflow: 'auto', borderRadius: '12px' }}>
                {loading ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        height: '300px', color: '#94a3b8', gap: '12px',
                    }}>
                        <RefreshCw size={28} className="spin" />
                        <span style={{ fontSize: '0.9rem' }}>Cargando turnos...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        height: '300px', color: '#94a3b8', gap: '12px',
                    }}>
                        <Calendar size={40} />
                        <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>No hay turnos en este rango</span>
                        <span style={{ fontSize: '0.8rem' }}>Probá cambiar las fechas o el filtro</span>
                    </div>
                ) : (
                    groupedByDate.map(([fecha, items]) => {
                        const today = isToday(fecha);
                        const future = isFuture(fecha);

                        return (
                            <div key={fecha} style={{ marginBottom: '16px' }}>
                                {/* Date header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '8px 16px', marginBottom: '6px',
                                    background: today
                                        ? 'linear-gradient(135deg, #eff6ff, #dbeafe)'
                                        : future ? '#f5f3ff' : '#f8fafc',
                                    borderRadius: '10px',
                                    border: today ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                }}>
                                    <CalendarDays size={16} color={today ? '#2563eb' : future ? '#7c3aed' : '#64748b'} />
                                    <span style={{
                                        fontSize: '0.85rem', fontWeight: 700,
                                        color: today ? '#1d4ed8' : future ? '#6d28d9' : '#475569',
                                        textTransform: 'capitalize',
                                    }}>
                                        {today ? '📍 HOY — ' : ''}{formatDate(fecha)}
                                    </span>
                                    <span style={{
                                        fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto',
                                        fontWeight: 600,
                                    }}>
                                        {items.length} turno{items.length !== 1 ? 's' : ''}
                                    </span>
                                </div>

                                {/* Items */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {items.map(turno => {
                                        const asis = asistenciaColor(turno.asistencia);
                                        const isSelected = selectedId === turno.id;

                                        return (
                                            <div
                                                key={turno.id}
                                                onClick={() => setSelectedId(isSelected ? null : turno.id)}
                                                style={{
                                                    background: isSelected ? '#f8fafc' : '#fff',
                                                    border: `1px solid ${isSelected ? '#cbd5e1' : '#f1f5f9'}`,
                                                    borderRadius: '10px', padding: '12px 16px',
                                                    cursor: 'pointer', transition: 'all .15s',
                                                    display: 'flex', flexDirection: 'column', gap: '6px',
                                                }}
                                            >
                                                {/* Row 1: Main info */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    {/* Hora */}
                                                    <div style={{
                                                        minWidth: '52px', padding: '4px 8px', borderRadius: '6px',
                                                        background: '#f1f5f9', textAlign: 'center',
                                                    }}>
                                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                                                            {turno.hora || '--:--'}
                                                        </span>
                                                    </div>

                                                    {/* Paciente */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            fontSize: '0.88rem', fontWeight: 700, color: '#1e293b',
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        }}>
                                                            {turno.paciente}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                                                            {turno.dni && <span>DNI: {turno.dni}</span>}
                                                            {turno.obra_social && <span>OS: {turno.obra_social}</span>}
                                                        </div>
                                                    </div>

                                                    {/* Médico */}
                                                    {turno.medico && (
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            fontSize: '0.75rem', color: '#64748b', maxWidth: '200px',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>
                                                            <Stethoscope size={12} />
                                                            {turno.medico}
                                                        </div>
                                                    )}

                                                    {/* Asistencia badge */}
                                                    <div style={{
                                                        padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem',
                                                        fontWeight: 700, background: asis.bg, color: asis.color,
                                                    }}>
                                                        {asis.label}
                                                    </div>

                                                    {/* WhatsApp button */}
                                                    {turno.telefono1 && (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); handleOpenChat(turno); }}
                                                            title="Enviar recordatorio"
                                                            style={{
                                                                width: '34px', height: '34px', borderRadius: '8px',
                                                                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                                                                border: 'none', color: '#fff', cursor: 'pointer',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                boxShadow: '0 2px 6px rgba(37,211,102,.25)',
                                                                transition: 'all .15s',
                                                            }}
                                                        >
                                                            <MessageSquare size={14} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Row 2: Expanded info (when selected) */}
                                                {isSelected && (
                                                    <div style={{
                                                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                                        gap: '8px', marginTop: '8px', paddingTop: '8px',
                                                        borderTop: '1px solid #f1f5f9',
                                                    }}>
                                                        {turno.tipo_visita && (
                                                            <div style={{ fontSize: '0.75rem' }}>
                                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Tipo: </span>
                                                                <span style={{ color: '#475569' }}>{turno.tipo_visita}</span>
                                                            </div>
                                                        )}
                                                        {turno.especialidad && (
                                                            <div style={{ fontSize: '0.75rem' }}>
                                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Especialidad: </span>
                                                                <span style={{ color: '#475569' }}>{turno.especialidad}</span>
                                                            </div>
                                                        )}
                                                        {turno.centro && (
                                                            <div style={{ fontSize: '0.75rem' }}>
                                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Centro: </span>
                                                                <span style={{ color: '#475569' }}>{turno.centro}</span>
                                                            </div>
                                                        )}
                                                        {turno.telefono1 && (
                                                            <div style={{ fontSize: '0.75rem' }}>
                                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Tel: </span>
                                                                <span style={{ color: '#475569' }}>{formatPhone(turno.telefono1)}</span>
                                                            </div>
                                                        )}
                                                        {turno.motivo && (
                                                            <div style={{ fontSize: '0.75rem', gridColumn: '1 / -1' }}>
                                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Motivo: </span>
                                                                <span style={{ color: '#475569' }}>{turno.motivo}</span>
                                                            </div>
                                                        )}
                                                        {turno.comentarios && (
                                                            <div style={{ fontSize: '0.75rem', gridColumn: '1 / -1' }}>
                                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Comentarios: </span>
                                                                <span style={{ color: '#475569' }}>{turno.comentarios}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ChatWindow */}
            {chatPatient && (
                <ChatWindow
                    open={chatOpen}
                    onClose={() => { setChatOpen(false); setChatPatient(null); }}
                    patientPhone={chatPatient.telefono1}
                    patientName={chatPatient.paciente}
                    addToast={addToast}
                    defaultLineLabel="Recepciones"
                    patientContext={{
                        obraSocial: chatPatient.obra_social,
                    }}
                />
            )}
        </div>
    );
}
