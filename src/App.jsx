import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Sidebar from './components/Sidebar.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import ChangePasswordModal from './components/ChangePasswordModal.jsx';
import { getCurrentUser, logout as authLogout } from './services/authService';
import { logAction } from './services/auditService';
import { subscribeToAllIncoming, fetchUnreadCounts } from './services/chatService';
import { LogOut, KeyRound } from 'lucide-react';
import MessagingPanel from './components/MessagingPanel.jsx';
import TemplateManager from './components/TemplateManager.jsx';
import WhatsAppLineStatus from './components/WhatsAppLineStatus.jsx';
import HomePanel from './components/HomePanel.jsx';
import ChequeoPanel from './components/ChequeoPanel.jsx';
import ConfigPanel from './components/ConfigPanel.jsx';
import './App.css';

function AppRoot() {
    const [currentUser, setCurrentUser] = useState(() => getCurrentUser());

    const handleLogin = useCallback((user) => {
        setCurrentUser(user);
    }, []);

    const handleLogout = useCallback(async () => {
        await logAction('logout', { usuario: currentUser?.usuario });
        authLogout();
        setCurrentUser(null);
    }, [currentUser]);

    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    return <App currentUser={currentUser} onLogout={handleLogout} />;
}

function App({ currentUser, onLogout }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
    const [activeView, setActiveViewRaw] = useState(() => localStorage.getItem('active_view') || 'inicio');

    const setActiveView = useCallback((view) => {
        setActiveViewRaw(view);
        localStorage.setItem('active_view', view);
    }, []);

    const [showChangePassword, setShowChangePassword] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [globalUnreadCount, setGlobalUnreadCount] = useState(0);

    const addToast = useCallback((message, type = 'info') => {
        const id = uuidv4();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3500);
    }, []);

    const playNotificationSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.value = 880;
            gain1.gain.setValueAtTime(0.15, ctx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.15);
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.value = 1175;
            gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(ctx.currentTime + 0.12);
            osc2.stop(ctx.currentTime + 0.3);
            setTimeout(() => ctx.close(), 500);
        } catch (e) { /* Audio not available */ }
    }, []);

    const activeViewRef = useRef(activeView);
    useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

    useEffect(() => {
        fetchUnreadCounts().then(counts => {
            const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
            setGlobalUnreadCount(total);
        }).catch(console.error);

        const unsub = subscribeToAllIncoming((newMsg) => {
            if (newMsg.direction === 'incoming') {
                playNotificationSound();
                setGlobalUnreadCount(prev => prev + 1);
                if (activeViewRef.current !== 'mensajeria') {
                    const senderName = newMsg.sender_name || newMsg.phone;
                    const preview = (newMsg.content || '📎 Media').substring(0, 40);
                    addToast(`💬 ${senderName}: ${preview}`, 'info');
                }
            }
        });

        return () => unsub();
    }, [playNotificationSound, addToast]);

    useEffect(() => {
        if (activeView === 'mensajeria') {
            return () => {
                fetchUnreadCounts().then(counts => {
                    const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
                    setGlobalUnreadCount(total);
                }).catch(console.error);
            };
        }
    }, [activeView]);

    return (
        <div className="app">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(prev => { const next = !prev; localStorage.setItem('sidebar_collapsed', next); return next; })}
                activeView={activeView}
                onViewChange={setActiveView}
                unreadMessageCount={globalUnreadCount}
            />

            <main className={`main ${sidebarCollapsed ? 'main--expanded' : ''}`}>
                <header className="topbar no-print" style={{ flexShrink: 0 }}>
                    <div className="topbar__left">
                        <h1 className="topbar__title"><span className="topbar__title-accent">Recepciones</span> Sanatorio Argentino</h1>
                        <span className="topbar__subtitle">{activeView === 'chequeos' ? 'Chequeos Preventivos' : activeView === 'configuracion' ? 'Configuración del Sistema' : 'Centro de Mensajería'}</span>
                    </div>
                    
                    {activeView === 'mensajeria' && (
                        <WhatsAppLineStatus />
                    )}
                    
                    <div className="topbar__right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="topbar__date">
                            {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '4px 4px 4px 12px',
                            background: 'var(--neutral-50)',
                            borderRadius: '20px',
                            border: '1px solid var(--neutral-200)',
                        }}>
                            <span style={{
                                fontSize: '0.78rem', fontWeight: 600,
                                color: 'var(--neutral-600)',
                            }}>
                                {currentUser.nombre?.includes('@')
                                    ? currentUser.nombre.split('@')[0].replace(/^\w/, c => c.toUpperCase())
                                    : currentUser.nombre}
                            </span>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 800, color: '#fff',
                            }}>
                                {currentUser.iniciales}
                            </div>
                            <button
                                onClick={() => setShowChangePassword(true)}
                                title="Cambiar contraseña"
                                style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'none', border: '1px solid var(--neutral-200)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: 'var(--neutral-400)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <KeyRound size={13} />
                            </button>
                            <button
                                onClick={onLogout}
                                title="Cerrar sesión"
                                style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'none', border: '1px solid var(--neutral-200)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: 'var(--neutral-400)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <LogOut size={13} />
                            </button>
                        </div>
                    </div>
                </header>

                {activeView === 'inicio' && (
                    <HomePanel />
                )}

                {activeView === 'mensajeria' && (
                    <MessagingPanel addToast={addToast} />
                )}

                {activeView === 'plantillas' && (
                    <div className="content no-print">
                        <TemplateManager addToast={addToast} />
                    </div>
                )}

                {activeView === 'chequeos' && (
                    <ChequeoPanel addToast={addToast} />
                )}

                {activeView === 'configuracion' && (
                    <ConfigPanel addToast={addToast} />
                )}
            </main>

            <ChangePasswordModal
                isOpen={showChangePassword}
                onClose={() => setShowChangePassword(false)}
                currentUser={currentUser}
                addToast={addToast}
            />

            {toasts.length > 0 && (
                <div className="toast-container">
                    {toasts.map(toast => (
                        <div key={toast.id} className={`toast toast--${toast.type}`}>
                            <span className="toast__message">{toast.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default AppRoot;

