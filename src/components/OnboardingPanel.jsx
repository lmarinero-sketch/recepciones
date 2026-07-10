import { useState, useEffect, useMemo } from 'react';
import { UserPlus, Loader2, Search, MapPin, Building2, Calendar, MessageSquare, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

function getInitials(name) {
  if (!name) return '';
  return name
    .replace(/^(Dra?\.\s*|Lic\.\s*)/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');
}

function isSantaFe(sede) {
  return sede.toLowerCase().includes('santa fe');
}

function shortenSede(sede) {
  if (!sede) return '';
  if (sede.includes('432')) return 'Sede 1';
  if (sede.includes('433')) return 'Sede 2';
  if (sede.includes('436')) return 'Sede 3';
  if (sede.includes('Sector 1')) return 'SF Sector 1';
  if (sede.includes('Sector 2')) return 'SF Sector 2';
  return sede;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function OnboardingPanel({ addToast }) {
    const [prestadores, setPrestadores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const loadData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('nuevos_prestadores')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setPrestadores(data || []);
        } catch (err) {
            addToast?.('Error cargando prestadores: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return prestadores;
        const q = search.toLowerCase().trim();
        return prestadores.filter(p => 
            p.nombre_completo?.toLowerCase().includes(q) || 
            p.servicio_especialidad?.toLowerCase().includes(q)
        );
    }, [prestadores, search]);

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
                        <div>
                            Incorporación de Médicos
                            <div style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', fontWeight: 500, marginTop: '4px' }}>
                                Directorio sincronizado desde Recursos Humanos
                            </div>
                        </div>
                    </h2>
                    {/* Botón de recarga */}
                    <button onClick={loadData} style={{
                        padding: '10px', borderRadius: '14px', background: 'white',
                        color: 'var(--neutral-500)', border: '1px solid var(--neutral-200)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
                    }} title="Actualizar lista">
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
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
                        <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>No hay prestadores cargados en RRHH</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                        {filtered.map((p, index) => {
                            return (
                                <div key={p.id} style={{
                                    padding: '24px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)',
                                    background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                                    display: 'flex', flexDirection: 'column', gap: '16px',
                                    boxShadow: '0 15px 35px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)',
                                    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    animation: `fadeInUp 0.6s ease-out ${Math.min(index * 0.05, 0.5)}s both`,
                                }}
                                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 20px 45px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255,255,255,1)'; }}
                                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {/* Avatar */}
                                        <div style={{
                                            width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
                                            background: 'linear-gradient(135deg, var(--primary-100), var(--primary-200))',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            overflow: 'hidden', border: '2px solid white',
                                            boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                                            color: 'var(--primary-700)', fontWeight: 800, fontSize: '1.2rem',
                                            position: 'relative'
                                        }}>
                                            {p.foto_url ? (
                                                <img 
                                                    src={p.foto_url} 
                                                    alt={p.nombre_completo} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                                />
                                            ) : null}
                                            <div style={{ display: p.foto_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                                                {getInitials(p.nombre_completo)}
                                            </div>
                                        </div>
                                        
                                        {/* Nombre y especialidad */}
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--neutral-800)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                                                {p.nombre_completo}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--primary-600)', marginTop: '4px', fontWeight: 600 }}>
                                                {p.servicio_especialidad || 'Sin especialidad definida'}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Sedes */}
                                    {p.sedes && p.sedes.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {p.sedes.map(s => {
                                                const isSF = isSantaFe(s);
                                                return (
                                                    <span key={s} style={{
                                                        padding: '4px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700,
                                                        background: isSF ? '#FEF2F2' : '#EFF6FF',
                                                        color: isSF ? '#DC2626' : '#2563EB',
                                                        border: `1px solid ${isSF ? '#FCA5A5' : '#BFDBFE'}`,
                                                        display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}>
                                                        {isSF ? <MapPin size={10} /> : <Building2 size={10} />}
                                                        {shortenSede(s)}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Footer con comentarios y fecha */}
                                    <div style={{ 
                                        marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.05)',
                                        display: 'flex', flexDirection: 'column', gap: '8px'
                                    }}>
                                        {p.comentarios && (
                                            <div style={{ display: 'flex', gap: '6px', color: 'var(--neutral-500)', fontSize: '0.75rem', background: 'rgba(0,0,0,0.02)', padding: '8px', borderRadius: '8px' }}>
                                                <MessageSquare size={14} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--neutral-400)' }} />
                                                <span style={{ fontStyle: 'italic', lineHeight: 1.4 }}>{p.comentarios}</span>
                                            </div>
                                        )}
                                        
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--neutral-400)', fontWeight: 600 }}>
                                            <Calendar size={12} />
                                            Registrado el {formatDate(p.created_at)}
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
