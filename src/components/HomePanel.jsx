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
    { icon: Bell, label: 'Remarketing', desc: 'Recordatorio el día del turno', color: '#8B5CF6' },
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
                { icon: CalendarCheck, title: 'Paso 4 — Agendar Turno', text: 'Desde el panel de Chequeos, tocás el botón "📅 Agendar Turno" y cargás la fecha confirmada. Esto envía al paciente al módulo de Remarketing.' },
                { icon: Bell, title: 'Paso 5 — Recordatorio', text: 'En Remarketing aparece automáticamente el paciente con su fecha de turno. Un día antes le enviás el recordatorio con la plantilla /recordatorio.' },
                { icon: CheckCircle2, title: 'Paso 6 — Confirmación', text: 'Cambiás el estado del paciente a "Confirmó", "Canceló" o "Reprogramó" según la respuesta.' },
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
                { icon: CalendarCheck, title: 'Agendar Turno', text: 'Cuando el paciente acepta, tocá "📅 Agendar Turno", elegí la fecha y listo. Pasa automáticamente a Remarketing.' },
            ]},
            { type: 'tip', text: 'Podés usar "Enviar a Todos" para mandar el mensaje masivo a todos los pacientes con teléfono de esa fecha.' },
        ],
    },
    {
        id: 'remarketing',
        title: 'Panel de Remarketing',
        icon: RefreshCw,
        color: '#8B5CF6',
        bg: '#F5F3FF',
        description: 'Gestioná los recordatorios de turnos confirmados.',
        image: '/help/remarketing.png',
        content: [
            { type: 'heading', text: '¿Qué es el Remarketing?' },
            { type: 'text', text: 'Este panel muestra SOLO los pacientes que ya tienen un turno agendado desde el panel de Chequeos. Acá les mandás el recordatorio previo al turno y hacés seguimiento de su asistencia.' },
            { type: 'features', items: [
                { icon: BarChart3, title: 'Pipeline Visual', text: 'El embudo te muestra cuántos pacientes están en cada estado: Pendiente, Enviado, Confirmó, Canceló, Reprogramó.' },
                { icon: Bell, title: 'Enviar Recordatorio', text: 'Un día antes del turno, buscá al paciente y mandále el recordatorio usando la plantilla /recordatorio.' },
                { icon: CheckCircle2, title: 'Actualizar Estado', text: 'Cuando el paciente responde, cambiá su estado: ✅ Confirmó, ❌ Canceló o 🔄 Reprogramó.' },
            ]},
            { type: 'pipeline', states: [
                { label: 'Pendiente', color: '#94A3B8', desc: 'Turno agendado, aún sin recordatorio' },
                { label: 'Enviado', color: '#3B82F6', desc: 'Ya le mandaste el recordatorio' },
                { label: 'Confirmó', color: '#10B981', desc: 'El paciente confirmó asistencia' },
                { label: 'Canceló', color: '#EF4444', desc: 'El paciente canceló el turno' },
                { label: 'Reprogramó', color: '#F59E0B', desc: 'Se cambió la fecha del turno' },
            ]},
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
            background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0',
            padding: '24px', marginBottom: '24px',
        }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="#F59E0B" /> Diagrama de Flujo del Sistema
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.78rem', color: '#64748B' }}>
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
                                padding: '16px 20px', borderRadius: '14px', minWidth: '150px',
                                background: `linear-gradient(135deg, ${step.color}08, ${step.color}15)`,
                                border: `2px solid ${step.color}30`,
                                transition: 'all .2s',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${step.color}20`; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <div style={{
                                    width: '44px', height: '44px', borderRadius: '12px',
                                    background: `linear-gradient(135deg, ${step.color}, ${step.color}CC)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: '8px', boxShadow: `0 4px 12px ${step.color}30`,
                                }}>
                                    <Icon size={20} color="#fff" />
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E293B' }}>{step.label}</span>
                                <span style={{ fontSize: '0.68rem', color: '#64748B', textAlign: 'center', marginTop: '2px', lineHeight: 1.3 }}>{step.desc}</span>
                            </div>
                            {i < WORKFLOW_STEPS.length - 1 && (
                                <div style={{ padding: '0 6px', color: '#CBD5E1' }}>
                                    <ArrowRight size={22} />
                                </div>
                            )}
                        </div>
                    );
                })}
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
            background: '#fff', borderRadius: '16px',
            border: '1px solid #E2E8F0', overflow: 'hidden',
            transition: 'box-shadow 0.2s',
            boxShadow: expanded ? '0 4px 20px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.04)',
        }}>
            <button
                onClick={() => setExpanded(p => !p)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    width: '100%', padding: '18px 22px', border: 'none',
                    background: expanded ? section.bg : '#fff',
                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s',
                }}
            >
                <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: `${section.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Icon size={20} style={{ color: section.color }} />
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B', margin: 0 }}>{section.title}</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0' }}>{section.description}</p>
                </div>
                <ChevronDown size={16} style={{
                    transition: 'transform 0.2s', color: '#94A3B8',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }} />
            </button>

            {expanded && (
                <div className="animate-fade-in" style={{ padding: '0 22px 22px' }}>
                    {section.image && (
                        <div style={{
                            borderRadius: '12px', overflow: 'hidden',
                            border: '1px solid #E2E8F0', marginBottom: '16px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
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
        <div className="content no-print" style={{ maxWidth: '960px', margin: '0 auto', paddingBottom: '40px' }}>
            {/* Hero Banner */}
            <div className="animate-fade-in" style={{
                background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 50%, #60A5FA 100%)',
                borderRadius: '20px', padding: '36px 40px', color: '#fff',
                marginBottom: '24px', position: 'relative', overflow: 'hidden',
            }}>
                <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '140px', height: '140px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ position: 'absolute', bottom: '-20px', right: '80px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <Home size={28} style={{ opacity: 0.9 }} />
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>{saludo} 👋</h1>
                    </div>
                    <p style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '16px', maxWidth: '650px', lineHeight: 1.6 }}>
                        Bienvenido al <strong>Sistema de Recepciones</strong> del Sanatorio Argentino.
                        Gestioná chequeos preventivos, mensajería con pacientes y seguimiento de turnos desde un solo lugar.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {[
                            { icon: HeartPulse, label: 'Chequeos', sub: 'Prevención' },
                            { icon: MessageCircle, label: 'Mensajería', sub: 'WhatsApp' },
                            { icon: RefreshCw, label: 'Remarketing', sub: 'Recordatorios' },
                            { icon: BarChart3, label: 'Métricas', sub: 'Análisis' },
                        ].map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 14px', borderRadius: '10px',
                                    background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                                    fontSize: '0.8rem', fontWeight: 600,
                                }}>
                                    <Icon size={15} />
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
