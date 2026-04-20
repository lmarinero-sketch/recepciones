import { useState } from 'react';
import {
    Settings, PanelLeftClose, PanelLeft,
    ChevronDown, Home, MessageSquareText, MessageCircle,
    Brain, HeartPulse,
} from 'lucide-react';

export default function Sidebar({ collapsed, onToggle, activeView, onViewChange, unreadMessageCount = 0 }) {
    const [mensajeriaOpen, setMensajeriaOpen] = useState(false);

    const mensajeriaSubItems = [
        { id: 'mensajeria', label: 'Chat Central', icon: MessageCircle },
        { id: 'plantillas', label: 'Plantillas', icon: MessageSquareText },
    ];

    const isMensajeriaActive = mensajeriaSubItems.some(i => activeView === i.id);

    function renderGroup({ label, icon: GroupIcon, isOpen, setOpen, isGroupActive, subItems, badge }) {
        if (collapsed) {
            return subItems.map(item => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                    <button
                        key={item.id}
                        className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                        onClick={() => onViewChange(item.id)}
                        title={item.label}
                    >
                        <Icon size={20} className="sidebar__item-icon" />
                        {isActive && <div className="sidebar__item-indicator" />}
                    </button>
                );
            });
        }

        return (
            <div style={{ marginBottom: '4px' }}>
                <button
                    onClick={() => setOpen(prev => !prev)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '10px 16px', border: 'none',
                        background: isGroupActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        color: isGroupActive ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                        cursor: 'pointer', borderRadius: 'var(--radius-md, 8px)',
                        fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s',
                        textAlign: 'left',
                    }}
                >
                    <GroupIcon size={20} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {badge}
                    <ChevronDown size={14} style={{
                        transition: 'transform 0.2s ease',
                        transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        opacity: 0.5,
                    }} />
                </button>

                {isOpen && (
                    <div className="animate-fade-in" style={{
                        marginLeft: '20px', borderLeft: '2px solid rgba(255, 255, 255, 0.2)',
                        paddingLeft: '0', marginTop: '2px',
                    }}>
                        {subItems.map(item => {
                            const Icon = item.icon;
                            const isActive = activeView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                                    onClick={() => onViewChange(item.id)}
                                    style={{ paddingLeft: '14px', fontSize: '0.8rem' }}
                                >
                                    <Icon size={17} className="sidebar__item-icon" />
                                    <span className="sidebar__item-label">{item.label}</span>
                                    {isActive && <div className="sidebar__item-indicator" />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
            <div className="sidebar__brand">
                <div className="sidebar__logo">
                    <img src="/logosanatorio.png" alt="Sanatorio Argentino" className="sidebar__logo-img" style={{ width: collapsed ? 32 : 38, height: collapsed ? 32 : 38, borderRadius: '8px', objectFit: 'contain' }} />
                    {!collapsed && (
                        <div className="sidebar__brand-text animate-fade-in">
                            <span className="sidebar__brand-name">Sanatorio</span>
                            <span className="sidebar__brand-sub">Argentino</span>
                        </div>
                    )}
                </div>
                <button
                    className="sidebar__toggle"
                    onClick={onToggle}
                    aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
                >
                    {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                </button>
            </div>

            <nav className="sidebar__nav">
                {(() => {
                    const isActive = activeView === 'inicio';
                    return (
                        <button
                            className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                            onClick={() => onViewChange('inicio')}
                            title={collapsed ? 'Inicio' : undefined}
                        >
                            <Home size={20} className="sidebar__item-icon" />
                            {!collapsed && <span className="sidebar__item-label">Inicio</span>}
                            {isActive && <div className="sidebar__item-indicator" />}
                        </button>
                    );
                })()}

                {renderGroup({
                    label: 'Mensajería',
                    icon: MessageCircle,
                    isOpen: mensajeriaOpen,
                    setOpen: setMensajeriaOpen,
                    isGroupActive: isMensajeriaActive,
                    subItems: mensajeriaSubItems,
                    badge: unreadMessageCount > 0 ? (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: '20px', height: '20px', padding: '0 5px', borderRadius: '10px',
                            background: '#EF4444', color: '#fff', fontSize: '0.65rem', fontWeight: 800,
                            lineHeight: 1, animation: 'pulse 2s ease-in-out infinite',
                            boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)',
                        }}>{unreadMessageCount > 99 ? '99+' : unreadMessageCount}</span>
                    ) : null,
                })}

                {(() => {
                    const isActive = activeView === 'chequeos';
                    return (
                        <button
                            className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                            onClick={() => onViewChange('chequeos')}
                            title={collapsed ? 'Chequeos' : undefined}
                        >
                            <HeartPulse size={20} className="sidebar__item-icon" />
                            {!collapsed && <span className="sidebar__item-label">Chequeos</span>}
                            {isActive && <div className="sidebar__item-indicator" />}
                        </button>
                    );
                })()}

                {!collapsed && (
                    <div style={{
                        height: '1px', background: 'rgba(255, 255, 255, 0.1)',
                        margin: '4px 16px 4px',
                    }} />
                )}

                {[
                    { id: 'simon', label: 'Simon IA', icon: Brain },
                ].map(item => {
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    return (
                        <button
                            key={item.id}
                            className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                            onClick={() => onViewChange(item.id)}
                            title={collapsed ? item.label : undefined}
                        >
                            <Icon size={20} className="sidebar__item-icon" />
                            {!collapsed && <span className="sidebar__item-label">{item.label}</span>}
                            {isActive && <div className="sidebar__item-indicator" />}
                        </button>
                    );
                })}

                {(() => {
                    const isActive = activeView === 'configuracion';
                    return (
                        <button
                            className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                            onClick={() => onViewChange('configuracion')}
                            title={collapsed ? 'Configuración' : undefined}
                        >
                            <Settings size={20} className="sidebar__item-icon" />
                            {!collapsed && <span className="sidebar__item-label">Configuración</span>}
                            {isActive && <div className="sidebar__item-indicator" />}
                        </button>
                    );
                })()}
            </nav>

            <div className="sidebar__footer">
                {!collapsed && (
                    <div className="sidebar__footer-info animate-fade-in">
                        <p className="sidebar__footer-version">Recepciones v1.0</p>
                        <p className="sidebar__footer-by">Innovación y Transformación Digital</p>
                    </div>
                )}
            </div>
        </aside>
    );
}
