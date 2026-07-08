import { useState } from 'react';
import {
    Home, MessageSquare, BookOpen, Settings, ChevronDown, ChevronRight,
    MessageCircle, Send, Users, Shield, Zap, HeartPulse, RefreshCw,
    BarChart3, CalendarCheck, FileText, ArrowRight, Info, HelpCircle,
    CheckCircle2, Clock, Phone, Search, Bell
} from 'lucide-react';

/* ═══════════════════════════════════════════════
   WORKFLOW STEPS (visual flow diagram data)
   ═══════════════════════════════════════════════ */
const WORKFLOW_STEPS = [
    { icon: HeartPulse, label: 'Chequeos', desc: 'Buscar pacientes y enviar invitación', color: '#3B82F6' },
    { icon: CalendarCheck, label: 'Agendar', desc: 'Paciente acepta → asignar fecha', color: '#0EA5E9' },
    { icon: BarChart3, label: 'Métricas', desc: 'Seguimiento y análisis', color: '#10B981' },
];

/* ═══════════════════════════════════════════════
   GUIDE SECTIONS
   ═══════════════════════════════════════════════ */
const GUIDE_SECTIONS = [
    {
        id: 'flujo',
        title: 'Flujo de Trabajo Completo',
        icon: Zap,
        color: '#F59E0B',
        bg: '#FFFBEB',
        description: 'Entendé el recorrido completo de un paciente en el sistema.',
        image: '/help/workflow.png',
        content: [
            { type: 'heading', text: '¿Cómo funciona el circuito?' },
            { type: 'text', text: 'El sistema gestiona el ciclo de vida completo de un chequeo preventivo, desde la captación del paciente hasta el seguimiento post-turno. El flujo es lineal y cada módulo alimenta al siguiente automáticamente.' },
            { type: 'steps', items: [
                { icon: Search, title: 'Paso 1 — Buscar Paciente', text: 'En el panel de Chequeos, seleccionás la fecha y buscás pacientes que se hicieron el chequeo hace 1 año. El sistema los carga desde la base de datos de visitas.' },
                { icon: Send, title: 'Paso 2 — Enviar Invitación', text: 'Le enviás un mensaje de WhatsApp al paciente invitándolo a realizarse el chequeo anual. Usás la plantilla /chequeo que personaliza el mensaje con su nombre.' },
                { icon: Phone, title: 'Paso 3 — El Paciente Acepta', text: 'El paciente responde al mensaje. Vos entrás al Chat Central, leés la respuesta y coordinás la fecha del turno.' },
                { icon: CalendarCheck, title: 'Paso 4 — Agendar Turno', text: 'Desde el panel de Chequeos, tocás el botón "📅 Agendar Turno" y cargás la fecha confirmada.' },
                { icon: CheckCircle2, title: 'Paso 5 — Confirmación', text: 'Cambiás el estado del paciente a "Confirmó", "Canceló" o "Reprogramó" según la respuesta.' },
            ]},
        ],
    },
    {
        id: 'chequeos',
        title: 'Panel de Chequeos',
        icon: HeartPulse,
        color: '#3B82F6',
        bg: '#EFF6FF',
        description: 'Buscá pacientes que deben renovar su chequeo anual y contactalos.',
        image: '/help/chequeos.png',
        content: [
            { type: 'heading', text: '¿Qué es el Panel de Chequeos?' },
            { type: 'text', text: 'Este panel carga todos los pacientes que se realizaron un Chequeo Preventivo (CHQ) en una fecha determinada. Mostrándote quiénes deben volver a realizarse el chequeo este año.' },
            { type: 'features', items: [
                { icon: Clock, title: 'Navegador de Fechas', text: 'Usá las flechas o el botón "Hoy -1 Año" para buscar pacientes de hace 12 meses que necesitan renovar.' },
                { icon: Users, title: 'Tarjetas de Resumen', text: 'Ves de un vistazo: cantidad de pacientes, cuántos tienen teléfono y cuántos no.' },
                { icon: Search, title: 'Filtros', text: 'Buscá por nombre, DNI, teléfono u obra social. También podés elegir "Día Exacto" o "Mes Completo".' },
                { icon: Send, title: 'Enviar Recordatorio', text: 'Seleccioná un paciente, tocá "Enviar Recordatorio" para mandarle WhatsApp con la plantilla /chequeo.' },
                { icon: CalendarCheck, title: 'Agendar Turno', text: 'Cuando el paciente acepta, tocá "📅 Agendar Turno", elegí la fecha y listo.' },
            ]},
            { type: 'tip', text: 'Podés usar "Enviar a Todos" para mandar el mensaje masivo a todos los pacientes con teléfono de esa fecha.' },
        ],
    },

    {
        id: 'mensajeria',
        title: 'Centro de Mensajería',
        icon: MessageCircle,
        color: '#10B981',
        bg: '#ECFDF5',
        description: 'Chats de WhatsApp centralizados con pacientes.',
        image: '/help/mensajeria.png',
        content: [
            { type: 'heading', text: '¿Cómo funciona la Mensajería?' },
            { type: 'text', text: 'Es el hub central de WhatsApp. Acá llegan todos los mensajes de pacientes en tiempo real y podés responder directamente desde el sistema.' },
            { type: 'features', items: [
                { icon: MessageSquare, title: 'Chat Central', text: 'Ves todas las conversaciones a la izquierda, seleccionás una y respondés a la derecha. Funciona como WhatsApp Web.' },
                { icon: FileText, title: 'Plantillas Rápidas', text: 'Escribí "/" en el chat para ver las plantillas disponibles. Ej: /chequeo, /recordatorio, /prevenir.' },
                { icon: Bell, title: 'Notificaciones', text: 'Los mensajes nuevos aparecen con un badge rojo y una notificación sonora cuando estás en otro panel.' },
            ]},
        ],
    },
    {
        id: 'plantillas',
        title: 'Plantillas de Mensajes',
        icon: FileText,
        color: '#F59E0B',
        bg: '#FFFBEB',
        description: 'Mensajes predefinidos con variables personalizables.',
        image: '/help/plantillas.png',
        content: [
            { type: 'heading', text: '¿Cómo usar las Plantillas?' },
            { type: 'text', text: 'Las plantillas son mensajes predefinidos que se activan con "/" en el chat. Usan variables como {nombre} que se reemplazan automáticamente por los datos del paciente.' },
            { type: 'features', items: [
                { icon: Zap, title: 'Plantillas Disponibles', text: '/chequeo (invitación), /recordatorio (turno), /prevenir (programa), /infochequeo, /valorchequeo, etc.' },
                { icon: Settings, title: 'Variables Dinámicas', text: '{nombre}, {fecha_turno}, {hora_turno}, {sede}, {valor_chequeo} — se personalizan solas con los datos del paciente.' },
            ]},
            { type: 'tip', text: 'Podés crear, editar o eliminar plantillas desde Configuración > Plantillas de Mensajes.' },
        ],
    },
    {
        id: 'metricas',
        title: 'Panel de Métricas',
        icon: BarChart3,
        color: '#6366F1',
        bg: '#EEF2FF',
        description: 'Análisis de volúmenes, obras sociales y proyección.',
        image: '/help/metricas.png',
        content: [
            { type: 'heading', text: '¿Qué muestran las Métricas?' },
            { type: 'text', text: 'Dashboard analítico con datos históricos de chequeos. Muestra tendencias mensuales, distribución por obra social y proyecciones de captación.' },
            { type: 'features', items: [
                { icon: Users, title: 'KPIs Principales', text: 'Total pacientes únicos, turnos agendados, promedio mensual, mes pico y obra social principal.' },
                { icon: BarChart3, title: 'Gráfico de Evolución', text: 'Barras + línea de tendencia con la evolución mensual de pacientes atendidos.' },
                { icon: HeartPulse, title: 'Obra Social', text: 'Gráfico de torta (donut) con el Top 5 de obras sociales más frecuentes.' },
            ]},
        ],
    },
];

/* ═══════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════ */
function WorkflowDiagram() {
    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '24px', border: '1px solid rgba(255,255,255,0.8)',
            padding: '32px', marginBottom: '32px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,1)',
            position: 'relative', overflow: 'hidden'
        }}>
            <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%)', filter: 'blur(40px)', zIndex: 0 }} />
            
            <div style={{ position: 'relative', zIndex: 1 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ padding: '8px', background: 'linear-gradient(135deg, rgba(252,211,77,0.3), rgba(245,158,11,0.1))', borderRadius: '10px', color: '#D97706' }}>
                        <Zap size={20} />
                    </div>
                    Diagrama de Flujo del Sistema
                </h3>
                <p style={{ margin: '0 0 24px', fontSize: '0.82rem', color: '#64748B', fontWeight: 500 }}>
                    El recorrido de cada paciente dentro del sistema de salud preventiva
                </p>
                {/* Visual flow */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {WORKFLOW_STEPS.map((step, i) => {
                        const Icon = step.icon;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    padding: '20px 24px', borderRadius: '18px', minWidth: '170px',
                                    background: 'rgba(255,255,255,0.6)',
                                    border: '1px solid rgba(255,255,255,0.9)',
                                    boxShadow: '0 8px 20px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,1)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    cursor: 'default',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-6px)'; e.currentTarget.style.boxShadow = `0 15px 35px ${step.color}25, inset 0 1px 0 rgba(255,255,255,1)`; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,1)'; }}
                                >
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '14px',
                                        background: `linear-gradient(135deg, ${step.color}, ${step.color}DD)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        marginBottom: '12px', boxShadow: `0 8px 16px ${step.color}40, inset 0 2px 4px rgba(255,255,255,0.3)`,
                                    }}>
                                        <Icon size={22} color="#fff" />
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1E293B', letterSpacing: '-0.01em' }}>{step.label}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', textAlign: 'center', marginTop: '4px', lineHeight: 1.4, fontWeight: 500 }}>{step.desc}</span>
                                </div>
                                {i < WORKFLOW_STEPS.length - 1 && (
                                    <div style={{ padding: '0 10px', color: '#CBD5E1', transform: 'scale(1.2)' }}>
                                        <ArrowRight size={24} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function ContentRenderer({ content, sectionColor }) {
    return content.map((block, i) => {
        if (block.type === 'heading') {
            return <h4 key={i} style={{ margin: '16px 0 6px', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>{block.text}</h4>;
        }
        if (block.type === 'text') {
            return <p key={i} style={{ margin: '0 0 12px', fontSize: '0.84rem', color: '#475569', lineHeight: 1.6 }}>{block.text}</p>;
        }
        if (block.type === 'tip') {
            return (
                <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 16px',
                    borderRadius: '10px', background: '#FFFBEB', border: '1px solid #FDE68A', marginTop: '8px',
                }}>
                    <Info size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ fontSize: '0.82rem', color: '#92400E', lineHeight: 1.5 }}><strong>Tip:</strong> {block.text}</span>
                </div>
            );
        }
        if (block.type === 'steps') {
            return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0' }}>
                    {block.items.map((step, j) => {
                        const Icon = step.icon;
                        return (
                            <div key={j} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '12px',
                                padding: '12px 16px', borderRadius: '10px', background: '#F8FAFC',
                                border: '1px solid #F1F5F9',
                            }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: `${sectionColor}15`, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <Icon size={15} color={sectionColor} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', marginBottom: '2px' }}>{step.title}</div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.5 }}>{step.text}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }
        if (block.type === 'features') {
            return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px', margin: '8px 0' }}>
                    {block.items.map((feat, j) => {
                        const Icon = feat.icon;
                        return (
                            <div key={j} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                padding: '12px 14px', borderRadius: '10px',
                                background: '#F8FAFC', border: '1px solid #F1F5F9',
                            }}>
                                <div style={{
                                    width: '30px', height: '30px', borderRadius: '8px',
                                    background: `${sectionColor}15`, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <Icon size={14} color={sectionColor} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B' }}>{feat.title}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748B', lineHeight: 1.4 }}>{feat.text}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }
        if (block.type === 'pipeline') {
            return (
                <div key={i} style={{ margin: '12px 0 0' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Estados del Pipeline:</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {block.states.map((s, j) => (
                            <div key={j} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 14px', borderRadius: '8px',
                                background: `${s.color}10`, border: `1px solid ${s.color}25`,
                            }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color }} />
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: s.color }}>{s.label}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748B' }}>{s.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    });
}

function GuideSection({ section }) {
    const [expanded, setExpanded] = useState(false);
    const Icon = section.icon;

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            borderRadius: '20px', border: '1px solid rgba(255,255,255,0.9)', overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: expanded ? '0 12px 35px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)' : '0 4px 15px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,1)',
            transform: expanded ? 'translateY(-2px)' : 'translateY(0)'
        }}>
            <button
                onClick={() => setExpanded(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    width: '100%', padding: '20px 24px', border: 'none',
                    background: expanded ? 'rgba(255,255,255,0.8)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s',
                }}
            >
                <div style={{
                    width: '48px', height: '48px', borderRadius: '14px',
                    background: `linear-gradient(135deg, ${section.color}15, ${section.color}05)`,
                    border: `1px solid ${section.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    boxShadow: `0 4px 10px ${section.color}10, inset 0 2px 4px rgba(255,255,255,0.5)`
                }}>
                    <Icon size={22} style={{ color: section.color }} />
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E293B', margin: 0, letterSpacing: '-0.01em' }}>{section.title}</h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0', fontWeight: 500 }}>{section.description}</p>
                </div>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                }}>
                    <ChevronDown size={18} style={{
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', color: '#64748B',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }} />
                </div>
            </button>

            {expanded && (
                <div className="animate-fade-in" style={{ padding: '0 22px 22px' }}>
                    {section.image && (
                        <div style={{
                            borderRadius: '12px', overflow: 'hidden',
                            border: '1px solid #E2E8F0', marginBottom: '16px',
                            borderRadius: '16px', overflow: 'hidden',
                            border: '1px solid rgba(226, 232, 240, 0.8)', marginBottom: '20px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                        }}>
                            <img
                                src={section.image}
                                alt={section.title}
                                style={{ width: '100%', display: 'block' }}
                                onError={e => { e.target.style.display = 'none'; }}
                            />
                        </div>
                    )}
                    <ContentRenderer content={section.content} sectionColor={section.color} />
                </div>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export default function HomePanel() {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

    return (
        <div className="content no-print" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '60px' }}>
            {/* Elementos de fondo global para Antigravity */}
            <div style={{ position: 'fixed', top: '20%', right: '5%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%)', filter: 'blur(50px)', zIndex: 0, pointerEvents: 'none' }} />
            <div style={{ position: 'fixed', bottom: '10%', left: '5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(56, 189, 248, 0.1) 0%, transparent 70%)', filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none' }} />
            
            {/* Hero Banner */}
            <div className="animate-fade-in" style={{
                background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.85) 0%, rgba(59, 130, 246, 0.8) 50%, rgba(96, 165, 250, 0.85) 100%)',
                backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                borderRadius: '28px', padding: '40px 48px', color: '#fff',
                marginBottom: '32px', position: 'relative', overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 20px 50px rgba(30,64,175,0.15), inset 0 1px 0 rgba(255,255,255,0.4)',
                zIndex: 1,
            }}>
                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)', filter: 'blur(10px)' }} />
                <div style={{ position: 'absolute', bottom: '-20px', right: '120px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)', filter: 'blur(5px)' }} />
                
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.15)', borderRadius: '14px', backdropFilter: 'blur(10px)' }}>
                            <Home size={30} style={{ opacity: 1, color: '#fff' }} />
                        </div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.1)', letterSpacing: '-0.02em' }}>{saludo} 👋</h1>
                    </div>
                    <p style={{ fontSize: '1.05rem', opacity: 0.95, marginBottom: '24px', maxWidth: '700px', lineHeight: 1.6, textShadow: '0 1px 4px rgba(0,0,0,0.1)', fontWeight: 500 }}>
                        Bienvenido al <strong style={{ fontWeight: 800, color: '#fff' }}>Sistema de Recepciones</strong> del Sanatorio Argentino.
                        Gestioná chequeos preventivos, mensajería con pacientes y seguimiento de turnos desde un solo lugar.
                    </p>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {[
                            { icon: HeartPulse, label: 'Chequeos', sub: 'Prevención' },
                            { icon: MessageCircle, label: 'Mensajería', sub: 'WhatsApp' },
                            { icon: BarChart3, label: 'Métricas', sub: 'Análisis' },
                        ].map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 18px', borderRadius: '14px',
                                    background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    fontSize: '0.85rem', fontWeight: 700,
                                    boxShadow: '0 4px 15px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.1)',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    cursor: 'default',
                                }}
                                onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
                                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                                >
                                    <Icon size={16} />
                                    <span>{item.label}</span>
                                    <span style={{ fontSize: '0.65rem', opacity: 0.7, padding: '2px 6px', background: 'rgba(255,255,255,0.15)', borderRadius: '6px' }}>{item.sub}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Workflow Diagram */}
            <WorkflowDiagram />

            {/* Guide Title */}
            <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <HelpCircle size={20} color="#3B82F6" /> Guía Completa del Sistema
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                    Tocá cada sección para ver cómo funciona con imágenes del sistema y pasos detallados.
                </p>
            </div>

            {/* Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {GUIDE_SECTIONS.map(section => (
                    <GuideSection key={section.id} section={section} />
                ))}
            </div>
        </div>
    );
}
