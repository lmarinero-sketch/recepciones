import { useState } from 'react';
import {
    Home, MessageSquare, BookOpen, Settings,
    ChevronDown, ChevronRight, MessageCircle, Send, Users, Shield, Zap
} from 'lucide-react';

const GUIDE_SECTIONS = [
    {
        id: 'mensajeria',
        title: 'Centro de Mensajería',
        icon: MessageCircle,
        color: '#10B981',
        bg: '#ECFDF5',
        description: 'Gestioná todos los chats de WhatsApp desde un solo lugar.',
        subsections: [
            {
                title: '💬 Conversaciones Activas',
                icon: MessageSquare,
                steps: [
                    { icon: Users, text: 'En el menú lateral podés ver todas las conversaciones de pacientes.' },
                    { icon: MessageSquare, text: 'Seleccioná un chat para ver el historial o enviar un nuevo mensaje.' },
                    { icon: Send, text: 'Podés enviar texto o adjuntar archivos (Imágenes, PDF).' },
                ],
                tips: [
                    'Las conversaciones sin leer aparecerán con un badge rojo resaltado.',
                    'Podés utilizar plantillas para agilizar las respuestas comunes.',
                ],
            },
            {
                title: '📋 Plantillas',
                icon: BookOpen,
                steps: [
                    { icon: Settings, text: 'Accedé a la sección de "Plantillas" desde el menú lateral.' },
                    { icon: Send, text: 'Creá mensajes predefinidos con accesos rápidos (ej: /turno, /info).' },
                ],
                tips: [
                    'Escribí el atajo en el chat y presiona "Enter" para autocompletar el mensaje.',
                ],
            },
        ],
    },
    {
        id: 'config',
        title: 'Configuraciones de Línea',
        icon: Settings,
        color: '#3B82F6',
        bg: '#EFF6FF',
        description: 'Verificá el estado de la conexión de WhatsApp.',
        subsections: [
            {
                title: '🔌 Estado de Conexión',
                icon: Zap,
                steps: [
                    { icon: Shield, text: 'Verificá el estado en la barra superior (Línea Conectada).' },
                    { icon: Settings, text: 'Si aparece en rojo, contactá a soporte técnico o reiniciá el servicio BuilderBot.' },
                ],
                tips: [
                    'El sistema utiliza Supabase para recibir mensajes en tiempo real.',
                ],
            },
        ],
    },
];

function GuideSubsection({ sub, sectionColor }) {
    const [open, setOpen] = useState(false);
    const Icon = sub.icon;
    return (
        <div style={{
            border: '1px solid var(--neutral-200, #E2E8F0)',
            borderRadius: '12px', overflow: 'hidden',
            transition: 'all 0.2s',
            boxShadow: open ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
        }}>
            <button
                onClick={() => setOpen(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '14px 18px', border: 'none',
                    background: open ? sectionColor + '08' : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s',
                }}
            >
                <ChevronRight size={14} style={{
                    transition: 'transform 0.2s', color: sectionColor,
                    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                }} />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--neutral-800, #1E293B)' }}>
                    {sub.title}
                </span>
            </button>

            {open && (
                <div className="animate-fade-in" style={{ padding: '0 18px 18px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                        {sub.steps.map((step, i) => {
                            const StepIcon = step.icon;
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                                    padding: '10px 14px', borderRadius: '10px',
                                    background: 'var(--neutral-50, #F8FAFC)',
                                }}>
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '8px',
                                        background: sectionColor + '15', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <StepIcon size={14} style={{ color: sectionColor }} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            width: '20px', height: '20px', borderRadius: '50%',
                                            background: sectionColor, color: '#fff',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
                                        }}>{i + 1}</span>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--neutral-700, #334155)', lineHeight: 1.5 }}>
                                            {step.text}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function GuideSection({ section }) {
    const [expanded, setExpanded] = useState(false);
    const Icon = section.icon;

    return (
        <div style={{
            background: '#fff', borderRadius: '16px',
            border: '1px solid var(--neutral-200, #E2E8F0)',
            overflow: 'hidden', transition: 'box-shadow 0.2s',
            boxShadow: expanded ? '0 4px 20px rgba(0,0,0,0.06)' : 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.06))',
        }}>
            <button
                onClick={() => setExpanded(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    width: '100%', padding: '20px 24px', border: 'none',
                    background: expanded ? section.bg : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.2s',
                }}
            >
                <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    background: section.color + '15',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={22} style={{ color: section.color }} />
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--neutral-800, #1E293B)', margin: 0 }}>
                        {section.title}
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--neutral-500, #64748B)', margin: '2px 0 0' }}>
                        {section.description}
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '4px 12px', borderRadius: '20px',
                    background: section.color + '10', color: section.color,
                    fontSize: '0.72rem', fontWeight: 600,
                }}>
                    {section.subsections.length} tema{section.subsections.length !== 1 ? 's' : ''}
                    <ChevronDown size={14} style={{
                        transition: 'transform 0.2s',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }} />
                </div>
            </button>

            {expanded && (
                <div className="animate-fade-in" style={{
                    padding: '0 24px 24px',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                    {section.subsections.map((sub, i) => (
                        <GuideSubsection key={i} sub={sub} sectionColor={section.color} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function HomePanel() {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

    return (
        <div className="content no-print" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div className="animate-fade-in" style={{
                background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 50%, #60A5FA 100%)',
                borderRadius: '20px', padding: '36px 40px', color: '#fff',
                marginBottom: '28px', position: 'relative', overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: '-30px', right: '-30px',
                    width: '140px', height: '140px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                }} />
                <div style={{
                    position: 'absolute', bottom: '-20px', right: '80px',
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <Home size={28} style={{ opacity: 0.9 }} />
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                            {saludo} 👋
                        </h1>
                    </div>
                    <p style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '16px', maxWidth: '600px', lineHeight: 1.6 }}>
                        Bienvenido al <strong>Centro de Mensajería</strong> del Sanatorio Argentino.
                        Desde acá podés gestionar todos los chats de WhatsApp con pacientes de manera centralizada.
                    </p>
                    <div style={{
                        display: 'flex', gap: '12px', flexWrap: 'wrap',
                    }}>
                        {[
                            { icon: MessageSquare, label: 'Mensajes', count: 'Tiempo real' },
                            { icon: BookOpen, label: 'Plantillas', count: 'Respuestas rápidas' },
                        ].map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 16px', borderRadius: '12px',
                                    background: 'rgba(255,255,255,0.15)',
                                    backdropFilter: 'blur(10px)',
                                    fontSize: '0.82rem', fontWeight: 600,
                                }}>
                                    <Icon size={16} />
                                    <span>{item.label}</span>
                                    <span style={{
                                        fontSize: '0.68rem', opacity: 0.7,
                                        padding: '2px 8px', background: 'rgba(255,255,255,0.15)',
                                        borderRadius: '8px',
                                    }}>{item.count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
                <h2 style={{
                    fontSize: '1.15rem', fontWeight: 800,
                    color: 'var(--neutral-800, #1E293B)',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    marginBottom: '4px',
                }}>
                    <BookOpen size={20} style={{ color: 'var(--primary-500, #3B82F6)' }} />
                    Guía del Usuario
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--neutral-500, #64748B)', marginBottom: '20px' }}>
                    Tocá cada sección para aprender cómo usar el centro de mensajería paso a paso.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '40px' }}>
                {GUIDE_SECTIONS.map(section => (
                    <GuideSection key={section.id} section={section} />
                ))}
            </div>
        </div>
    );
}
