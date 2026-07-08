import { useState, useEffect } from 'react';
import { UserPlus, Loader2, Check, Clock, FileText, ChevronRight, Search, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ETAPAS = [
    { id: 'consulta_inicial', label: 'Consulta Inicial' },
    { id: 'cv_solicitado', label: 'CV Solicitado' },
    { id: 'cv_enviado_director', label: 'CV a Dirección' },
    { id: 'aprobacion_pendiente', label: 'Aprobación Pendiente' },
    { id: 'aprobado', label: 'Aprobado' },
    { id: 'requisitos_enviados', label: 'Requisitos Enviados' },
    { id: 'documentacion_pendiente', label: 'Doc. Pendiente' },
    { id: 'documentacion_recibida', label: 'Doc. Recibida' },
    { id: 'agenda_creada', label: 'Agenda Creada' },
    { id: 'especialidad_configurada', label: 'Especialidad Configurada' },
    { id: 'foto_solicitada', label: 'Foto Solicitada' },
    { id: 'publicado_web', label: 'Publicado en Web' },
    { id: 'turnos_online_activos', label: 'Turnos Online' },
    { id: 'completado', label: 'Completado' },
];

export default function OnboardingPanel({ addToast }) {
    const [candidatos, setCandidatos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('alq_onboarding_medicos')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setCandidatos(data || []);
        } catch (err) {
            addToast?.('Error cargando onboarding: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const updateEtapa = async (id, nuevaEtapa) => {
        try {
            const { error } = await supabase
                .from('alq_onboarding_medicos')
                .update({ etapa_actual: nuevaEtapa })
                .eq('id', id);
            if (error) throw error;
            addToast?.('Etapa actualizada', 'success');
            loadData();
        } catch (err) {
            addToast?.('Error al actualizar etapa: ' + err.message, 'error');
        }
    };

    const filtered = candidatos.filter(c => 
        c.medico_nombre.toLowerCase().includes(search.toLowerCase()) || 
        (c.especialidad && c.especialidad.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="content" style={{ padding: '32px', minHeight: '100%', position: 'relative' }}>
            {/* Elementos flotantes de fondo para efecto de profundidad */}
            <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '300px', height: '300px', background: 'radial-gradient(circle, var(--primary-200) 0%, transparent 70%)', opacity: 0.4, filter: 'blur(40px)', zIndex: 0, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '10%', right: '-5%', width: '400px', height: '400px', background: 'radial-gradient(circle, #818CF8 0%, transparent 70%)', opacity: 0.2, filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Header Glassmórfico */}
                <div style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px',
                    background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                    padding: '24px 32px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.8)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,1)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--neutral-800)', display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-0.02em' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg, var(--primary-100), var(--primary-50))', borderRadius: '14px', border: '1px solid var(--primary-200)', color: 'var(--primary-600)', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)' }}>
                            <UserPlus size={22} />
                        </div>
                        Incorporación de Médicos
                    </h2>
                    <button style={{
                        padding: '10px 20px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
                        color: 'white', border: 'none', fontWeight: 700, fontSize: '0.85rem',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 8px 20px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 24px rgba(99, 102, 241, 0.35)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(99, 102, 241, 0.25)'; }}
                    >
                        <Plus size={16} /> Nuevo Candidato
                    </button>
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '340px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre o especialidad..." 
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ 
                                width: '100%', padding: '12px 16px 12px 40px', borderRadius: '16px', 
                                border: '1px solid rgba(255,255,255,0.5)', fontSize: '0.85rem', outline: 'none',
                                background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(10px)',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.02), inset 0 2px 4px rgba(0,0,0,0.02)',
                                transition: 'all 0.3s ease',
                                color: 'var(--neutral-700)', fontWeight: 500
                            }}
                            onFocus={e => { e.target.style.background = 'rgba(255,255,255,0.9)'; e.target.style.borderColor = 'var(--primary-300)'; e.target.style.boxShadow = '0 8px 20px rgba(99, 102, 241, 0.1)'; }}
                            onBlur={e => { e.target.style.background = 'rgba(255, 255, 255, 0.6)'; e.target.style.borderColor = 'rgba(255,255,255,0.5)'; e.target.style.boxShadow = '0 4px 15px rgba(0,0,0,0.02), inset 0 2px 4px rgba(0,0,0,0.02)'; }}
                        />
                    </div>
                </div>

                {/* List */}
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                        <Loader2 size={32} className="spin" style={{ color: 'var(--primary-500)' }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--neutral-400)', background: 'rgba(255,255,255,0.4)', borderRadius: '24px', border: '1px dashed rgba(0,0,0,0.1)' }}>
                        <UserPlus size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>No hay procesos de onboarding activos</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                        {filtered.map((c, index) => {
                            const idx = ETAPAS.findIndex(e => e.id === c.etapa_actual);
                            const isCompleted = c.etapa_actual === 'completado';
                            const progress = ((idx + 1) / ETAPAS.length) * 100;

                            return (
                                <div key={c.id} style={{
                                    padding: '24px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)',
                                    background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                                    display: 'flex', flexDirection: 'column', gap: '16px',
                                    boxShadow: '0 15px 35px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)',
                                    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    animation: `fadeInUp 0.6s ease-out ${index * 0.05}s both`,
                                    cursor: 'default'
                                }}
                                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 20px 45px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255,255,255,1)'; }}
                                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)'; }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--neutral-800)', letterSpacing: '-0.01em' }}>{c.medico_nombre}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', marginTop: '4px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCompleted ? '#10B981' : 'var(--primary-400)' }} />
                                                {c.especialidad || 'Sin especialidad definida'}
                                            </div>
                                        </div>
                                        <div style={{
                                            padding: '6px 12px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                            background: isCompleted ? 'linear-gradient(135deg, #DCFCE7, #bbf7d0)' : 'linear-gradient(135deg, #EFF6FF, #dbeafe)',
                                            color: isCompleted ? '#166534' : '#1E40AF',
                                            border: `1px solid ${isCompleted ? '#86efac' : '#bfdbfe'}`,
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                        }}>
                                            {isCompleted ? <Check size={14} /> : <Clock size={14} />}
                                            {ETAPAS.find(e => e.id === c.etapa_actual)?.label || c.etapa_actual}
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                                        <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                                            <div style={{ 
                                                width: `${progress}%`, height: '100%', 
                                                background: isCompleted ? 'linear-gradient(90deg, #22C55E, #10B981)' : 'linear-gradient(90deg, var(--primary-400), var(--primary-600))', 
                                                borderRadius: '4px',
                                                transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                                                boxShadow: isCompleted ? '0 0 10px rgba(34, 197, 94, 0.4)' : '0 0 10px rgba(99, 102, 241, 0.4)'
                                            }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                                            <div style={{ position: 'relative' }}>
                                                <select 
                                                    value={c.etapa_actual} 
                                                    onChange={(e) => updateEtapa(c.id, e.target.value)}
                                                    style={{ 
                                                        fontSize: '0.75rem', fontWeight: 600, padding: '6px 28px 6px 12px', borderRadius: '10px', 
                                                        border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', 
                                                        color: 'var(--neutral-700)', outline: 'none', cursor: 'pointer',
                                                        appearance: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                                                    }}
                                                >
                                                    {ETAPAS.map(e => (
                                                        <option key={e.id} value={e.id}>{e.label}</option>
                                                    ))}
                                                </select>
                                                <ChevronRight size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%) rotate(90deg)', pointerEvents: 'none', color: 'var(--neutral-400)' }} />
                                            </div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--neutral-400)' }}>
                                                Ingreso: {c.fecha_consulta ? new Date(c.fecha_consulta).toLocaleDateString('es-AR', {day: '2-digit', month: 'short'}) : 'N/A'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                <style>{`
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translateY(20px) scale(0.98); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>
            </div>
        </div>
    );
}
