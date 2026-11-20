/**
 * MessagingPanel — WhatsApp Chat UI (Estética Sistema ADM-QUI)
 * Full-featured messaging panel with conversation list, real-time chat,
 * resizable sidebar, quick operational filters, SALUS patient context,
 * audio recording, image/PDF attachments, and Meta WhatsApp template integration.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    MessageSquare, Search, Plus, Send, Phone, User, X,
    ArrowLeft, Smile, Mic, Loader,
    RefreshCw, Play, Pause, Volume2, Download, Paperclip, Zap,
    CheckCheck, Calendar, Shield, DollarSign,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Stethoscope, FileText,
    AlertTriangle, CheckCircle, Copy
} from 'lucide-react';
import {
    fetchConversations, fetchMessages, saveOutgoingMessage,
    markAsRead, markAllAsRead, subscribeToMessages, subscribeToAllIncoming,
    fetchCrmContacts, upsertCrmContact, assignLine,
} from '../services/chatService';
import { sendWhatsAppMessage, normalizeArgentinePhone } from '../services/builderbotApi';
import { searchPatients } from '../services/patientService';
import { fetchShortcuts } from '../services/shortcutService';
import { fetchMetaTemplates, sendMetaTemplate } from '../services/metaTemplateService';
import { supabase } from '../lib/supabase';
import ShortcutManager from './ShortcutManager';

const EMOJI_LIST = [
    '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳',
    '😅', '😆', '😉', '😋', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
    '👍', '👎', '👏', '🙌', '🤝', '💪', '✌️', '🤞', '🫶', '❤️',
    '🔥', '⭐', '✅', '❌', '⚠️', '🏥', '💊', '🩺', '📋', '📞',
    '🙏', '💯', '🎉', '🎊', '👋', '👌', '🤙', '📌', '⏰', '🗓️',
];

const VISIT_STATUS_CONFIG = {
    presente: {
        bg: '#DCFCE7',
        color: '#15803D',
        border: '#86EFAC',
        accent: '#16A34A',
        label: 'Presente',
    },
    informe: {
        bg: '#FEF3C7',
        color: '#B45309',
        border: '#FCD34D',
        accent: '#D97706',
        label: 'Informe',
    },
    chequeo: {
        bg: '#F3E8FF',
        color: '#7E22CE',
        border: '#D8B4FE',
        accent: '#9333EA',
        label: 'Chequeo',
    },
    agendado: {
        bg: '#E0F2FE',
        color: '#0369A1',
        border: '#7DD3FC',
        accent: '#0284C7',
        label: 'Agendado',
    },
};

export default function MessagingPanel({ addToast }) {
    // === STATE ===
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPhone, setSelectedPhone] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [sending, setSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewChat, setShowNewChat] = useState(false);
    const [newChatPhone, setNewChatPhone] = useState('');
    const [newChatName, setNewChatName] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [patientSearching, setPatientSearching] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const [contactNames, setContactNames] = useState({});
    const [crmContacts, setCrmContacts] = useState({});

    // Media
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [playingAudio, setPlayingAudio] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    // Shortcuts / Templates
    const [shortcuts, setShortcuts] = useState([]);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [shortcutFilter, setShortcutFilter] = useState('');
    const [shortcutIndex, setShortcutIndex] = useState(0);
    const [showShortcutManager, setShowShortcutManager] = useState(false);

    // Meta WhatsApp Templates
    const [metaTemplates, setMetaTemplates] = useState([]);
    const [metaTemplateError, setMetaTemplateError] = useState(null);
    const [showMetaCostModal, setShowMetaCostModal] = useState(false);
    const [pendingMetaTemplate, setPendingMetaTemplate] = useState(null);
    const [sendingMetaTemplate, setSendingMetaTemplate] = useState(false);
    const [templateJustSent, setTemplateJustSent] = useState(false);

    // Patient context (SALUS visitas + optional surgery/budget)
    const [visitasMap, setVisitasMap] = useState({});
    const [patientContext, setPatientContext] = useState(null);
    const [showBudgetDetail, setShowBudgetDetail] = useState(false);
    const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'today' | 'week' | 'informe' | 'presente' | 'unread'

    // Resizable Sidebar Width (Drag & Drop splitter)
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const saved = Number(localStorage.getItem('msg_panel_sidebar_width'));
            return saved >= 320 && saved <= 750 ? saved : 440;
        } catch {
            return 440;
        }
    });
    const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
    const panelContainerRef = useRef(null);

    // Horizontal Scroll & Drag for Quick Filters Bar
    const filtersBarRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isPillsDragging, setIsPillsDragging] = useState(false);
    const pillsDragStateRef = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });

    const checkPillsScroll = useCallback(() => {
        const el = filtersBarRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 4);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }, []);

    useEffect(() => {
        checkPillsScroll();
        window.addEventListener('resize', checkPillsScroll);
        return () => window.removeEventListener('resize', checkPillsScroll);
    }, [checkPillsScroll, conversations.length, visitasMap]);

    // Convert mouse wheel vertical scroll into horizontal scroll on the pills bar
    useEffect(() => {
        const el = filtersBarRef.current;
        if (!el) return;
        const onWheel = (e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
                checkPillsScroll();
            }
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [checkPillsScroll]);

    const handlePillsMouseDown = (e) => {
        const el = filtersBarRef.current;
        if (!el) return;
        pillsDragStateRef.current = {
            isDown: true,
            startX: e.pageX - el.offsetLeft,
            scrollLeft: el.scrollLeft,
            moved: false,
        };
    };

    const handlePillsMouseMove = (e) => {
        const st = pillsDragStateRef.current;
        const el = filtersBarRef.current;
        if (!st.isDown || !el) return;
        const x = e.pageX - el.offsetLeft;
        const walk = x - st.startX;
        if (Math.abs(walk) > 5) {
            st.moved = true;
            setIsPillsDragging(true);
            el.scrollLeft = st.scrollLeft - walk;
            checkPillsScroll();
        }
    };

    const handlePillsMouseUp = () => {
        pillsDragStateRef.current.isDown = false;
        setTimeout(() => {
            pillsDragStateRef.current.moved = false;
            setIsPillsDragging(false);
        }, 0);
    };

    const handlePillClick = (callback) => {
        if (pillsDragStateRef.current.moved) return;
        callback();
    };

    const scrollFilters = (delta) => {
        const el = filtersBarRef.current;
        if (!el) return;
        el.scrollBy({ left: delta, behavior: 'smooth' });
        setTimeout(checkPillsScroll, 220);
    };

    // Dual WhatsApp line state
    const [whatsappLines, setWhatsappLines] = useState([]);
    const [assignedLineId, setAssignedLineId] = useState('line_recepciones');
    const [showLineSelector, setShowLineSelector] = useState(false);
    const [showChangeLineModal, setShowChangeLineModal] = useState(false);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const audioRefs = useRef({});
    const mediaRecorderRef = useRef(null);
    const recordingChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const fileInputRef = useRef(null);

    // === Handle Sidebar Resizer Dragging ===
    const startResizingSidebar = useCallback((e) => {
        e.preventDefault();
        setIsDraggingSidebar(true);
    }, []);

    useEffect(() => {
        if (!isDraggingSidebar) return;

        const handleMouseMove = (e) => {
            if (!panelContainerRef.current) return;
            const rect = panelContainerRef.current.getBoundingClientRect();
            const newWidth = Math.min(750, Math.max(320, e.clientX - rect.left));
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsDraggingSidebar(false);
            try {
                localStorage.setItem('msg_panel_sidebar_width', String(sidebarWidth));
            } catch {
                // ignore storage errors
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingSidebar, sidebarWidth]);

    // === Load contacts from crm_contacts AND link with recepciones_visitas ===
    useEffect(() => {
        async function loadContactsAndVisitas() {
            try {
                const crmData = await fetchCrmContacts();
                setCrmContacts(crmData);

                const names = {};
                Object.entries(crmData).forEach(([phone, c]) => {
                    if (c.nombre && c.nombre.toLowerCase() !== 'unknown') {
                        names[phone] = c.nombre;
                    }
                });
                setContactNames(names);

                // Fetch recent visits from recepciones_visitas to enrich conversation cards
                const { data: visitasData } = await supabase
                    .from('recepciones_visitas')
                    .select('id, fecha, hora, paciente, dni, edad, obra_social, centro, departamento, tipo_visita, tipo_agenda, asistencia, medico, telefono1')
                    .not('telefono1', 'is', null)
                    .order('fecha', { ascending: false })
                    .limit(1500);

                if (visitasData && visitasData.length > 0) {
                    const byLast7 = {};
                    visitasData.forEach(v => {
                        const rawTel = String(v.telefono1 || '').replace(/\D/g, '');
                        if (rawTel.length >= 7) {
                            const key7 = rawTel.slice(-7);
                            if (!byLast7[key7]) {
                                byLast7[key7] = v;
                            }
                        }
                    });
                    setVisitasMap(byLast7);
                }
            } catch (e) {
                console.error('Error loading contacts & visitas:', e);
            }
        }
        loadContactsAndVisitas();
    }, []);

    // Helper to look up a visit by conversation phone
    const getVisitForPhone = useCallback((phone) => {
        if (!phone) return null;
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length < 7) return null;
        return visitasMap[digits.slice(-7)] || null;
    }, [visitasMap]);

    // === LOAD CONVERSATIONS ===
    const loadConversations = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const data = await fetchConversations();
            setConversations(data);
        } catch (e) {
            console.error(e);
            if (!silent) addToast?.('Error al cargar conversaciones', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadConversations();
        const pollConvos = setInterval(() => loadConversations(true), 8000);
        return () => clearInterval(pollConvos);
    }, [loadConversations]);

    // === Notification sound ===
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
        } catch {
            // Audio not available
        }
    }, []);

    // === Realtime: new incoming messages ===
    useEffect(() => {
        const unsub = subscribeToAllIncoming((newMsg) => {
            if (newMsg.direction === 'incoming') {
                playNotificationSound();
            }
            setConversations(prev => {
                const idx = prev.findIndex(c => c.phone === newMsg.phone);
                if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = {
                        ...updated[idx],
                        lastMessage: newMsg.content || '',
                        lastDate: newMsg.created_at,
                        direction: newMsg.direction,
                        unreadCount: (updated[idx].unreadCount || 0) + (newMsg.direction === 'incoming' ? 1 : 0),
                    };
                    return updated.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
                }
                return [{
                    phone: newMsg.phone,
                    lastMessage: newMsg.content || '',
                    lastDate: newMsg.created_at,
                    direction: newMsg.direction,
                    senderName: newMsg.sender_name || '',
                    unreadCount: newMsg.direction === 'incoming' ? 1 : 0,
                }, ...prev];
            });
        });
        return unsub;
    }, [playNotificationSound]);

    // === Load patient context when conversation selected ===
    useEffect(() => {
        if (!selectedPhone) {
            setPatientContext(null);
            setShowBudgetDetail(false);
            return;
        }

        async function loadContext() {
            try {
                const digits = String(selectedPhone).replace(/\D/g, '');
                const last7 = digits.length >= 7 ? digits.slice(-7) : digits;

                let visitas = [];
                if (last7) {
                    const { data: vData } = await supabase
                        .from('recepciones_visitas')
                        .select('id, fecha, hora, paciente, dni, edad, obra_social, centro, departamento, tipo_visita, tipo_agenda, asistencia, medico')
                        .ilike('telefono1', `%${last7}%`)
                        .order('fecha', { ascending: false })
                        .limit(15);
                    visitas = vData || [];
                }

                const latestVisit = visitas[0] || getVisitForPhone(selectedPhone) || null;

                // Optional surgery/budget context if linked in crm_contacts
                const contact = crmContacts[selectedPhone];
                let surgery = null;
                let budget = null;
                let budgetItems = [];

                if (contact?.id_paciente) {
                    const idPac = String(contact.id_paciente);
                    const { data: surgeries } = await supabase
                        .from('surgeries')
                        .select('obra_social, fecha_cirugia, medico, modulo, status')
                        .eq('id_paciente', idPac)
                        .order('fecha_cirugia', { ascending: false })
                        .limit(1);
                    surgery = surgeries?.[0] || null;

                    const { data: budgets } = await supabase
                        .from('presupuestos')
                        .select('id_presupuesto, importe_total, fecha, observaciones, aceptado')
                        .eq('id_paciente', idPac)
                        .order('fecha', { ascending: false })
                        .limit(1);
                    budget = budgets?.[0] || null;

                    if (budget?.id_presupuesto) {
                        const { data: items } = await supabase
                            .from('presupuesto_items')
                            .select('descripcion, cantidad, importe_unitario, importe_total')
                            .eq('id_presupuesto', budget.id_presupuesto)
                            .order('linea', { ascending: true });
                        budgetItems = items || [];
                    }
                }

                setPatientContext({
                    visit: latestVisit,
                    visitas,
                    surgery,
                    budget,
                    budgetItems,
                });
            } catch (e) {
                console.error('Error loading patient context:', e);
            }
        }
        loadContext();
    }, [selectedPhone, crmContacts, getVisitForPhone]);

    // === Load messages for selected conversation ===
    useEffect(() => {
        if (!selectedPhone) return;
        let cancelled = false;
        let pollInterval = null;

        async function load() {
            setMessagesLoading(true);
            try {
                const msgs = await fetchMessages(selectedPhone);
                if (!cancelled) {
                    setMessages(msgs);
                    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }), 100);
                    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }), 300);
                }
                await markAsRead(selectedPhone);
                setConversations(prev => prev.map(c =>
                    c.phone === selectedPhone ? { ...c, unreadCount: 0 } : c
                ));
            } catch (e) {
                console.error(e);
            } finally {
                if (!cancelled) setMessagesLoading(false);
            }
        }
        load();

        pollInterval = setInterval(async () => {
            try {
                const msgs = await fetchMessages(selectedPhone);
                setMessages(prev => {
                    const pendingOptimistic = prev.filter(m => m._optimistic);
                    const serverCount = msgs.length;
                    const realCount = prev.filter(m => !m._optimistic).length;
                    if (serverCount !== realCount) {
                        markAsRead(selectedPhone);
                        return [...msgs, ...pendingOptimistic];
                    }
                    return prev;
                });
            } catch (err) {
                console.error('[MessagingPanel] Poll error:', err);
            }
        }, 5000);

        return () => { cancelled = true; if (pollInterval) clearInterval(pollInterval); };
    }, [selectedPhone]);

    // === REALTIME: subscribe to selected conversation ===
    useEffect(() => {
        if (!selectedPhone) return;
        const unsub = subscribeToMessages(selectedPhone, (newMsg) => {
            setMessages(prev => {
                const existsById = prev.find(m => m.id === newMsg.id);
                if (existsById) return prev;
                if (newMsg.direction === 'outgoing') {
                    const optimisticIdx = prev.findIndex(m =>
                        m._optimistic && m.content === newMsg.content && m.phone === newMsg.phone
                    );
                    if (optimisticIdx >= 0) {
                        const updated = [...prev];
                        updated[optimisticIdx] = { ...newMsg, _optimistic: false };
                        return updated;
                    }
                }
                return [...prev, newMsg];
            });
            if (newMsg.direction === 'incoming') {
                markAsRead(selectedPhone);
            }
        });
        return unsub;
    }, [selectedPhone]);

    // === LOAD SHORTCUTS + META TEMPLATES ===
    useEffect(() => {
        fetchShortcuts(true).then(setShortcuts).catch(err => {
            console.warn('Could not load shortcuts:', err);
        });
        fetchMetaTemplates().then(templates => {
            setMetaTemplates(templates);
            setMetaTemplateError(null);
        }).catch(err => {
            console.warn('Could not load Meta templates:', err);
            setMetaTemplateError(err?.message || 'Error cargando plantillas');
        });
    }, []);

    useEffect(() => {
        setWhatsappLines([{ id: 'line_recepciones', label: 'Recepciones', phone: '5492645674986', color: '#128C7E', provider: 'meta' }]);
        setAssignedLineId('line_recepciones');
    }, []);

    useEffect(() => {
        if (!selectedPhone) return;
        setAssignedLineId('line_recepciones');
        setShowLineSelector(false);
        setTemplateJustSent(false);
    }, [selectedPhone]);

    const currentLine = useMemo(() =>
        whatsappLines.find(l => l.id === assignedLineId) || { id: 'line_recepciones', label: 'Recepciones', phone: '5492645674986', color: '#128C7E' },
        [whatsappLines, assignedLineId]);

    const handleSelectLine = async (lineId) => {
        setAssignedLineId(lineId);
        setShowLineSelector(false);
        setShowChangeLineModal(false);
        try {
            await assignLine(selectedPhone, lineId);
            addToast?.('Línea asignada', 'success');
        } catch (err) {
            console.error('Error assigning line:', err);
            addToast?.('Error asignando línea', 'error');
        }
    };

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // ==========================================
    // UPLOAD MEDIA TO SUPABASE STORAGE
    // ==========================================
    const uploadMedia = async (file, folder = 'chat-media') => {
        const ext = file.name?.split('.').pop() || 'bin';
        const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { data, error } = await supabase.storage
            .from('whatsapp-media')
            .upload(fileName, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(data.path);
        return urlData.publicUrl;
    };

    // ==========================================
    // SEND TEXT MESSAGE
    // ==========================================
    const handleSend = useCallback(async () => {
        if (!messageText.trim() || !selectedPhone || sending) return;
        const textToSend = messageText.trim();

        const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const optimisticMsg = {
            id: optimisticId,
            phone: selectedPhone,
            direction: 'outgoing',
            content: textToSend,
            media_type: 'text',
            media_url: null,
            sender_name: 'Recepciones',
            is_read: true,
            line_id: assignedLineId || 'line_recepciones',
            created_at: new Date().toISOString(),
            _optimistic: true,
        };

        setMessages(prev => [...prev, optimisticMsg]);
        setMessageText('');
        setShowEmoji(false);
        inputRef.current?.focus();

        setConversations(prev => {
            const idx = prev.findIndex(c => c.phone === selectedPhone);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = {
                    ...updated[idx],
                    lastMessage: textToSend,
                    lastDate: optimisticMsg.created_at,
                    direction: 'outgoing',
                };
                return updated.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
            }
            return prev;
        });

        setSending(true);
        try {
            const savedMsg = await saveOutgoingMessage({ phone: selectedPhone, content: textToSend, lineId: assignedLineId });
            if (savedMsg?.id) {
                setMessages(prev => prev.map(m =>
                    m.id === optimisticId ? { ...savedMsg, _optimistic: false } : m
                ));
            }
            sendWhatsAppMessage({ content: textToSend, number: selectedPhone, lineId: assignedLineId })
                .catch(apiErr => {
                    console.error('Error enviando WhatsApp API:', apiErr);
                    addToast?.('⚠️ El mensaje se guardó pero falló el envío por WhatsApp: ' + apiErr.message, 'error');
                });
        } catch (dbErr) {
            console.error('Error guardando mensaje:', dbErr);
            addToast?.('Error al guardar mensaje: ' + dbErr.message, 'error');
            setMessages(prev => prev.filter(m => m.id !== optimisticId));
        } finally {
            setSending(false);
        }
    }, [messageText, selectedPhone, sending, addToast, assignedLineId]);

    // ==========================================
    // SEND IMAGE / MEDIA
    // ==========================================
    const handleImageSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPhone) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isPdf = file.type === 'application/pdf';

        if (!isImage && !isVideo && !isPdf) {
            addToast?.('Solo se aceptan imágenes, videos y PDF', 'error');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            addToast?.('Máximo 15MB', 'error');
            return;
        }

        let folder = 'images';
        let mediaType = 'image';
        let contentIcon = '📷 Imagen';
        if (isVideo) { folder = 'videos'; mediaType = 'video'; contentIcon = '🎥 Video'; }
        if (isPdf) { folder = 'documents'; mediaType = 'document'; contentIcon = '📄 Documento PDF'; }

        setUploadingMedia(true);
        try {
            const mediaUrl = await uploadMedia(file, folder);
            await sendWhatsAppMessage({ content: messageText.trim() || contentIcon, number: selectedPhone, mediaUrl, lineId: assignedLineId });
            await saveOutgoingMessage({
                phone: selectedPhone,
                content: messageText.trim() || contentIcon,
                mediaType,
                mediaUrl,
                lineId: assignedLineId,
            });
            setMessageText('');
            addToast?.('Archivo enviado', 'success');
        } catch (err) {
            console.error('Error sending media:', err);
            addToast?.('Error enviando archivo', 'error');
        } finally {
            setUploadingMedia(false);
        }
    };

    // ==========================================
    // AUDIO RECORDING
    // ==========================================
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus' : 'audio/webm',
            });
            mediaRecorderRef.current = mediaRecorder;
            recordingChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordingChunksRef.current.push(e.data);
            };
            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
                if (blob.size < 1000) { addToast?.('Audio muy corto', 'error'); return; }
                await sendAudioBlob(blob);
            };
            mediaRecorder.start(250);
            setIsRecording(true);
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (err) {
            console.error('Microphone error:', err);
            addToast?.('No se pudo acceder al micrófono', 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
            mediaRecorderRef.current.stop();
            recordingChunksRef.current = [];
            setIsRecording(false);
            setRecordingTime(0);
            if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
        }
    };

    const sendAudioBlob = async (blob) => {
        setUploadingMedia(true);
        try {
            const file = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
            const mediaUrl = await uploadMedia(file, 'audios');
            await sendWhatsAppMessage({ content: '🎤 Audio', number: selectedPhone, mediaUrl, lineId: assignedLineId });
            await saveOutgoingMessage({
                phone: selectedPhone, content: '🎤 Audio', mediaType: 'audio', mediaUrl, lineId: assignedLineId,
            });
            addToast?.('Audio enviado', 'success');
        } catch (err) {
            console.error('Error sending audio:', err);
            addToast?.('Error enviando audio', 'error');
        } finally {
            setUploadingMedia(false);
        }
    };

    const formatRecordingTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // ==========================================
    // AUDIO PLAYBACK
    // ==========================================
    const toggleAudio = (msgId, url) => {
        const audio = audioRefs.current[msgId];
        if (!audio) {
            const newAudio = new Audio(url);
            audioRefs.current[msgId] = newAudio;
            newAudio.onended = () => setPlayingAudio(null);
            newAudio.play();
            setPlayingAudio(msgId);
        } else if (playingAudio === msgId) {
            audio.pause();
            setPlayingAudio(null);
        } else {
            Object.values(audioRefs.current).forEach(a => a.pause());
            audio.currentTime = 0;
            audio.play();
            setPlayingAudio(msgId);
        }
    };

    // ==========================================
    // SHORTCUTS / TEMPLATES
    // ==========================================
    const metaAsShortcuts = metaTemplates.map(t => ({
        id: `meta_${t.name || t.id}`,
        shortcut: t.name || t.templateName || 'template',
        label: t.name || t.templateName || 'Template',
        message: t.body || t.text || t.components?.find(c => c.type === 'BODY')?.text || `[Plantilla: ${t.name}]`,
        category: 'WhatsApp Meta 💰',
        _isMeta: true,
        _metaData: t,
    }));
    const allShortcuts = [...shortcuts, ...metaAsShortcuts];
    const filteredShortcuts = allShortcuts.filter(s => {
        if (!shortcutFilter) return true;
        const q = shortcutFilter.toLowerCase();
        return s.shortcut.toLowerCase().includes(q) ||
            s.label.toLowerCase().includes(q) ||
            s.category?.toLowerCase().includes(q);
    });

    const handleInputChange = (e) => {
        const val = e.target.value;
        setMessageText(val);
        if (val.startsWith('/')) {
            setShowShortcuts(true);
            setShortcutFilter(val.slice(1));
            setShortcutIndex(0);
        } else {
            setShowShortcuts(false);
            setShortcutFilter('');
        }
    };

    // === Clinical Patient Name Resolver (prioritizes SALUS / CRM legal name over cellphone pushname) ===
    const getResolvedPatientInfo = useCallback((phone, convSenderName) => {
        const crm = crmContacts[phone];
        const visit = getVisitForPhone(phone);

        const clinicalName = (crm?.nombre && crm?.id_paciente)
            ? crm.nombre
            : (visit?.paciente || crm?.nombre || contactNames[phone] || null);

        const cellName = convSenderName || '';
        const isDifferent = Boolean(
            cellName && clinicalName &&
            cellName.trim().toLowerCase() !== clinicalName.trim().toLowerCase() &&
            cellName !== phone
        );

        return {
            displayName: clinicalName || cellName || phone,
            clinicalName,
            isClinical: !!clinicalName,
            cellName: isDifferent ? cellName : null,
            dni: crm?.dni || visit?.dni || null,
            idPaciente: crm?.id_paciente || null,
        };
    }, [crmContacts, getVisitForPhone, contactNames]);

    const personalizeMessage = useCallback((message, name) => {
        if (!message) return message;
        const fechaHoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        let result = message;
        if (name && !message.includes('{nombre}') && !message.includes('{paciente}')) {
            result = result.replace(/Estimado\/a[,:.]?\s*/gi, `Estimado/a ${name} `);
        }
        result = result.replace(/\{nombre\}/gi, name || '');
        result = result.replace(/\{paciente\}/gi, name || '');
        result = result.replace(/\{fecha_hoy\}/gi, fechaHoy);
        const visitDate = patientContext?.visit?.fecha || patientContext?.surgery?.fecha_cirugia;
        if (visitDate) {
            const fc = new Date(visitDate + 'T12:00:00');
            const fechaStr = fc.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            result = result.replace(/\{fecha_cirugia\}/gi, fechaStr);
            result = result.replace(/\{fecha\}/gi, fechaStr);
        } else {
            result = result.replace(/\{fecha_cirugia\}/gi, '');
            result = result.replace(/\{fecha\}/gi, '');
        }
        result = result.replace(/\{obra_social\}/gi, patientContext?.visit?.obra_social || patientContext?.surgery?.obra_social || '');
        result = result.replace(/\{medico\}/gi, patientContext?.visit?.medico || patientContext?.surgery?.medico || '');
        const total = patientContext?.budget?.importe_total;
        result = result.replace(/\{presupuesto_total\}/gi, total ? `$${Number(total).toLocaleString('es-AR')}` : '');
        result = result.replace(/\{total_presupuesto\}/gi, total ? `$${Number(total).toLocaleString('es-AR')}` : '');
        return result;
    }, [patientContext]);

    const selectShortcut = useCallback((shortcut) => {
        if (shortcut._isMeta) {
            setPendingMetaTemplate(shortcut);
            setShowMetaCostModal(true);
            setShowShortcuts(false);
            setShortcutFilter('');
            setShortcutIndex(0);
            return;
        }
        const contactName = selectedPhone ? getResolvedPatientInfo(selectedPhone).displayName : '';
        const personalized = personalizeMessage(shortcut.message, contactName);
        setMessageText(personalized);
        setShowShortcuts(false);
        setShortcutFilter('');
        setShortcutIndex(0);
        inputRef.current?.focus();
    }, [selectedPhone, getResolvedPatientInfo, personalizeMessage]);

    const confirmSendMetaTemplate = useCallback(async () => {
        if (!pendingMetaTemplate || !selectedPhone || sendingMetaTemplate) return;
        setSendingMetaTemplate(true);
        try {
            const normalized = normalizeArgentinePhone(selectedPhone);
            const templateName = pendingMetaTemplate._metaData?.name || pendingMetaTemplate.shortcut;
            const lang = pendingMetaTemplate._metaData?.language || 'es';

            const bodyComponent = pendingMetaTemplate._metaData?.components?.find(c => c.type === 'BODY');
            const bodyText = bodyComponent?.text || '';
            const hasBodyVariables = /\{\{\d+\}\}/.test(bodyText);

            const patientDisplay = getResolvedPatientInfo(selectedPhone).displayName || 'Paciente';
            const components = hasBodyVariables ? [{
                type: 'body',
                parameters: [{ type: 'text', text: patientDisplay }]
            }] : [];

            await sendMetaTemplate({
                to: normalized,
                templateName,
                languageCode: lang,
                components,
            });

            const templateButtons = (pendingMetaTemplate._metaData?.components || [])
                .filter(c => c.type === 'BUTTONS')
                .flatMap(c => c.buttons || [])
                .map(b => b.text)
                .filter(Boolean);

            await saveOutgoingMessage({
                phone: selectedPhone,
                content: `📋 [Plantilla Meta] ${templateName}: ${pendingMetaTemplate.message.replace(/\{\{1\}\}/g, patientDisplay)}`,
                lineId: 'line_recepciones',
                rawPayload: templateButtons.length > 0 ? { templateButtons } : undefined,
            });
            setTemplateJustSent(true);
            addToast?.(`Plantilla "${templateName}" enviada`, 'success');
        } catch (err) {
            console.error('Error sending Meta template:', err);
            addToast?.(`Error enviando plantilla: ${err.message}`, 'error');
        } finally {
            setSendingMetaTemplate(false);
            setShowMetaCostModal(false);
            setPendingMetaTemplate(null);
            inputRef.current?.focus();
        }
    }, [pendingMetaTemplate, selectedPhone, sendingMetaTemplate, addToast, getResolvedPatientInfo]);

    useEffect(() => {
        if (!showMetaCostModal) return;
        const handleGlobalKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmSendMetaTemplate(); }
            if (e.key === 'Escape') { e.preventDefault(); setShowMetaCostModal(false); setPendingMetaTemplate(null); }
        };
        window.addEventListener('keydown', handleGlobalKey);
        return () => window.removeEventListener('keydown', handleGlobalKey);
    }, [showMetaCostModal, confirmSendMetaTemplate]);

    // === 24h Meta Window Detection ===
    const isMetaLine = true;
    const isWindowExpired = useMemo(() => {
        if (!selectedPhone) return false;
        const incomingMsgs = messages.filter(m => m.direction === 'incoming');
        if (incomingMsgs.length === 0) return true;
        const lastIncoming = incomingMsgs[incomingMsgs.length - 1];
        const lastTime = new Date(lastIncoming.created_at).getTime();
        const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
        return hoursSince >= 24;
    }, [selectedPhone, messages]);

    const quickSendMetaTemplate = useCallback((template) => {
        const bodyText = template.components?.find(c => c.type === 'BODY')?.text || template.body || `[Plantilla: ${template.name}]`;
        setPendingMetaTemplate({
            id: `meta_${template.name || template.id}`,
            shortcut: template.name || template.templateName || 'template',
            label: template.name || template.templateName || 'Template',
            message: bodyText,
            _isMeta: true,
            _metaData: template,
        });
        setShowMetaCostModal(true);
    }, []);

    // ==========================================
    // NEW CONVERSATION
    // ==========================================
    const handleStartNewChat = useCallback(async () => {
        if (!newChatPhone.trim()) return;
        const normalized = normalizeArgentinePhone(newChatPhone);
        const nombre = selectedPatient?.nombre || newChatName.trim() || normalized;
        try {
            await upsertCrmContact({
                phone: normalized, nombre,
                id_paciente: selectedPatient?.id_paciente || null,
                dni: selectedPatient?.dni || null,
            });
        } catch (e) { console.error('Error saving CRM contact:', e); }
        setContactNames(prev => ({ ...prev, [normalized]: nombre }));
        setSelectedPhone(normalized);
        setShowNewChat(false);
        setNewChatPhone(''); setNewChatName('');
        setSelectedPatient(null); setPatientResults([]);
        setConversations(prev => {
            const existing = prev.find(c => c.phone === normalized);
            if (existing) return prev;
            return [{ phone: normalized, lastMessage: '', lastDate: new Date().toISOString(), direction: 'outgoing', senderName: '', unreadCount: 0 }, ...prev];
        });
    }, [newChatPhone, newChatName, selectedPatient]);

    const handlePatientSearch = useCallback(async (query) => {
        setNewChatName(query);
        setSelectedPatient(null);
        if (query.length < 2) { setPatientResults([]); return; }
        setPatientSearching(true);
        try {
            const results = await searchPatients(query);
            setPatientResults(results?.slice(0, 8) || []);
        } catch (e) { console.error(e); } finally { setPatientSearching(false); }
    }, []);

    const selectPatientResult = useCallback((patient) => {
        setSelectedPatient(patient);
        setNewChatName(patient.nombre || '');
        setPatientResults([]);
    }, []);

    const handleKeyDown = (e) => {
        if (showMetaCostModal) {
            if (e.key === 'Enter') { e.preventDefault(); confirmSendMetaTemplate(); return; }
            if (e.key === 'Escape') { e.preventDefault(); setShowMetaCostModal(false); setPendingMetaTemplate(null); return; }
            return;
        }
        if (showShortcuts && filteredShortcuts.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setShortcutIndex(prev => (prev + 1) % filteredShortcuts.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setShortcutIndex(prev => (prev - 1 + filteredShortcuts.length) % filteredShortcuts.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectShortcut(filteredShortcuts[shortcutIndex]); return; }
        }
        if (e.key === 'Escape' && showShortcuts) { e.preventDefault(); setShowShortcuts(false); setMessageText(''); return; }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    // === Counts for Quick Operational Filter Pills ===
    const filterCounts = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const next7Days = todayStart + (7 * 24 * 60 * 60 * 1000);

        let todayCount = 0;
        let weekCount = 0;
        let informeCount = 0;
        let presenteCount = 0;

        conversations.forEach(c => {
            const visit = getVisitForPhone(c.phone);
            if (!visit) return;
            if (visit.fecha) {
                const d = new Date(visit.fecha + 'T12:00:00').getTime();
                if (d === todayStart) todayCount++;
                if (d >= todayStart && d <= next7Days) weekCount++;
            }
            const isInf = String(visit.tipo_visita || '').toUpperCase().includes('INFORME');
            if (isInf) informeCount++;
            if (visit.asistencia === 'Presente') presenteCount++;
        });

        return { todayCount, weekCount, informeCount, presenteCount };
    }, [conversations, getVisitForPhone]);

    // === Helper to format Visit Date & Status for Conversation Card (ADM-QUI style) ===
    const getVisitDateInfo = useCallback((visit) => {
        if (!visit?.fecha) return null;
        const d = new Date(visit.fecha + 'T12:00:00');
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const visitDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diffDays = Math.round((visitDay - todayStart) / (1000 * 60 * 60 * 24));

        const dayNum = d.getDate();
        const monthShort = d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase();
        const weekdayShort = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '').toUpperCase();

        const isToday = diffDays === 0;
        const isTomorrow = diffDays === 1;
        const isPast = diffDays < 0;

        let label = `${weekdayShort} ${dayNum} ${monthShort}`;
        if (isToday) {
            label = `🔴 HOY · ${dayNum}/${monthShort}`;
        } else if (isTomorrow) {
            label = `⚡ MAÑANA · ${dayNum}/${monthShort}`;
        } else if (diffDays === -1) {
            label = `AYER · ${dayNum}/${monthShort}`;
        }

        const isInf = String(visit.tipo_visita || '').toUpperCase().includes('INFORME');
        const isPres = visit.asistencia === 'Presente';
        const cfg = isPres
            ? VISIT_STATUS_CONFIG.presente
            : isInf
                ? VISIT_STATUS_CONFIG.informe
                : VISIT_STATUS_CONFIG.chequeo;

        return {
            label,
            formattedDate: `${dayNum}/${d.getMonth() + 1}`,
            dayNum,
            monthShort,
            weekdayShort,
            isToday,
            isTomorrow,
            isPast,
            diffDays,
            cfg,
        };
    }, []);

    // === FILTERED CONVERSATIONS — unread first ===
    const filtered = useMemo(() => {
        let list = conversations;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(c => {
                const info = getResolvedPatientInfo(c.phone, c.senderName);
                const matchText = c.phone.includes(q)
                    || info.displayName.toLowerCase().includes(q)
                    || (info.cellName && info.cellName.toLowerCase().includes(q))
                    || (c.lastMessage || '').toLowerCase().includes(q);
                if (matchText) return true;
                const visit = getVisitForPhone(c.phone);
                if (visit?.fecha) {
                    const d = new Date(visit.fecha + 'T12:00:00');
                    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
                    const dateStrPadded = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                    if (dateStr.includes(q) || dateStrPadded.includes(q) || q.includes(dateStr) || q.includes(dateStrPadded)) return true;
                }
                return false;
            });
        }

        if (quickFilter === 'today') {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            list = list.filter(c => {
                const visit = getVisitForPhone(c.phone);
                if (!visit?.fecha) return false;
                const d = new Date(visit.fecha + 'T12:00:00').getTime();
                return d === todayStart;
            });
        } else if (quickFilter === 'week') {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const next7Days = todayStart + (7 * 24 * 60 * 60 * 1000);
            list = list.filter(c => {
                const visit = getVisitForPhone(c.phone);
                if (!visit?.fecha) return false;
                const d = new Date(visit.fecha + 'T12:00:00').getTime();
                return d >= todayStart && d <= next7Days;
            });
        } else if (quickFilter === 'informe') {
            list = list.filter(c => String(getVisitForPhone(c.phone)?.tipo_visita || '').toUpperCase().includes('INFORME'));
        } else if (quickFilter === 'presente') {
            list = list.filter(c => getVisitForPhone(c.phone)?.asistencia === 'Presente');
        } else if (quickFilter === 'unread') {
            list = list.filter(c => c.unreadCount > 0);
        }

        return [...list].sort((a, b) => {
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
            return new Date(b.lastDate) - new Date(a.lastDate);
        });
    }, [conversations, searchQuery, getResolvedPatientInfo, getVisitForPhone, quickFilter]);

    const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0), [conversations]);

    // === HELPERS ===
    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === today.toDateString()) return time;
        if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    const formatFullDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };

    const groupedMessages = useMemo(() => {
        const groups = [];
        let lastDate = null;
        messages.forEach(msg => {
            const msgDate = new Date(msg.created_at).toDateString();
            if (msgDate !== lastDate) { groups.push({ type: 'date', date: msg.created_at }); lastDate = msgDate; }
            groups.push({ type: 'message', ...msg });
        });
        return groups;
    }, [messages]);

    const activeConv = useMemo(() => conversations.find(c => c.phone === selectedPhone) || null, [conversations, selectedPhone]);

    const activePatientInfo = useMemo(() => {
        if (!selectedPhone) return { displayName: '', clinicalName: null, cellName: null, isClinical: false, dni: null };
        return getResolvedPatientInfo(selectedPhone, activeConv?.senderName);
    }, [selectedPhone, activeConv, getResolvedPatientInfo]);

    // ==========================================
    // RENDER MESSAGE CONTENT (images, audio, video, docs, text)
    // ==========================================
    const renderMessageContent = (msg) => {
        let effectiveMediaType = msg.media_type;
        let effectiveContent = msg.content;

        if (typeof effectiveContent === 'string' && effectiveContent.startsWith('_event_')) {
            if (effectiveContent.includes('_voice_note_') || effectiveContent.includes('_audio_')) {
                effectiveMediaType = 'audio';
            } else if (effectiveContent.includes('_image_')) {
                effectiveMediaType = 'image';
            } else if (effectiveContent.includes('_video_')) {
                effectiveMediaType = 'video';
            } else if (effectiveContent.includes('_document_') || effectiveContent.includes('_media_')) {
                effectiveMediaType = 'document';
            }
            effectiveContent = '';
        }

        switch (effectiveMediaType) {
            case 'image':
            case 'sticker':
                return (
                    <div>
                        {msg.media_url ? (
                            <img
                                src={msg.media_url}
                                alt={effectiveMediaType === 'sticker' ? 'Sticker' : 'Imagen'}
                                className="msg-panel__bubble-image"
                                onClick={() => setLightboxUrl(msg.media_url)}
                                onError={(e) => { e.target.style.display = 'none'; }}
                                style={effectiveMediaType === 'sticker' ? {
                                    maxWidth: '160px', maxHeight: '160px',
                                    borderRadius: '4px', background: 'transparent',
                                } : undefined}
                            />
                        ) : (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 14px', borderRadius: '10px',
                                background: msg.direction === 'outgoing' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.03)',
                                fontSize: '0.8rem', color: '#94A3B8',
                                fontStyle: 'italic',
                            }}>
                                <span style={{ fontSize: '1.4rem' }}>{effectiveMediaType === 'sticker' ? '🏷️' : '🖼️'}</span>
                                <span>{effectiveMediaType === 'sticker' ? 'Sticker' : 'Imagen no disponible'}</span>
                            </div>
                        )}
                        {effectiveContent && effectiveContent !== '[image]' && effectiveContent !== '[sticker]' && effectiveContent !== '📷 Imagen' && (
                            <p className="msg-panel__bubble-text">{effectiveContent}</p>
                        )}
                    </div>
                );
            case 'audio':
                return (
                    <div className="msg-panel__audio-player">
                        <button
                            className="msg-panel__audio-play-btn"
                            onClick={() => toggleAudio(msg.id, msg.media_url)}
                            style={{ background: msg.direction === 'outgoing' ? 'rgba(0,0,0,0.08)' : '#25D366' }}
                        >
                            {playingAudio === msg.id ? <Pause size={14} color="#fff" /> : <Play size={14} color="#fff" />}
                        </button>
                        <div className="msg-panel__audio-bar">
                            <div className="msg-panel__audio-progress" style={{ width: playingAudio === msg.id ? '60%' : '0%' }} />
                        </div>
                        <Volume2 size={12} style={{ opacity: 0.4 }} />
                    </div>
                );
            case 'video':
                return (
                    <div>
                        <video src={msg.media_url} controls style={{ maxWidth: '280px', borderRadius: '8px', display: 'block' }} />
                        {effectiveContent && effectiveContent !== '[video]' && <p className="msg-panel__bubble-text">{effectiveContent}</p>}
                    </div>
                );
            case 'document':
                return (
                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="msg-panel__doc-link">
                        <Download size={16} />
                        <span>{effectiveContent || 'Documento adjunto'}</span>
                    </a>
                );
            default: {
                const buttons = msg.raw_payload?.templateButtons;
                if (buttons && buttons.length > 0) {
                    return (
                        <div className="msg-panel__template-msg">
                            <p className="msg-panel__bubble-text">{effectiveContent}</p>
                            <div className="msg-panel__template-buttons">
                                {buttons.map((btn, i) => (
                                    <span key={i} className="msg-panel__template-btn">↩ {btn}</span>
                                ))}
                            </div>
                        </div>
                    );
                }
                return <p className="msg-panel__bubble-text">{effectiveContent}</p>;
            }
        }
    };

    // ===========================
    //  RENDER
    // ===========================
    return (
        <div className="msg-panel" ref={panelContainerRef} style={{ userSelect: isDraggingSidebar ? 'none' : 'auto' }}>
            {/* ========== LEFT: Conversation List ========== */}
            <div className="msg-panel__sidebar" style={{ width: `${sidebarWidth}px`, minWidth: '320px', maxWidth: '750px' }}>
                <div className="msg-panel__sidebar-header">
                    <h3 className="msg-panel__sidebar-title">
                        <MessageSquare size={18} />
                        Mensajería
                        {totalUnread > 0 && (
                            <span className="msg-panel__total-badge">{totalUnread}</span>
                        )}
                    </h3>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {totalUnread > 0 && (
                            <button
                                className="msg-panel__btn-icon"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        await markAllAsRead();
                                        setConversations(prev => prev.map(c => ({ ...c, unreadCount: 0 })));
                                        addToast?.('✅ Todos los mensajes marcados como leídos', 'success');
                                    } catch {
                                        addToast?.('Error al marcar como leídos', 'error');
                                    }
                                }}
                                title="Marcar todos como leídos"
                                style={{ color: '#16A34A' }}
                            >
                                <CheckCheck size={18} />
                            </button>
                        )}
                        <button className="msg-panel__btn-icon" onClick={() => setShowNewChat(true)} title="Nueva conversación">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="msg-panel__search">
                    <Search size={15} className="msg-panel__search-icon" />
                    <input
                        type="text" placeholder="Buscar conversación..."
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="msg-panel__search-input"
                    />
                </div>

                {/* ── Quick Operational Filters Bar (Desplazable con rueda, arrastre o flechas) ── */}
                <div style={{ position: 'relative', flexShrink: 0, padding: '2px 8px 6px' }}>
                    {canScrollLeft && (
                        <button
                            type="button"
                            onClick={() => scrollFilters(-140)}
                            style={{
                                position: 'absolute',
                                left: '2px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 6,
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#1E293B',
                                padding: 0
                            }}
                            title="Ver filtros anteriores"
                        >
                            <ChevronLeft size={14} />
                        </button>
                    )}

                    {canScrollRight && (
                        <button
                            type="button"
                            onClick={() => scrollFilters(140)}
                            style={{
                                position: 'absolute',
                                right: '2px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 6,
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#1E293B',
                                padding: 0
                            }}
                            title="Ver más filtros"
                        >
                            <ChevronRight size={14} />
                        </button>
                    )}

                    <div
                        ref={filtersBarRef}
                        onScroll={checkPillsScroll}
                        onMouseDown={handlePillsMouseDown}
                        onMouseMove={handlePillsMouseMove}
                        onMouseUp={handlePillsMouseUp}
                        onMouseLeave={handlePillsMouseUp}
                        className="msg-panel__quick-filters"
                        style={{
                            display: 'flex', gap: '6px', padding: '2px 8px 6px',
                            overflowX: 'auto',
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#CBD5E1 transparent',
                            cursor: isPillsDragging ? 'grabbing' : 'grab',
                            userSelect: isPillsDragging ? 'none' : 'auto',
                            scrollBehavior: 'smooth'
                        }}
                    >
                        <button
                            onClick={() => handlePillClick(() => setQuickFilter('all'))}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '4px 10px', borderRadius: '16px', border: '1px solid',
                                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                background: quickFilter === 'all' ? '#1E293B' : '#FFFFFF',
                                borderColor: quickFilter === 'all' ? '#1E293B' : '#E2E8F0',
                                color: quickFilter === 'all' ? '#FFFFFF' : '#475569',
                                boxShadow: quickFilter === 'all' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s',
                                flexShrink: 0
                            }}
                        >
                            Todos <span style={{ opacity: 0.75, fontSize: '0.66rem' }}>({conversations.length})</span>
                        </button>

                        {filterCounts.todayCount > 0 && (
                            <button
                                onClick={() => handlePillClick(() => setQuickFilter(quickFilter === 'today' ? 'all' : 'today'))}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '4px 10px', borderRadius: '16px', border: '1px solid',
                                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                    background: quickFilter === 'today' ? '#DC2626' : '#FEF2F2',
                                    borderColor: quickFilter === 'today' ? '#DC2626' : '#FCA5A5',
                                    color: quickFilter === 'today' ? '#FFFFFF' : '#B91C1C',
                                    boxShadow: quickFilter === 'today' ? '0 2px 6px rgba(220, 38, 38, 0.25)' : 'none',
                                    transition: 'all 0.15s',
                                    flexShrink: 0
                                }}
                            >
                                🔴 Turnos Hoy <span style={{ opacity: 0.85, fontSize: '0.66rem' }}>({filterCounts.todayCount})</span>
                            </button>
                        )}

                        {filterCounts.weekCount > 0 && (
                            <button
                                onClick={() => handlePillClick(() => setQuickFilter(quickFilter === 'week' ? 'all' : 'week'))}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '4px 10px', borderRadius: '16px', border: '1px solid',
                                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                    background: quickFilter === 'week' ? '#2563EB' : '#EFF6FF',
                                    borderColor: quickFilter === 'week' ? '#2563EB' : '#BFDBFE',
                                    color: quickFilter === 'week' ? '#FFFFFF' : '#1D4ED8',
                                    boxShadow: quickFilter === 'week' ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                                    transition: 'all 0.15s',
                                    flexShrink: 0
                                }}
                            >
                                📅 Esta Semana <span style={{ opacity: 0.85, fontSize: '0.66rem' }}>({filterCounts.weekCount})</span>
                            </button>
                        )}

                        {filterCounts.informeCount > 0 && (
                            <button
                                onClick={() => handlePillClick(() => setQuickFilter(quickFilter === 'informe' ? 'all' : 'informe'))}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '4px 10px', borderRadius: '16px', border: '1px solid',
                                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                    background: quickFilter === 'informe' ? '#D97706' : '#FFFBEB',
                                    borderColor: quickFilter === 'informe' ? '#D97706' : '#FCD34D',
                                    color: quickFilter === 'informe' ? '#FFFFFF' : '#B45309',
                                    boxShadow: quickFilter === 'informe' ? '0 2px 6px rgba(217, 119, 6, 0.25)' : 'none',
                                    transition: 'all 0.15s',
                                    flexShrink: 0
                                }}
                            >
                                🟡 Informes <span style={{ opacity: 0.85, fontSize: '0.66rem' }}>({filterCounts.informeCount})</span>
                            </button>
                        )}

                        {filterCounts.presenteCount > 0 && (
                            <button
                                onClick={() => handlePillClick(() => setQuickFilter(quickFilter === 'presente' ? 'all' : 'presente'))}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '4px 10px', borderRadius: '16px', border: '1px solid',
                                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                    background: quickFilter === 'presente' ? '#15803D' : '#F0FDF4',
                                    borderColor: quickFilter === 'presente' ? '#15803D' : '#86EFAC',
                                    color: quickFilter === 'presente' ? '#FFFFFF' : '#15803D',
                                    boxShadow: quickFilter === 'presente' ? '0 2px 6px rgba(21, 128, 61, 0.25)' : 'none',
                                    transition: 'all 0.15s',
                                    flexShrink: 0
                                }}
                            >
                                🟢 Presentes <span style={{ opacity: 0.85, fontSize: '0.66rem' }}>({filterCounts.presenteCount})</span>
                            </button>
                        )}

                        {totalUnread > 0 && (
                            <button
                                onClick={() => handlePillClick(() => setQuickFilter(quickFilter === 'unread' ? 'all' : 'unread'))}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '4px 10px', borderRadius: '16px', border: '1px solid',
                                    fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                    background: quickFilter === 'unread' ? '#2563EB' : '#EFF6FF',
                                    borderColor: quickFilter === 'unread' ? '#2563EB' : '#93C5FD',
                                    color: quickFilter === 'unread' ? '#FFFFFF' : '#1D4ED8',
                                    boxShadow: quickFilter === 'unread' ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                                    transition: 'all 0.15s',
                                    flexShrink: 0
                                }}
                            >
                                📬 Sin Leer <span style={{ opacity: 0.85, fontSize: '0.66rem' }}>({totalUnread})</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* New Chat Form */}
                {showNewChat && (
                    <div className="msg-panel__new-chat animate-fade-in">
                        <div className="msg-panel__new-chat-header">
                            <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Nueva conversación</span>
                            <button className="msg-panel__btn-icon" onClick={() => { setShowNewChat(false); setPatientResults([]); setSelectedPatient(null); }}>
                                <X size={15} />
                            </button>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <Phone size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                            <input
                                type="tel" placeholder="Número (ej: 2644123456)"
                                value={newChatPhone} onChange={e => setNewChatPhone(e.target.value)}
                                className="msg-panel__new-chat-input" style={{ paddingLeft: '30px' }}
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <User size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                            <input
                                type="text" placeholder="Buscar paciente en padrón o escribir nombre..."
                                value={newChatName} onChange={e => handlePatientSearch(e.target.value)}
                                className="msg-panel__new-chat-input" style={{ paddingLeft: '30px' }}
                            />
                            {patientResults.length > 0 && (
                                <div className="msg-panel__patient-results animate-fade-in">
                                    {patientResults.map(p => (
                                        <button key={p.id_paciente} className="msg-panel__patient-item" onClick={() => selectPatientResult(p)}>
                                            <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                                            {p.dni && <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>DNI: {p.dni}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {patientSearching && <div style={{ position: 'absolute', right: '10px', top: '8px' }}><Loader size={14} className="msg-panel__spinner" /></div>}
                        </div>
                        {selectedPatient && (
                            <div className="msg-panel__selected-patient animate-fade-in">
                                <User size={13} />
                                <span>{selectedPatient.nombre}</span>
                                {selectedPatient.dni && <span style={{ color: '#64748B' }}>· DNI {selectedPatient.dni}</span>}
                                <button onClick={() => { setSelectedPatient(null); setNewChatName(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                                    <X size={13} />
                                </button>
                            </div>
                        )}
                        <button className="msg-panel__new-chat-submit" onClick={handleStartNewChat} disabled={!newChatPhone.trim()}>
                            <MessageSquare size={14} /> Iniciar Chat
                        </button>
                    </div>
                )}

                {/* Conversation List */}
                <div className="msg-panel__conv-list">
                    {loading ? (
                        <div className="msg-panel__empty"><Loader size={24} className="msg-panel__spinner" /><span>Cargando conversaciones...</span></div>
                    ) : filtered.length === 0 ? (
                        <div className="msg-panel__empty"><MessageSquare size={32} strokeWidth={1.2} /><span>Sin conversaciones</span></div>
                    ) : (
                        filtered.map(conv => {
                            const patientInfo = getResolvedPatientInfo(conv.phone, conv.senderName);
                            const name = patientInfo.displayName;
                            const isActive = selectedPhone === conv.phone;
                            const hasUnread = conv.unreadCount > 0;
                            const visit = getVisitForPhone(conv.phone);
                            const dateInfo = getVisitDateInfo(visit);

                            // Left border accent color based on visit status or unread
                            const leftBorderColor = dateInfo
                                ? (dateInfo.isToday ? '#DC2626' : dateInfo.cfg.accent)
                                : hasUnread
                                    ? '#2563EB'
                                    : 'transparent';

                            return (
                                <button
                                    key={conv.phone}
                                    className={`msg-panel__conv-item ${isActive ? 'msg-panel__conv-item--active' : ''} ${hasUnread ? 'msg-panel__conv-item--unread' : ''}`}
                                    onClick={() => setSelectedPhone(conv.phone)}
                                    style={{
                                        borderLeft: leftBorderColor !== 'transparent' ? `4px solid ${leftBorderColor}` : undefined,
                                    }}
                                >
                                    <div
                                        className="msg-panel__conv-avatar"
                                        style={dateInfo ? {
                                            background: dateInfo.isToday
                                                ? 'linear-gradient(135deg, #DC2626, #EF4444)'
                                                : dateInfo.isTomorrow
                                                    ? 'linear-gradient(135deg, #D97706, #F59E0B)'
                                                    : `linear-gradient(135deg, ${dateInfo.cfg.accent}, ${dateInfo.cfg.color})`,
                                            boxShadow: `0 2px 6px ${dateInfo.cfg.accent}33`
                                        } : undefined}
                                    >
                                        {name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="msg-panel__conv-info">
                                        {/* FILA 1: PROTAGONISTA VISUAL -> Fecha de Turno + Estado */}
                                        {dateInfo && (
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '6px',
                                                marginBottom: '6px',
                                                flexWrap: 'wrap'
                                            }}>
                                                {/* CHIP DE FECHA DE ALTO IMPACTO */}
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    padding: '3px 9px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.73rem',
                                                    fontWeight: 800,
                                                    letterSpacing: '0.01em',
                                                    background: dateInfo.isToday
                                                        ? '#DC2626'
                                                        : dateInfo.isTomorrow
                                                            ? '#D97706'
                                                            : dateInfo.isPast
                                                                ? '#F1F5F9'
                                                                : '#1E293B',
                                                    color: dateInfo.isPast ? '#475569' : '#FFFFFF',
                                                    boxShadow: dateInfo.isToday
                                                        ? '0 2px 6px rgba(220, 38, 38, 0.35)'
                                                        : dateInfo.isTomorrow
                                                            ? '0 2px 6px rgba(217, 119, 6, 0.3)'
                                                            : '0 1px 2px rgba(15, 23, 42, 0.12)',
                                                }}>
                                                    <Calendar size={12} strokeWidth={2.5} />
                                                    {dateInfo.label}
                                                </span>

                                                {/* CHIP DE ESTADO CLÍNICO */}
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.67rem',
                                                    fontWeight: 700,
                                                    background: dateInfo.cfg.bg,
                                                    color: dateInfo.cfg.color,
                                                    border: `1px solid ${dateInfo.cfg.border}`,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.02em',
                                                }}>
                                                    <span style={{
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: dateInfo.cfg.accent,
                                                        display: 'inline-block'
                                                    }} />
                                                    {dateInfo.cfg.label}
                                                </span>
                                            </div>
                                        )}

                                        {/* FILA 2: Nombre Clínico Real del Paciente + Hora del último mensaje */}
                                        <div className="msg-panel__conv-top">
                                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                                <span className={`msg-panel__conv-name ${hasUnread ? 'msg-panel__conv-name--bold' : ''}`}>
                                                    {name}
                                                </span>
                                                {patientInfo.cellName && (
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        color: '#64748B',
                                                        fontWeight: 500,
                                                        marginTop: '1px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        📱 Celu: {patientInfo.cellName}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="msg-panel__conv-time" style={{ color: hasUnread ? '#16A34A' : undefined, fontWeight: hasUnread ? 700 : undefined }}>
                                                {formatDate(conv.lastDate)}
                                            </span>
                                        </div>

                                        {/* FILA 3: Preview del mensaje + Botón leído / Contador */}
                                        <div className="msg-panel__conv-bottom">
                                            <span className="msg-panel__conv-preview" style={{ color: hasUnread ? '#0F172A' : undefined, fontWeight: hasUnread ? 600 : undefined }}>
                                                {conv.direction === 'outgoing' && <span style={{ color: '#2563EB', fontWeight: 700 }}>✓ </span>}
                                                {conv.lastMessage
                                                    ? (conv.lastMessage.length > 52 ? conv.lastMessage.slice(0, 52) + '…' : conv.lastMessage)
                                                    : 'Sin mensajes'}
                                            </span>
                                            {hasUnread && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <button
                                                        className="msg-panel__btn-read"
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            await markAsRead(conv.phone);
                                                            setConversations(prev => prev.map(c =>
                                                                c.phone === conv.phone ? { ...c, unreadCount: 0 } : c
                                                            ));
                                                        }}
                                                        title="Marcar como leído"
                                                    >
                                                        <CheckCheck size={13} />
                                                    </button>
                                                    <span className="msg-panel__conv-badge">{conv.unreadCount}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="msg-panel__sidebar-footer">
                    <button className="msg-panel__btn-icon" onClick={() => loadConversations(false)} title="Actualizar">
                        <RefreshCw size={14} />
                    </button>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                        {filtered.length}{filtered.length !== conversations.length ? ` / ${conversations.length}` : ''} conversación{filtered.length !== 1 ? 'es' : ''}
                    </span>
                </div>
            </div>

            {/* ========== VERTICAL DRAG RESIZER ========== */}
            <div
                className={`msg-panel__resizer ${isDraggingSidebar ? 'msg-panel__resizer--active' : ''}`}
                onMouseDown={startResizingSidebar}
                onDoubleClick={() => {
                    setSidebarWidth(440);
                    try { localStorage.setItem('msg_panel_sidebar_width', '440'); } catch {}
                }}
                title="Arrastrar para ajustar el ancho de la lista (doble clic para restablecer)"
            />

            {/* ========== RIGHT: Chat View ========== */}
            <div className="msg-panel__chat">
                {!selectedPhone ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        padding: '40px 24px',
                        background: '#F8FAFC',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '72px', height: '72px', borderRadius: '20px',
                            background: 'linear-gradient(135deg, #1E40AF, #3B82F6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#FFFFFF',
                            boxShadow: '0 10px 25px -5px rgba(30, 64, 175, 0.25)',
                            marginBottom: '20px'
                        }}>
                            <MessageSquare size={36} strokeWidth={2} />
                        </div>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                            Centro de Mensajería Sanatorio Argentino
                        </h2>
                        <p style={{ fontSize: '0.88rem', color: '#64748B', maxWidth: '480px', margin: '0 0 28px 0', lineHeight: 1.5 }}>
                            Atención de pacientes vía WhatsApp oficial, confirmación de chequeos preventivos y turnos ambulatorios. Seleccione una conversación de la columna izquierda para responder.
                        </p>

                        {/* 3 Tarjetas operativas clave */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '14px',
                            width: '100%',
                            maxWidth: '560px'
                        }}>
                            <div style={{
                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>
                                    Sin Responder
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#DC2626', margin: '4px 0' }}>
                                    {totalUnread}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    Mensajes pendientes
                                </div>
                            </div>

                            <div style={{
                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>
                                    Turnos Hoy
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1D4ED8', margin: '4px 0' }}>
                                    {filterCounts.todayCount}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    Pacientes para hoy
                                </div>
                            </div>

                            <div style={{
                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                padding: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#BE185D', textTransform: 'uppercase' }}>
                                    Consultas Informe
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#BE185D', margin: '4px 0' }}>
                                    {filterCounts.informeCount}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    Lectura de resultados
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Chat Header with Patient Context */}
                        <div className="msg-panel__chat-header" style={{ flexDirection: 'column', alignItems: 'stretch', padding: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px' }}>
                                <button className="msg-panel__btn-icon msg-panel__back-btn" onClick={() => setSelectedPhone(null)}>
                                    <ArrowLeft size={18} />
                                </button>
                                <div className="msg-panel__chat-header-avatar">
                                    {(activePatientInfo.displayName || 'S').charAt(0).toUpperCase()}
                                </div>
                                <div className="msg-panel__chat-header-info" style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span className="msg-panel__chat-header-name">{activePatientInfo.displayName}</span>
                                        {activePatientInfo.cellName && (
                                            <span style={{
                                                fontSize: '0.68rem',
                                                padding: '1px 8px',
                                                borderRadius: '10px',
                                                background: '#E0F2FE',
                                                color: '#0369A1',
                                                fontWeight: 600,
                                            }}>
                                                📱 Celu: {activePatientInfo.cellName}
                                            </span>
                                        )}
                                        {activePatientInfo.dni && (
                                            <span style={{
                                                fontSize: '0.7rem',
                                                color: '#64748B',
                                                fontFamily: 'ui-monospace, monospace',
                                            }}>
                                                DNI {activePatientInfo.dni}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span className="msg-panel__chat-header-phone" style={{ userSelect: 'text', cursor: 'text' }}>
                                            <Phone size={11} /> {selectedPhone}
                                        </span>
                                        <button
                                            onClick={() => { navigator.clipboard?.writeText(selectedPhone).then(() => addToast?.('📋 Número copiado', 'success')).catch(() => {}); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '1px', display: 'inline-flex', alignItems: 'center', transition: 'color 0.15s' }}
                                            onMouseOver={e => e.currentTarget.style.color = '#1E293B'}
                                            onMouseOut={e => e.currentTarget.style.color = '#94A3B8'}
                                            title="Copiar número"
                                        >
                                            <Copy size={11} />
                                        </button>
                                        {currentLine && (
                                            <span
                                                onClick={() => whatsappLines.length > 1 && setShowChangeLineModal(true)}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                    padding: '1px 8px', borderRadius: '10px',
                                                    background: `${currentLine.color}20`, fontSize: '0.65rem',
                                                    cursor: whatsappLines.length > 1 ? 'pointer' : 'default',
                                                    transition: 'all 0.15s', fontWeight: 600,
                                                    color: '#128C7E',
                                                }}
                                                title="Línea oficial activa"
                                            >
                                                <span style={{
                                                    width: '5px', height: '5px', borderRadius: '50%',
                                                    background: currentLine.color, display: 'inline-block',
                                                }} />
                                                {currentLine.label} ···{currentLine.phone.slice(-4)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Quick info badges (Visit or Surgery context) */}
                                {(patientContext?.visit || patientContext?.surgery) && (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {(patientContext.visit?.fecha || patientContext.surgery?.fecha_cirugia) && (
                                            <span className="msg-panel__context-badge" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                                                <Calendar size={12} />
                                                {new Date((patientContext.visit?.fecha || patientContext.surgery?.fecha_cirugia) + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                            </span>
                                        )}
                                        {(patientContext.visit?.obra_social || patientContext.surgery?.obra_social) && (
                                            <span className="msg-panel__context-badge" style={{ background: '#F0FDF4', color: '#16A34A' }}>
                                                <Shield size={12} />
                                                {(patientContext.visit?.obra_social || patientContext.surgery?.obra_social).length > 25
                                                    ? (patientContext.visit?.obra_social || patientContext.surgery?.obra_social).slice(0, 25) + '…'
                                                    : (patientContext.visit?.obra_social || patientContext.surgery?.obra_social)}
                                            </span>
                                        )}
                                        {(patientContext.visit?.medico || patientContext.surgery?.medico || patientContext.visit?.tipo_visita) && (
                                            <span className="msg-panel__context-badge" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                                                <Stethoscope size={12} />
                                                {(() => {
                                                    const label = patientContext.visit?.medico || patientContext.surgery?.medico || patientContext.visit?.tipo_visita || '';
                                                    return label.length > 25 ? label.slice(0, 25) + '…' : label;
                                                })()}
                                            </span>
                                        )}
                                        {patientContext.visitas?.length > 0 && (
                                            <button
                                                className="msg-panel__context-badge"
                                                style={{ background: '#FFFBEB', color: '#D97706', cursor: 'pointer', border: 'none' }}
                                                onClick={() => setShowBudgetDetail(prev => !prev)}
                                            >
                                                <FileText size={12} />
                                                Historial ({patientContext.visitas.length})
                                                {showBudgetDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Dropdown de Historial de Chequeos e Informes en SALUS */}
                            {showBudgetDetail && patientContext?.visitas?.length > 0 && (
                                <div className="msg-panel__budget-dropdown animate-fade-in" style={{
                                    background: '#FFFFFF',
                                    border: '1.5px solid #BFDBFE',
                                    borderRadius: '8px',
                                    margin: '8px 16px',
                                    padding: '12px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                                        <FileText size={14} style={{ color: '#2563EB', marginRight: '6px' }} />
                                        <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: '0.82rem' }}>
                                            Historial de Turnos y Chequeos en SALUS
                                        </span>
                                        {patientContext.visit?.centro && (
                                            <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: '0.72rem' }}>
                                                📍 {patientContext.visit.centro}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                        {patientContext.visitas.map((v, i) => (
                                            <div key={v.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9', fontSize: '0.72rem' }}>
                                                <span style={{ color: '#1E293B', fontWeight: 600 }}>
                                                    📅 {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    {v.hora ? ` (${v.hora} hs)` : ''} — <span style={{ color: '#2563EB' }}>{v.tipo_visita}</span>
                                                    {v.medico ? ` · ${v.medico}` : ''}
                                                </span>
                                                <span style={{
                                                    fontWeight: 700,
                                                    color: v.asistencia === 'Presente' ? '#15803D' : '#B45309',
                                                    marginLeft: '8px',
                                                    flexShrink: 0
                                                }}>
                                                    {v.asistencia || 'Agendado'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Messages */}
                        <div className="msg-panel__messages">
                            {messagesLoading ? (
                                <div className="msg-panel__empty" style={{ padding: '40px 0' }}>
                                    <Loader size={24} className="msg-panel__spinner" /><span>Cargando mensajes...</span>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="msg-panel__empty" style={{ padding: '40px 0' }}>
                                    <MessageSquare size={32} strokeWidth={1.2} /><span>Sin mensajes aún. ¡Envía el primero!</span>
                                </div>
                            ) : (
                                groupedMessages.map((item, idx) => {
                                    if (item.type === 'date') {
                                        return (
                                            <div key={`date-${idx}`} className="msg-panel__date-separator">
                                                <span>{formatFullDate(item.date)}</span>
                                            </div>
                                        );
                                    }
                                    const isOutgoing = item.direction === 'outgoing';
                                    return (
                                        <div key={item.id || idx}
                                            className={`msg-panel__bubble ${isOutgoing ? 'msg-panel__bubble--out' : 'msg-panel__bubble--in'}`}
                                        >
                                            {!isOutgoing && item.sender_name && (
                                                <span className="msg-panel__bubble-sender">{item.sender_name}</span>
                                            )}
                                            {renderMessageContent(item)}
                                            <span className="msg-panel__bubble-time">
                                                {formatTime(item.created_at)}
                                                {isOutgoing && (
                                                    <CheckCheck size={12} style={{ marginLeft: '3px', opacity: 0.6 }} />
                                                )}
                                            </span>
                                            {isOutgoing && item.sender_name && (
                                                <span className="msg-panel__bubble-operator">{item.sender_name}</span>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Meta 24h expired — Inline template picker (1-click send) */}
                        {isMetaLine && isWindowExpired ? (
                            <div style={{
                                borderTop: '2px solid #FDE68A',
                                background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                                padding: '10px 16px',
                                display: 'flex', flexDirection: 'column', gap: '8px',
                            }}>
                                {templateJustSent ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '6px 0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <CheckCircle size={16} style={{ color: '#16A34A' }} />
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                                                Plantilla enviada exitosamente
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#92400E', textAlign: 'center', lineHeight: 1.4 }}>
                                            Cuando el paciente responda, se abrirá la ventana de 24hs y podrás escribir libremente.
                                        </p>
                                        <button
                                            onClick={() => setTemplateJustSent(false)}
                                            style={{
                                                padding: '4px 14px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                                background: 'transparent', cursor: 'pointer', fontSize: '0.68rem',
                                                color: '#64748B', fontWeight: 600, marginTop: '2px',
                                            }}
                                        >
                                            Enviar otra plantilla
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <AlertTriangle size={14} style={{ color: '#D97706', flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400E', flex: 1 }}>
                                                Ventana 24hs expirada — Seleccioná una plantilla para reanudar
                                            </span>
                                        </div>
                                        {sendingMetaTemplate ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', padding: '8px 0' }}>
                                                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: '#25D366' }} />
                                                <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}>Enviando plantilla...</span>
                                            </div>
                                        ) : metaTemplates.filter(t => !t.status || t.status === 'APPROVED').length === 0 ? (
                                            <span style={{ fontSize: '0.72rem', color: '#A16207', fontStyle: 'italic', textAlign: 'center', padding: '6px 0', display: 'block', lineHeight: 1.4 }}>
                                                {metaTemplateError
                                                    ? `⚠️ Error de configuración: ${metaTemplateError}`
                                                    : 'No hay plantillas aprobadas disponibles'
                                                }
                                            </span>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0', flexWrap: 'nowrap' }}>
                                                {metaTemplates.filter(t => !t.status || t.status === 'APPROVED').map((tpl, idx) => (
                                                    <button
                                                        key={tpl.id || tpl.name || idx}
                                                        onClick={() => quickSendMetaTemplate(tpl)}
                                                        style={{
                                                            flexShrink: 0, padding: '8px 14px',
                                                            borderRadius: '10px', border: '1px solid #BBF7D0',
                                                            background: '#F0FDF4', cursor: 'pointer',
                                                            fontSize: '0.75rem', fontWeight: 600,
                                                            color: '#166534', transition: 'all 0.15s',
                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                            maxWidth: '280px',
                                                        }}
                                                        onMouseOver={e => { e.currentTarget.style.background = '#DCFCE7'; e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = '#F0FDF4'; e.currentTarget.style.borderColor = '#BBF7D0'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                                        title={tpl.components?.find(c => c.type === 'BODY')?.text || tpl.name}
                                                    >
                                                        <FileText size={13} style={{ flexShrink: 0 }} />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {tpl.name || tpl.templateName}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            /* Normal Composer */
                            <div className="msg-panel__composer">
                                {/* Shortcuts popup */}
                                {showShortcuts && filteredShortcuts.length > 0 && (
                                    <div className="msg-panel__shortcuts-popup animate-fade-in">
                                        <div style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '0.72rem' }}>
                                            <Zap size={12} /> Plantillas — Escribe para filtrar
                                        </div>
                                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                            {filteredShortcuts.map((s, i) => (
                                                <button
                                                    key={s.id || i}
                                                    className={`msg-panel__shortcut-item ${i === shortcutIndex ? 'msg-panel__shortcut-item--active' : ''} ${s._isMeta ? 'msg-panel__shortcut-item--meta' : ''}`}
                                                    onClick={() => selectShortcut(s)}
                                                    onMouseEnter={() => setShortcutIndex(i)}
                                                >
                                                    {s._isMeta && <DollarSign size={12} style={{ color: '#B45309', flexShrink: 0 }} />}
                                                    <span className={`msg-panel__shortcut-name ${s._isMeta ? 'msg-panel__shortcut-name--meta' : ''}`}>/{s.shortcut}</span>
                                                    <span className="msg-panel__shortcut-label">{s.label}</span>
                                                    {s._isMeta
                                                        ? <span className="msg-panel__shortcut-cat msg-panel__shortcut-cat--meta">Meta 💰</span>
                                                        : s.category && <span className="msg-panel__shortcut-cat">{s.category}</span>
                                                    }
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Emoji picker */}
                                {showEmoji && (
                                    <div className="msg-panel__emoji-tray animate-fade-in">
                                        {EMOJI_LIST.map(e => (
                                            <button key={e} className="msg-panel__emoji-btn"
                                                onClick={() => { setMessageText(prev => prev + e); inputRef.current?.focus(); }}>
                                                {e}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Recording UI */}
                                {isRecording ? (
                                    <div className="msg-panel__recording-bar">
                                        <button className="msg-panel__btn-icon" onClick={cancelRecording} title="Cancelar" style={{ color: '#EF4444' }}>
                                            <X size={18} />
                                        </button>
                                        <div className="msg-panel__recording-indicator">
                                            <span className="msg-panel__recording-dot" />
                                            <span>{formatRecordingTime(recordingTime)}</span>
                                        </div>
                                        <button className="msg-panel__send-btn" onClick={stopRecording} title="Enviar audio">
                                            <Send size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="msg-panel__composer-row">
                                        <button className="msg-panel__btn-icon" onClick={() => setShowEmoji(prev => !prev)} title="Emojis">
                                            <Smile size={18} />
                                        </button>
                                        <button className="msg-panel__btn-icon" onClick={() => fileInputRef.current?.click()} title="Enviar imagen o PDF" disabled={uploadingMedia}>
                                            {uploadingMedia ? <Loader size={18} className="msg-panel__spinner" /> : <Paperclip size={18} />}
                                        </button>
                                        <input type="file" ref={fileInputRef} accept="image/*,video/*,application/pdf" onChange={handleImageSelect} style={{ display: 'none' }} />
                                        <input
                                            ref={inputRef} type="text"
                                            className="msg-panel__composer-input"
                                            placeholder="Escribe un mensaje... ( / para plantillas)"
                                            value={messageText}
                                            onChange={handleInputChange}
                                            onKeyDown={handleKeyDown}
                                            disabled={sending || uploadingMedia}
                                        />
                                        {messageText.trim() ? (
                                            <button className="msg-panel__send-btn" onClick={handleSend}
                                                disabled={!messageText.trim() || sending} title="Enviar">
                                                {sending ? <Loader size={16} className="msg-panel__spinner" /> : <Send size={16} />}
                                            </button>
                                        ) : (
                                            <button className="msg-panel__btn-icon" onClick={startRecording} title="Grabar audio"
                                                style={{ color: '#25D366' }}>
                                                <Mic size={20} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ========== LIGHTBOX ========== */}
            {lightboxUrl && (
                <div className="msg-panel__lightbox" onClick={() => setLightboxUrl(null)}>
                    <button className="msg-panel__lightbox-close"><X size={24} /></button>
                    <img src={lightboxUrl} alt="Vista ampliada" className="msg-panel__lightbox-img" />
                </div>
            )}

            {/* ========== META TEMPLATE COST MODAL ========== */}
            {showMetaCostModal && pendingMetaTemplate && (
                <div style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10030,
                    background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => { setShowMetaCostModal(false); setPendingMetaTemplate(null); }}>
                    <div style={{
                        background: 'white', borderRadius: '16px', padding: '28px 32px',
                        maxWidth: '420px', width: '90%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                        border: '2px solid #F59E0B', position: 'relative',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <DollarSign size={24} color="white" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1E293B' }}>Plantilla de Meta WhatsApp</div>
                                <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Este envío tiene costo asociado</div>
                            </div>
                        </div>

                        <div style={{
                            background: '#FFFBEB', borderRadius: '10px', padding: '12px 14px',
                            marginBottom: '14px', border: '1px solid #FDE68A',
                        }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400E', marginBottom: '4px' }}>
                                📋 /{pendingMetaTemplate.shortcut}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#78350F', lineHeight: '1.4', maxHeight: '80px', overflowY: 'auto' }}>
                                {pendingMetaTemplate.message?.substring(0, 200)}{pendingMetaTemplate.message?.length > 200 ? '...' : ''}
                            </div>
                        </div>

                        <div style={{
                            background: '#FEF2F2', borderRadius: '8px', padding: '10px 12px',
                            marginBottom: '18px', border: '1px solid #FECACA',
                            display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                            <span style={{ fontSize: '0.76rem', color: '#991B1B', fontWeight: 500 }}>
                                Las plantillas de Meta se cobran por mensaje enviado a través de la API de WhatsApp Business.
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setShowMetaCostModal(false); setPendingMetaTemplate(null); }}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #E2E8F0',
                                    background: 'white', color: '#64748B', fontWeight: 600, fontSize: '0.82rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancelar (Esc)
                            </button>
                            <button
                                onClick={confirmSendMetaTemplate}
                                disabled={sendingMetaTemplate}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                                    background: sendingMetaTemplate ? '#94A3B8' : 'linear-gradient(135deg, #F59E0B, #D97706)',
                                    color: 'white', fontWeight: 700, fontSize: '0.82rem',
                                    cursor: sendingMetaTemplate ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 8px rgba(245,158,11,0.35)',
                                }}
                            >
                                {sendingMetaTemplate ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                                {sendingMetaTemplate ? 'Enviando...' : 'Enviar (Enter ↵)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========== SHORTCUT MANAGER ========== */}
            {showShortcutManager && (
                <ShortcutManager
                    onClose={() => { setShowShortcutManager(false); fetchShortcuts(true).then(setShortcuts); }}
                    addToast={addToast}
                />
            )}
        </div>
    );
}
