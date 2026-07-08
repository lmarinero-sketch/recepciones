import { useState, useEffect } from 'react';
import { Megaphone, Loader2, Plus, Edit2, Check, X, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function CatalogoPanel({ addToast }) {
    const [servicios, setServicios] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('alq_catalogo_servicios')
                .select('*')
                .order('orden');
            if (error) throw error;
            setServicios(data || []);
        } catch (err) {
            addToast?.('Error cargando catálogo: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    return (
        <div className="content" style={{ padding: '32px', minHeight: '100%', position: 'relative' }}>
            {/* Elementos flotantes de fondo para efecto de profundidad */}
            <div style={{ position: 'absolute', top: '5%', right: '5%', width: '350px', height: '350px', background: 'radial-gradient(circle, var(--primary-200) 0%, transparent 70%)', opacity: 0.35, filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '15%', left: '10%', width: '300px', height: '300px', background: 'radial-gradient(circle, #818CF8 0%, transparent 70%)', opacity: 0.25, filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Header Glassmórfico */}
                <div style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px',
                    background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                    padding: '24px 32px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.8)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,1)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--neutral-800)', display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '-0.02em' }}>
                        <div style={{ padding: '10px', background: 'linear-gradient(135deg, var(--primary-100), var(--primary-50))', borderRadius: '14px', border: '1px solid var(--primary-200)', color: 'var(--primary-600)', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)' }}>
                            <Megaphone size={22} />
                        </div>
                        Catálogo Comercial
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
                        <Plus size={16} /> Nuevo Servicio
                    </button>
                </div>

                <div style={{
                    padding: '16px 20px', borderRadius: '16px', background: 'linear-gradient(to right, rgba(239, 246, 255, 0.8), rgba(255, 255, 255, 0.5))', 
                    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(191, 219, 254, 0.5)', marginBottom: '28px', fontSize: '0.85rem', color: '#1E40AF',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,1)', fontWeight: 500
                }}>
                    Aquí podés configurar los servicios y consultorios que se muestran públicamente en el dossier comercial de Sanatorio Argentino.
                </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={28} className="spin" style={{ color: 'var(--primary-400)' }} />
                </div>
            ) : servicios.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--neutral-400)' }}>
                    <Megaphone size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <p style={{ fontSize: '0.88rem' }}>El catálogo está vacío</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                    {servicios.map((s, index) => (
                        <div key={s.id} style={{
                            padding: '24px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)',
                            background: s.activo ? 'rgba(255, 255, 255, 0.7)' : 'rgba(249, 250, 251, 0.5)', 
                            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                            opacity: s.activo ? 1 : 0.6,
                            display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative',
                            boxShadow: '0 15px 35px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)',
                            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            animation: `fadeInUp 0.6s ease-out ${index * 0.05}s both`,
                        }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.01)'; e.currentTarget.style.boxShadow = '0 20px 45px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255,255,255,1)'; }}
                        onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,1)'; }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ 
                                        width: '42px', height: '42px', borderRadius: '14px', 
                                        background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.5))', 
                                        border: '1px solid rgba(255,255,255,0.8)',
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' 
                                    }}>
                                        {s.icono || '✨'}
                                    </div>
                                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--neutral-800)', letterSpacing: '-0.01em' }}>
                                        {s.titulo}
                                    </div>
                                </div>
                                <button style={{ 
                                    border: 'none', background: 'rgba(255,255,255,0.5)', width: '32px', height: '32px', borderRadius: '10px',
                                    cursor: 'pointer', color: 'var(--neutral-500)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
                                }}
                                onMouseOver={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--primary-600)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'var(--neutral-500)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    <Edit2 size={16} />
                                </button>
                            </div>
                            
                            <p style={{ fontSize: '0.8rem', color: 'var(--neutral-500)', margin: '8px 0', lineHeight: 1.5, fontWeight: 500 }}>
                                {s.descripcion}
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                                <span style={{ fontSize: '0.7rem', padding: '4px 10px', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px', color: 'var(--neutral-600)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                    <Tag size={12} style={{ color: 'var(--neutral-400)' }} /> {s.categoria}
                                </span>
                                <span style={{ 
                                    fontSize: '0.75rem', fontWeight: 700, 
                                    color: s.activo ? '#166534' : '#64748B',
                                    background: s.activo ? '#DCFCE7' : '#F1F5F9',
                                    padding: '4px 12px', borderRadius: '8px',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)'
                                }}>
                                    {s.activo ? 'Activo' : 'Oculto'}
                                </span>
                            </div>
                        </div>
                    ))}
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
