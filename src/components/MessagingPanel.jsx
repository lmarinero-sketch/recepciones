/**
 * MessagingPanel — CRM WhatsApp Clínico Moderno (Estética Calidad-QOAG Sanatorio Argentino)
 * Panel de mensajería con lista inteligente, burbujas diferenciadas, formato rico de WhatsApp,
 * reproductor de audio con waveform + velocidad 1x/1.5x/2x, quick chips y Ficha Clínica SALUS.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    MessageSquare, Search, Plus, Send, Phone, User, X,
    ArrowLeft, Smile, Mic, Loader,
    RefreshCw, Play, Pause, Volume2, Download, Paperclip, Zap,
    CheckCheck, Calendar, Shield, DollarSign,
    ChevronDown, ChevronUp, Stethoscope, FileText, Building2,
    Clock, Sparkles, PanelRightClose, PanelRightOpen, MapPin, ClipboardCheck, Bot
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

const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #0284C7, #0369A1)',
    'linear-gradient(135deg, #2563EB, #1D4ED8)',
    'linear-gradient(135deg, #0D9488, #0F766E)',
    'linear-gradient(135deg, #4F46E5, #4338CA)',
    'linear-gradient(135deg, #0891B2, #0E7490)',
    'linear-gradient(135deg, #059669, #047857)',
];

const WAVEFORM_BARS = [35, 65, 45, 80, 55, 90, 70, 40, 85, 60, 95, 50, 75, 60, 85, 45, 70, 50, 65, 40];

function getInitials(nameOrPhone) {
    const str = String(nameOrPhone || '').trim();
    if (!str) return 'SA';
    if (/^\+?\d+$/.test(str)) return str.slice(-2);
    const clean = str.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
}

function getAvatarGradient(seed) {
    const s = String(seed || '');
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function cleanPreviewText(raw) {
    if (!raw) return 'Sin mensajes';
    const str = String(raw).trim();
    if (str === '[image]' || str === '📷 Imagen') return '📷 Imagen adjunta';
    if (str === '[audio]' || str === '🎤 Audio' || str.includes('_event_voice_note_')) return '🎤 Nota de voz';
    if (str === '[document]' || str.includes('_event_document_')) return '📄 Documento adjunto';
    if (str.startsWith('📋 [Plantilla Meta]')) {
        const m = str.match(/^📋\s*\[Plantilla Meta\]\s*([^:]+):\s*(.*)$/s);
        if (m) return `📋 ${m[1]}: ${m[2].replace(/\s+/g, ' ').trim()}`;
    }
    return str.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Renderiza formato enriquecido de WhatsApp (*negrita*, _cursiva_, URLs)
 */
function renderFormattedLine(line, lineIdx, isDarkBubble) {
    // Detectar URLs primero
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = line.split(urlRegex);

    return (
        <span key={lineIdx}>
            {parts.map((part, idx) => {
                if (/^https?:\/\//.test(part)) {
                    return (
                        <a
                            key={idx}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: isDarkBubble ? '#BAE6FD' : '#0284C7',
                                textDecoration: 'underline',
                                fontWeight: 600,
                                wordBreak: 'break-all',
                            }}
                        >
                            {part}
                        </a>
                    );
                }
                // Procesar *negrita*
                const boldSegments = part.split(/\*([^*]+)\*/g);
                return boldSegments.map((seg, bIdx) => {
                    if (bIdx % 2 === 1) {
                        return <strong key={`${idx}-b-${bIdx}`} style={{ fontWeight: 700 }}>{seg}</strong>;
                    }
                    // Procesar _cursiva_
                    const italicSegments = seg.split(/_([^_]+)_/g);
                    return italicSegments.map((iSeg, iIdx) =>
                        iIdx % 2 === 1 ? <em key={`${idx}-i-${iIdx}`}>{iSeg}</em> : iSeg
                    );
                });
            })}
            {lineIdx >= 0 && '\n'}
        </span>
    );
}

function renderWhatsAppText(text, isDarkBubble = false) {
    if (!text) return null;
    const lines = String(text).split('\n');
    return lines.map((line, i) => (
        <span key={i}>
            {renderFormattedLine(line, i, isDarkBubble)}
        </span>
    ));
}

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
    const [convFilter, setConvFilter] = useState('all'); // 'all' | 'unread' | 'active24h'
    const [showNewChat, setShowNewChat] = useState(false);
    const [newChatPhone, setNewChatPhone] = useState('');
    const [newChatName, setNewChatName] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [patientSearching, setPatientSearching] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const [contactNames, setContactNames] = useState({});
    const [crmContacts, setCrmContacts] = useState({});

    // Media & Audio Waveform State
    const [lightboxUrl, setLightboxUrl] = useState(null);
    const [playingAudio, setPlayingAudio] = useState(null);
    const [audioProgress, setAudioProgress] = useState({});
    const [audioDuration, setAudioDuration] = useState({});
    const [audioSpeed, setAudioSpeed] = useState(1);
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
    const [showMetaCostModal, setShowMetaCostModal] = useState(false);
    const [pendingMetaTemplate, setPendingMetaTemplate] = useState(null);
    const [sendingMetaTemplate, setSendingMetaTemplate] = useState(false);

    // Patient context (SALUS Checkups + Surgery + Budget)
    const [patientContext, setPatientContext] = useState(null);
    const [salusPatientInfo, setSalusPatientInfo] = useState(null);
    const [showSalusDrawer, setShowSalusDrawer] = useState(false);
    const [showBudgetDetail, setShowBudgetDetail] = useState(false);

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

    // === Load contacts from crm_contacts ===
    useEffect(() => {
        async function loadContacts() {
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
            } catch (e) {
                console.error('Error loading contacts:', e);
            }
        }
        loadContacts();
    }, []);

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
        } catch (e) {
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

    // === Load SALUS Checkup Context (`recepciones_visitas`) & Surgery Context ===
    useEffect(() => {
        if (!selectedPhone) {
            setPatientContext(null);
            setSalusPatientInfo(null);
            setShowBudgetDetail(false);
            return;
        }

        async function loadFullPatientContext() {
            try {
                // 1. Buscar en recepciones_visitas por últimos 10 dígitos del teléfono
                const digits = String(selectedPhone).replace(/\D/g, '');
                const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
                const last7 = digits.length >= 7 ? digits.slice(-7) : digits;

                if (last7) {
                    const { data: visitas } = await supabase
                        .from('recepciones_visitas')
                        .select('id, fecha, hora, paciente, dni, edad, obra_social, centro, departamento, tipo_visita, tipo_agenda, asistencia, medico')
                        .ilike('telefono1', `%${last10 || last7}%`)
                        .order('fecha', { ascending: false })
                        .limit(20);

                    if (visitas && visitas.length > 0) {
                        const first = visitas[0];
                        setSalusPatientInfo({
                            paciente: first.paciente,
                            dni: first.dni,
                            edad: first.edad,
                            obra_social: first.obra_social,
                            centro: first.centro,
                            departamento: first.departamento,
                            visitas,
                        });
                        // Si no teníamos nombre de contacto real, actualizarlo en memoria
                        if (first.paciente) {
                            setContactNames(prev => ({
                                ...prev,
                                [selectedPhone]: prev[selectedPhone] && prev[selectedPhone] !== selectedPhone ? prev[selectedPhone] : first.paciente,
                            }));
                        }
                    } else {
                        setSalusPatientInfo(null);
                    }
                }

                // 2. Contexto quirúrgico/presupuesto si existe id_paciente en crm_contacts
                const contact = crmContacts[selectedPhone];
                if (!contact?.id_paciente) {
                    setPatientContext(null);
                    return;
                }
                const idPac = String(contact.id_paciente);
                const { data: surgeries } = await supabase
                    .from('surgeries')
                    .select('obra_social, fecha_cirugia, medico, modulo, status')
                    .eq('id_paciente', idPac)
                    .order('fecha_cirugia', { ascending: false })
                    .limit(1);
                const { data: budgets } = await supabase
                    .from('presupuestos')
                    .select('id_presupuesto, importe_total, fecha, observaciones, aceptado')
                    .eq('id_paciente', idPac)
                    .order('fecha', { ascending: false })
                    .limit(1);
                let budgetItems = [];
                if (budgets?.[0]?.id_presupuesto) {
                    const { data: items } = await supabase
                        .from('presupuesto_items')
                        .select('descripcion, cantidad, importe_unitario, importe_total')
                        .eq('id_presupuesto', budgets[0].id_presupuesto)
                        .order('linea', { ascending: true });
                    budgetItems = items || [];
                }
                setPatientContext({
                    surgery: surgeries?.[0] || null,
                    budget: budgets?.[0] || null,
                    budgetItems,
                });
            } catch (e) {
                console.error('Error loading patient context:', e);
            }
        }
        loadFullPatientContext();
    }, [selectedPhone, crmContacts]);

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
        }).catch(err => {
            console.warn('Could not load Meta templates:', err);
        });
    }, []);

    useEffect(() => {
        setWhatsappLines([]);
        setAssignedLineId('line_recepciones');
    }, []);

    useEffect(() => {
        if (!selectedPhone) return;
        setAssignedLineId('line_recepciones');
        setShowLineSelector(false);
    }, [selectedPhone]);

    const handleSelectLine = async (lineId) => {
        setAssignedLineId(lineId);
        setShowLineSelector(false);
        setShowChangeLineModal(false);
        try {
            await assignLine(selectedPhone, lineId);
            addToast?.(`Línea asignada`, 'success');
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

    // Verificar si la ventana de 24h de Meta está activa en la conversación seleccionada
    const window24hStatus = useMemo(() => {
        const lastIncoming = [...messages].reverse().find(m => m.direction === 'incoming');
        if (!lastIncoming) return { active: false, label: 'Sin respuesta reciente (Usar Plantilla /)' };
        const diffMs = Date.now() - new Date(lastIncoming.created_at).getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffMs <= 24 * 60 * 60 * 1000) {
            return { active: true, label: `Ventana 24h activa (${24 - hours}h restantes)` };
        }
        return { active: false, label: `Ventana 24h cerrada (hace ${hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`})` };
    }, [messages]);

    // ==========================================
    // UPLOAD MEDIA A SUPABASE STORAGE
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
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.focus();
        }

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
    // SEND MEDIA (IMAGE, VIDEO, PDF)
    // ==========================================
    const handleMediaSelect = async (e) => {
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
        const secs = Math.max(0, Math.round(s || 0));
        const m = Math.floor(secs / 60);
        const sec = secs % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // ==========================================
    // AUDIO PLAYER WITH WAVEFORM & SPEED (1x / 1.5x / 2x)
    // ==========================================
    const toggleAudio = (msgId, url) => {
        let audio = audioRefs.current[msgId];
        if (!audio) {
            audio = new Audio(url);
            audio.playbackRate = audioSpeed;
            audioRefs.current[msgId] = audio;
            audio.onloadedmetadata = () => {
                if (audio.duration && isFinite(audio.duration)) {
                    setAudioDuration(prev => ({ ...prev, [msgId]: audio.duration }));
                }
            };
            audio.ontimeupdate = () => {
                const dur = audio.duration && isFinite(audio.duration) ? audio.duration : 1;
                setAudioProgress(prev => ({ ...prev, [msgId]: { current: audio.currentTime, pct: Math.min(100, (audio.currentTime / dur) * 100) } }));
            };
            audio.onended = () => {
                setPlayingAudio(null);
                setAudioProgress(prev => ({ ...prev, [msgId]: { current: 0, pct: 0 } }));
            };
            Object.entries(audioRefs.current).forEach(([k, a]) => {
                if (String(k) !== String(msgId)) a.pause();
            });
            audio.play();
            setPlayingAudio(msgId);
        } else if (playingAudio === msgId) {
            audio.pause();
            setPlayingAudio(null);
        } else {
            Object.values(audioRefs.current).forEach(a => a.pause());
            audio.playbackRate = audioSpeed;
            audio.play();
            setPlayingAudio(msgId);
        }
    };

    const cycleAudioSpeed = (e) => {
        e.stopPropagation();
        const nextSpeed = audioSpeed === 1 ? 1.5 : audioSpeed === 1.5 ? 2 : 1;
        setAudioSpeed(nextSpeed);
        Object.values(audioRefs.current).forEach(a => {
            a.playbackRate = nextSpeed;
        });
    };

    // ==========================================
    // SHORTCUTS / TEMPLATES
    // ==========================================
    const metaAsShortcuts = metaTemplates.map(t => ({
        id: `meta_${t.name || t.id}`,
        shortcut: t.name || t.templateName || 'template',
        label: t.name || t.templateName || 'Template',
        message: t.body || t.text || t.components?.find(c => c.type === 'BODY')?.text || `[Plantilla: ${t.name}]`,
        category: 'WhatsApp Meta',
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
        if (patientContext?.surgery?.fecha_cirugia) {
            const fc = new Date(patientContext.surgery.fecha_cirugia + 'T12:00:00');
            const fechaStr = fc.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            result = result.replace(/\{fecha_cirugia\}/gi, fechaStr);
            result = result.replace(/\{fecha\}/gi, fechaStr);
        } else {
            result = result.replace(/\{fecha_cirugia\}/gi, '');
            result = result.replace(/\{fecha\}/gi, '');
        }
        result = result.replace(/\{obra_social\}/gi, salusPatientInfo?.obra_social || patientContext?.surgery?.obra_social || '');
        result = result.replace(/\{medico\}/gi, patientContext?.surgery?.medico || '');
        const total = patientContext?.budget?.importe_total;
        result = result.replace(/\{presupuesto_total\}/gi, total ? `$${Number(total).toLocaleString('es-AR')}` : '');
        result = result.replace(/\{total_presupuesto\}/gi, total ? `$${Number(total).toLocaleString('es-AR')}` : '');
        return result;
    }, [patientContext, salusPatientInfo]);

    const selectShortcut = useCallback((shortcut) => {
        if (shortcut._isMeta) {
            setPendingMetaTemplate(shortcut);
            setShowMetaCostModal(true);
            setShowShortcuts(false);
            setShortcutFilter('');
            setShortcutIndex(0);
            return;
        }
        const contactName = selectedPhone ? (contactNames[selectedPhone] || salusPatientInfo?.paciente || '') : '';
        const personalized = personalizeMessage(shortcut.message, contactName);
        setMessageText(personalized);
        setShowShortcuts(false);
        setShortcutFilter('');
        setShortcutIndex(0);
        inputRef.current?.focus();
    }, [selectedPhone, contactNames, salusPatientInfo, personalizeMessage]);

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

            const patientDisplay = contactNames[selectedPhone] || salusPatientInfo?.paciente || 'Paciente';
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
    }, [pendingMetaTemplate, selectedPhone, sendingMetaTemplate, addToast, contactNames, salusPatientInfo]);

    useEffect(() => {
        if (!showMetaCostModal) return;
        const handleGlobalKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmSendMetaTemplate(); }
            if (e.key === 'Escape') { e.preventDefault(); setShowMetaCostModal(false); setPendingMetaTemplate(null); }
        };
        window.addEventListener('keydown', handleGlobalKey);
        return () => window.removeEventListener('keydown', handleGlobalKey);
    }, [showMetaCostModal, confirmSendMetaTemplate]);

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

    // === FILTERED CONVERSATIONS ===
    const filtered = useMemo(() => {
        const now = Date.now();
        let list = conversations;

        if (convFilter === 'unread') {
            list = list.filter(c => (c.unreadCount || 0) > 0);
        } else if (convFilter === 'active24h') {
            list = list.filter(c => c.lastDate && (now - new Date(c.lastDate).getTime()) <= 24 * 60 * 60 * 1000);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(c => {
                const name = contactNames[c.phone] || c.senderName || '';
                return c.phone.includes(q) || name.toLowerCase().includes(q) || (c.lastMessage || '').toLowerCase().includes(q);
            });
        }
        return [...list].sort((a, b) => {
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
            return new Date(b.lastDate) - new Date(a.lastDate);
        });
    }, [conversations, searchQuery, contactNames, convFilter]);

    const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0), [conversations]);
    const active24hCount = useMemo(() => {
        const now = Date.now();
        return conversations.filter(c => c.lastDate && (now - new Date(c.lastDate).getTime()) <= 24 * 60 * 60 * 1000).length;
    }, [conversations]);

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

    const selectedContactName = selectedPhone
        ? (contactNames[selectedPhone] || salusPatientInfo?.paciente || conversations.find(c => c.phone === selectedPhone)?.senderName || selectedPhone)
        : '';

    // ==========================================
    // RENDER MESSAGE CONTENT
    // ==========================================
    const renderMessageContent = (msg, isTemplateOrBot, isOutgoing) => {
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

        const isDarkBubble = isOutgoing && !isTemplateOrBot;

        switch (effectiveMediaType) {
            case 'image':
            case 'sticker':
                return (
                    <div>
                        <img
                            src={msg.media_url}
                            alt="Imagen"
                            className="msg-panel__bubble-image"
                            onClick={() => setLightboxUrl(msg.media_url)}
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        {effectiveContent && effectiveContent !== '[image]' && effectiveContent !== '[sticker]' && effectiveContent !== '📷 Imagen' && (
                            <p className="msg-panel__bubble-text">{renderWhatsAppText(effectiveContent, isDarkBubble)}</p>
                        )}
                    </div>
                );
            case 'audio': {
                const isPlaying = playingAudio === msg.id;
                const prog = audioProgress[msg.id] || { current: 0, pct: 0 };
                const dur = audioDuration[msg.id] || 0;
                return (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '4px 6px', minWidth: '235px',
                    }}>
                        <button
                            onClick={() => toggleAudio(msg.id, msg.media_url)}
                            style={{
                                width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                                background: isDarkBubble ? 'rgba(255,255,255,0.22)' : 'linear-gradient(135deg, #0284C7, #0369A1)',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                            }}
                        >
                            {isPlaying ? <Pause size={15} color="#fff" /> : <Play size={15} color="#fff" style={{ marginLeft: '2px' }} />}
                        </button>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {/* Waveform bars */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '22px' }}>
                                {WAVEFORM_BARS.map((h, bIdx) => {
                                    const barPct = ((bIdx + 1) / WAVEFORM_BARS.length) * 100;
                                    const active = prog.pct >= barPct;
                                    return (
                                        <div
                                            key={bIdx}
                                            style={{
                                                flex: 1,
                                                height: `${Math.max(25, h)}%`,
                                                borderRadius: '2px',
                                                background: isDarkBubble
                                                    ? (active ? '#FFFFFF' : 'rgba(255,255,255,0.35)')
                                                    : (active ? '#0284C7' : '#CBD5E1'),
                                                transition: 'background 0.15s',
                                            }}
                                        />
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', opacity: 0.85, fontWeight: 600 }}>
                                <span>{formatRecordingTime(isPlaying ? prog.current : (dur || 0))}</span>
                                <span>🎤 Nota de voz</span>
                            </div>
                        </div>

                        <button
                            onClick={cycleAudioSpeed}
                            title="Cambiar velocidad de reproducción"
                            style={{
                                padding: '3px 7px', borderRadius: '6px', border: 'none',
                                background: isDarkBubble ? 'rgba(255,255,255,0.2)' : '#E0F2FE',
                                color: isDarkBubble ? '#fff' : '#0369A1',
                                fontSize: '0.66rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                            }}
                        >
                            {audioSpeed}x
                        </button>
                    </div>
                );
            }
            case 'video':
                return (
                    <div>
                        <video src={msg.media_url} controls style={{ maxWidth: '280px', borderRadius: '8px', display: 'block' }} />
                        {effectiveContent && effectiveContent !== '[video]' && (
                            <p className="msg-panel__bubble-text">{renderWhatsAppText(effectiveContent, isDarkBubble)}</p>
                        )}
                    </div>
                );
            case 'document':
                return (
                    <a
                        href={msg.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="msg-panel__doc-link"
                        style={{
                            background: isDarkBubble ? 'rgba(255,255,255,0.15)' : '#F8FAFC',
                            border: isDarkBubble ? '1px solid rgba(255,255,255,0.25)' : '1px solid #E2E8F0',
                            color: isDarkBubble ? '#FFFFFF' : '#0F172A',
                        }}
                    >
                        <FileText size={17} color={isDarkBubble ? '#BAE6FD' : '#0284C7'} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {effectiveContent || 'Documento PDF adjunto'}
                        </span>
                        <Download size={15} />
                    </a>
                );
            default: {
                const rawStr = String(effectiveContent || '');
                const tplMatch = rawStr.match(/^📋\s*\[Plantilla Meta\]\s*([^:]+):\s*(.*)$/s);
                const isSurveySent = rawStr.startsWith('✅ [Envío Encuesta Satisfacción]');
                const isDora = msg.sender_name === 'Dora (Bot)';
                const buttons = msg.raw_payload?.templateButtons;

                const cleanBody = tplMatch ? tplMatch[2] : rawStr;
                const templateTitle = tplMatch ? `Plantilla Oficial Meta · ${tplMatch[1]}` : isDora ? 'Asistente Dora · Encuesta de Calidad' : null;

                return (
                    <div className="msg-panel__template-msg">
                        {templateTitle && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.68rem', fontWeight: 800, color: isDora ? '#7C3AED' : '#0284C7',
                                background: isDora ? '#F5F3FF' : '#F0F9FF',
                                padding: '3px 9px', borderRadius: '6px', marginBottom: '7px',
                                width: 'fit-content',
                            }}>
                                {isDora ? <Bot size={12} /> : <Sparkles size={12} />}
                                {templateTitle}
                            </div>
                        )}
                        <p className="msg-panel__bubble-text" style={{ fontWeight: isSurveySent ? 700 : 400 }}>
                            {renderWhatsAppText(cleanBody, isDarkBubble)}
                        </p>
                        {buttons && buttons.length > 0 && (
                            <div className="msg-panel__template-buttons">
                                {buttons.map((btn, i) => (
                                    <span key={i} className="msg-panel__template-btn">↩ {btn}</span>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }
        }
    };

    const quickReplies = [
        {
            label: '📋 Plantillas Meta',
            action: () => {
                setMessageText('/');
                setShowShortcuts(true);
                setShortcutFilter('');
                inputRef.current?.focus();
            }
        },
        {
            label: '📍 Direcciones Sedes',
            action: () => {
                setMessageText('📍 *Sede Santa Fe:* Santa Fe 263 Este (Capital)\n📍 *Sede San Luis:* San Luis 432 Oeste (Capital)');
                inputRef.current?.focus();
            }
        },
        {
            label: '🧪 WhatsApp Laboratorio',
            action: () => {
                setMessageText('Para consultar si ya están sus análisis de laboratorio puede escribir al WhatsApp directo de Laboratorio: *2644609384*');
                inputRef.current?.focus();
            }
        },
        {
            label: '⏰ Indicaciones Chequeo',
            action: () => {
                setMessageText('⚠️ *Indicaciones importantes para su Chequeo Preventivo:*\n• Asistir con 8 hs de ayuno.\n• Traer la primera orina de la mañana en frasco estéril.\n• Traer DNI físico y credencial de obra social.');
                inputRef.current?.focus();
            }
        },
    ];

    // ===========================
    //  RENDER
    // ===========================
    return (
        <div className="msg-panel">
            {/* ========== LEFT: Conversation List ========== */}
            <div className="msg-panel__sidebar">
                <div className="msg-panel__sidebar-header">
                    <h3 className="msg-panel__sidebar-title">
                        <div style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #0284C7, #0369A1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <MessageSquare size={15} color="#fff" />
                        </div>
                        Centro de Mensajería
                        {totalUnread > 0 && (
                            <span className="msg-panel__total-badge">{totalUnread}</span>
                        )}
                    </h3>
                    <div style={{ display: 'flex', gap: '5px' }}>
                        {totalUnread > 0 && (
                            <button
                                className="msg-panel__btn-icon"
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        await markAllAsRead();
                                        setConversations(prev => prev.map(c => ({ ...c, unreadCount: 0 })));
                                        addToast?.('✅ Todos los mensajes marcados como leídos', 'success');
                                    } catch (err) {
                                        addToast?.('Error al marcar como leídos', 'error');
                                    }
                                }}
                                title="Marcar todos como leídos"
                                style={{ color: '#0284C7' }}
                            >
                                <CheckCheck size={17} />
                            </button>
                        )}
                        <button className="msg-panel__btn-icon" onClick={() => setShowNewChat(true)} title="Nueva conversación">
                            <Plus size={17} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="msg-panel__search">
                    <Search size={15} className="msg-panel__search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, teléfono o mensaje..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="msg-panel__search-input"
                    />
                </div>

                {/* Filter Pills */}
                <div className="msg-panel__filter-bar">
                    <button
                        className={`msg-panel__filter-pill ${convFilter === 'all' ? 'msg-panel__filter-pill--active' : ''}`}
                        onClick={() => setConvFilter('all')}
                    >
                        Todos ({conversations.length})
                    </button>
                    <button
                        className={`msg-panel__filter-pill ${convFilter === 'unread' ? 'msg-panel__filter-pill--active' : ''}`}
                        onClick={() => setConvFilter('unread')}
                    >
                        No leídos ({totalUnread})
                    </button>
                    <button
                        className={`msg-panel__filter-pill ${convFilter === 'active24h' ? 'msg-panel__filter-pill--active' : ''}`}
                        onClick={() => setConvFilter('active24h')}
                    >
                        Últimas 24h ({active24hCount})
                    </button>
                </div>

                {/* New Chat Form */}
                {showNewChat && (
                    <div className="msg-panel__new-chat animate-fade-in">
                        <div className="msg-panel__new-chat-header">
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0369A1' }}>Nueva conversación</span>
                            <button className="msg-panel__btn-icon" onClick={() => { setShowNewChat(false); setPatientResults([]); setSelectedPatient(null); }}>
                                <X size={15} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                                <Phone size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                                <input
                                    type="tel"
                                    placeholder="Número de teléfono (ej. 2644123456)"
                                    value={newChatPhone}
                                    onChange={e => setNewChatPhone(e.target.value)}
                                    className="msg-panel__new-chat-input"
                                    style={{ paddingLeft: '32px' }}
                                />
                            </div>
                            <div style={{ position: 'relative' }}>
                                <User size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar paciente o ingresar nombre..."
                                    value={newChatName}
                                    onChange={e => handlePatientSearch(e.target.value)}
                                    className="msg-panel__new-chat-input"
                                    style={{ paddingLeft: '32px' }}
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
                                {patientSearching && <div style={{ position: 'absolute', right: '10px', top: '9px' }}><Loader size={14} className="msg-panel__spinner" /></div>}
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
                                <MessageSquare size={14} /> Iniciar Conversación
                            </button>
                        </div>
                    </div>
                )}

                {/* Conversation List */}
                <div className="msg-panel__conv-list">
                    {loading ? (
                        <div className="msg-panel__empty"><Loader size={24} className="msg-panel__spinner" /><span>Cargando conversaciones...</span></div>
                    ) : filtered.length === 0 ? (
                        <div className="msg-panel__empty"><MessageSquare size={32} strokeWidth={1.2} /><span>Sin conversaciones para este filtro</span></div>
                    ) : (
                        filtered.map(conv => {
                            const name = contactNames[conv.phone] || conv.senderName || conv.phone;
                            const isActive = selectedPhone === conv.phone;
                            const hasUnread = conv.unreadCount > 0;
                            const isRecent24h = conv.lastDate && (Date.now() - new Date(conv.lastDate).getTime()) <= 24 * 60 * 60 * 1000;
                            const preview = cleanPreviewText(conv.lastMessage);

                            return (
                                <button
                                    key={conv.phone}
                                    className={`msg-panel__conv-item ${isActive ? 'msg-panel__conv-item--active' : ''} ${hasUnread ? 'msg-panel__conv-item--unread' : ''}`}
                                    onClick={() => setSelectedPhone(conv.phone)}
                                >
                                    <div
                                        className="msg-panel__conv-avatar"
                                        style={{ background: getAvatarGradient(name) }}
                                    >
                                        {getInitials(name)}
                                        <span
                                            title={isRecent24h ? 'Activo en las últimas 24 hs' : 'Más de 24 hs'}
                                            style={{
                                                position: 'absolute',
                                                bottom: '-1px',
                                                right: '-1px',
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '50%',
                                                background: isRecent24h ? '#10B981' : '#CBD5E1',
                                                border: '2px solid #FFFFFF',
                                            }}
                                        />
                                    </div>
                                    <div className="msg-panel__conv-info">
                                        <div className="msg-panel__conv-top">
                                            <span className={`msg-panel__conv-name ${hasUnread ? 'msg-panel__conv-name--bold' : ''}`}>
                                                {name}
                                            </span>
                                            <span className="msg-panel__conv-time" style={{ color: hasUnread ? '#0284C7' : '#94A3B8', fontWeight: hasUnread ? 700 : 500 }}>
                                                {formatDate(conv.lastDate)}
                                            </span>
                                        </div>
                                        <div className="msg-panel__conv-bottom">
                                            <span className="msg-panel__conv-preview" style={{ color: hasUnread ? '#1E293B' : '#64748B', fontWeight: hasUnread ? 600 : 400 }}>
                                                {conv.direction === 'outgoing' && <span style={{ color: '#0284C7', fontWeight: 700 }}>✓✓ </span>}
                                                {preview.length > 44 ? preview.slice(0, 44) + '…' : preview}
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
                    <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                        {filtered.length} de {conversations.length} conversaciones
                    </span>
                </div>
            </div>

            {/* ========== CENTER: Chat View ========== */}
            <div className="msg-panel__chat">
                {!selectedPhone ? (
                    <div className="msg-panel__chat-empty">
                        <div className="msg-panel__chat-empty-icon"><MessageSquare size={42} strokeWidth={1.5} /></div>
                        <h3>Centro de Mensajería Clínica</h3>
                        <p>Seleccioná una conversación de la lista o iniciá un nuevo contacto con un paciente</p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header with SALUS Patient Context */}
                        <div className="msg-panel__chat-header" style={{ flexDirection: 'column', alignItems: 'stretch', padding: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', flexWrap: 'wrap' }}>
                                <button className="msg-panel__btn-icon msg-panel__back-btn" onClick={() => setSelectedPhone(null)}>
                                    <ArrowLeft size={18} />
                                </button>
                                <div
                                    className="msg-panel__chat-header-avatar"
                                    style={{ background: getAvatarGradient(selectedContactName) }}
                                >
                                    {getInitials(selectedContactName)}
                                </div>
                                <div className="msg-panel__chat-header-info" style={{ flex: 1, minWidth: '160px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span className="msg-panel__chat-header-name">{selectedContactName}</span>
                                        {salusPatientInfo?.dni && (
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px',
                                                borderRadius: '6px', background: '#F1F5F9', color: '#334155',
                                            }}>
                                                DNI {salusPatientInfo.dni}
                                            </span>
                                        )}
                                        {salusPatientInfo?.edad && (
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px',
                                                borderRadius: '6px', background: '#F0F9FF', color: '#0369A1',
                                            }}>
                                                {salusPatientInfo.edad} años
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                                        <span className="msg-panel__chat-header-phone">
                                            <Phone size={11} /> +{selectedPhone}
                                        </span>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            fontSize: '0.68rem', fontWeight: 700,
                                            color: window24hStatus.active ? '#059669' : '#D97706',
                                        }}>
                                            <span style={{
                                                width: '6px', height: '6px', borderRadius: '50%',
                                                background: window24hStatus.active ? '#10B981' : '#F59E0B',
                                            }} />
                                            {window24hStatus.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Clinical Badges from SALUS (recepciones_visitas) */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {salusPatientInfo?.obra_social && (
                                        <span className="msg-panel__context-badge" style={{ background: '#F0FDF4', color: '#15803D', borderColor: '#BBF7D0' }}>
                                            <Shield size={12} />
                                            {salusPatientInfo.obra_social.length > 24
                                                ? salusPatientInfo.obra_social.slice(0, 24) + '…'
                                                : salusPatientInfo.obra_social}
                                        </span>
                                    )}

                                    {salusPatientInfo?.visitas?.[0] && (
                                        <span className="msg-panel__context-badge" style={{ background: '#EFF6FF', color: '#0369A1', borderColor: '#BAE6FD' }}>
                                            <Calendar size={12} />
                                            {salusPatientInfo.visitas[0].tipo_visita?.includes('INFORME') ? 'Informe:' : 'Chequeo:'}{' '}
                                            {new Date(salusPatientInfo.visitas[0].fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                            {salusPatientInfo.visitas[0].asistencia ? ` (${salusPatientInfo.visitas[0].asistencia})` : ''}
                                        </span>
                                    )}

                                    {patientContext?.budget && (
                                        <button
                                            className="msg-panel__context-badge"
                                            style={{ background: '#FFFBEB', color: '#D97706', cursor: 'pointer', borderColor: '#FDE68A' }}
                                            onClick={() => setShowBudgetDetail(prev => !prev)}
                                        >
                                            <DollarSign size={12} />
                                            ${Number(patientContext.budget.importe_total || 0).toLocaleString('es-AR')}
                                            {showBudgetDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setShowSalusDrawer(prev => !prev)}
                                        title="Ver Ficha Clínica e Historial SALUS del Paciente"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '6px 11px', borderRadius: '8px',
                                            border: showSalusDrawer ? '1px solid #0284C7' : '1px solid #E2E8F0',
                                            background: showSalusDrawer ? '#0284C7' : '#FFFFFF',
                                            color: showSalusDrawer ? '#FFFFFF' : '#334155',
                                            fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {showSalusDrawer ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                                        Ficha SALUS
                                        {salusPatientInfo?.visitas?.length > 0 && (
                                            <span style={{
                                                padding: '1px 5px', borderRadius: '999px', fontSize: '0.65rem',
                                                background: showSalusDrawer ? 'rgba(255,255,255,0.2)' : '#E0F2FE',
                                                color: showSalusDrawer ? '#fff' : '#0284C7',
                                            }}>
                                                {salusPatientInfo.visitas.length}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Budget Detail Dropdown */}
                            {showBudgetDetail && patientContext?.budgetItems?.length > 0 && (
                                <div className="msg-panel__budget-dropdown animate-fade-in">
                                    <div className="msg-panel__budget-header-row">
                                        <FileText size={13} />
                                        <span style={{ fontWeight: 700 }}>Detalle del Presupuesto</span>
                                    </div>
                                    <div className="msg-panel__budget-items">
                                        {patientContext.budgetItems.map((item, i) => (
                                            <div key={i} className="msg-panel__budget-item">
                                                <span className="msg-panel__budget-item-desc">
                                                    {item.cantidad > 1 && <span style={{ fontWeight: 700, color: '#2563EB' }}>{item.cantidad}x </span>}
                                                    {item.descripcion}
                                                </span>
                                                <span className="msg-panel__budget-item-amount">
                                                    ${Number(item.importe_total || 0).toLocaleString('es-AR')}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Body container: Messages + Optional Right SALUS Drawer */}
                        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
                            {/* Messages Column */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <div className="msg-panel__messages">
                                    {messagesLoading ? (
                                        <div className="msg-panel__empty" style={{ padding: '40px 0' }}>
                                            <Loader size={24} className="msg-panel__spinner" /><span>Cargando historial de conversación...</span>
                                        </div>
                                    ) : messages.length === 0 ? (
                                        <div className="msg-panel__empty" style={{ padding: '40px 0' }}>
                                            <MessageSquare size={32} strokeWidth={1.2} /><span>Sin mensajes aún. ¡Enviá una plantilla o mensaje para comenzar!</span>
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
                                            const rawText = String(item.content || '');
                                            const isTemplateOrBot =
                                                isOutgoing &&
                                                (rawText.startsWith('📋 [Plantilla Meta]') ||
                                                    rawText.startsWith('✅ [Envío Encuesta') ||
                                                    item.sender_name === 'Dora (Bot)');

                                            const bubbleClass = !isOutgoing
                                                ? 'msg-panel__bubble--in'
                                                : isTemplateOrBot
                                                    ? 'msg-panel__bubble--template'
                                                    : 'msg-panel__bubble--out';

                                            return (
                                                <div
                                                    key={item.id || idx}
                                                    className={`msg-panel__bubble ${bubbleClass}`}
                                                >
                                                    {!isOutgoing && item.sender_name && (
                                                        <span className="msg-panel__bubble-sender">
                                                            {item.sender_name}
                                                        </span>
                                                    )}
                                                    {renderMessageContent(item, isTemplateOrBot, isOutgoing)}
                                                    <span className="msg-panel__bubble-time">
                                                        {isOutgoing && item.sender_name && item.sender_name !== 'Recepciones' && (
                                                            <span style={{ opacity: 0.75, marginRight: '4px' }}>
                                                                {item.sender_name} ·
                                                            </span>
                                                        )}
                                                        {formatTime(item.created_at)}
                                                        {isOutgoing && (
                                                            <CheckCheck size={13} style={{ marginLeft: '2px', opacity: 0.85 }} />
                                                        )}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Composer */}
                                <div className="msg-panel__composer">
                                    {/* Shortcuts popup */}
                                    {showShortcuts && filteredShortcuts.length > 0 && (
                                        <div className="msg-panel__shortcuts-popup animate-fade-in">
                                            <div style={{ padding: '7px 12px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#475569', fontSize: '0.73rem', fontWeight: 700, background: '#F8FAFC' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Zap size={13} color="#0284C7" /> Plantillas Oficiales y Respuestas Rápidas
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>↑↓ para elegir · Enter para seleccionar</span>
                                            </div>
                                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
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
                                                            ? <span className="msg-panel__shortcut-cat msg-panel__shortcut-cat--meta">Meta API</span>
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
                                                <button
                                                    key={e}
                                                    className="msg-panel__emoji-btn"
                                                    onClick={() => { setMessageText(prev => prev + e); inputRef.current?.focus(); }}
                                                >
                                                    {e}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Quick Reply Chips */}
                                    <div className="msg-panel__quick-chips">
                                        {quickReplies.map((qr, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                className="msg-panel__quick-chip"
                                                onClick={qr.action}
                                            >
                                                {qr.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Recording UI */}
                                    {isRecording ? (
                                        <div className="msg-panel__recording-bar">
                                            <button className="msg-panel__btn-icon" onClick={cancelRecording} title="Cancelar" style={{ color: '#EF4444' }}>
                                                <X size={18} />
                                            </button>
                                            <div className="msg-panel__recording-indicator">
                                                <span className="msg-panel__recording-dot" />
                                                <span>Grabando nota de voz... {formatRecordingTime(recordingTime)}</span>
                                            </div>
                                            <button className="msg-panel__send-btn" onClick={stopRecording} title="Enviar audio">
                                                <Send size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="msg-panel__composer-row">
                                            <button className="msg-panel__btn-icon" style={{ border: 'none', background: 'transparent' }} onClick={() => setShowEmoji(prev => !prev)} title="Emojis">
                                                <Smile size={19} />
                                            </button>
                                            <button className="msg-panel__btn-icon" style={{ border: 'none', background: 'transparent' }} onClick={() => fileInputRef.current?.click()} title="Adjuntar Imagen, Video o PDF" disabled={uploadingMedia}>
                                                {uploadingMedia ? <Loader size={18} className="msg-panel__spinner" /> : <Paperclip size={19} />}
                                            </button>
                                            <input type="file" ref={fileInputRef} accept="image/*,video/*,application/pdf" onChange={handleMediaSelect} style={{ display: 'none' }} />
                                            <textarea
                                                ref={inputRef}
                                                className="msg-panel__composer-input"
                                                placeholder="Escribí un mensaje o presioná / para plantillas oficiales..."
                                                value={messageText}
                                                onChange={handleInputChange}
                                                onKeyDown={handleKeyDown}
                                                disabled={sending || uploadingMedia}
                                                rows={1}
                                                onInput={(e) => {
                                                    e.target.style.height = 'auto';
                                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                                }}
                                            />
                                            {messageText.trim() ? (
                                                <button
                                                    className="msg-panel__send-btn"
                                                    onClick={handleSend}
                                                    disabled={!messageText.trim() || sending}
                                                    title="Enviar mensaje"
                                                >
                                                    {sending ? <Loader size={16} className="msg-panel__spinner" /> : <Send size={16} />}
                                                </button>
                                            ) : (
                                                <button
                                                    className="msg-panel__btn-icon"
                                                    style={{ border: 'none', background: 'transparent', color: '#0284C7' }}
                                                    onClick={startRecording}
                                                    title="Grabar nota de voz"
                                                >
                                                    <Mic size={20} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ========== RIGHT DRAWER: Ficha Clínica SALUS ========== */}
                            {showSalusDrawer && (
                                <div style={{
                                    width: '310px',
                                    minWidth: '290px',
                                    background: '#FFFFFF',
                                    borderLeft: '1px solid #E2E8F0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflowY: 'auto',
                                    padding: '18px',
                                    boxShadow: '-4px 0 16px rgba(15, 23, 42, 0.03)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                        <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ClipboardCheck size={16} color="#0284C7" />
                                            Ficha Clínica SALUS
                                        </span>
                                        <button className="msg-panel__btn-icon" style={{ width: '26px', height: '26px' }} onClick={() => setShowSalusDrawer(false)}>
                                            <X size={14} />
                                        </button>
                                    </div>

                                    {!salusPatientInfo ? (
                                        <div style={{ padding: '24px 12px', textAlign: 'center', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1', color: '#64748B', fontSize: '0.78rem' }}>
                                            No se encontraron turnos de Chequeo Preventivo o Informe asociados al teléfono <b>+{selectedPhone}</b> en SALUS.
                                        </div>
                                    ) : (
                                        <>
                                            {/* Tarjeta de datos filiatorios */}
                                            <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 14px', border: '1px solid #E2E8F0', marginBottom: '14px' }}>
                                                <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0F172A', marginBottom: '6px' }}>
                                                    {salusPatientInfo.paciente}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.75rem', color: '#475569' }}>
                                                    {salusPatientInfo.dni && (
                                                        <div>🪪 <b>DNI:</b> {salusPatientInfo.dni} {salusPatientInfo.edad ? `(${salusPatientInfo.edad} años)` : ''}</div>
                                                    )}
                                                    {salusPatientInfo.obra_social && (
                                                        <div>🏥 <b>Cobertura:</b> {salusPatientInfo.obra_social}</div>
                                                    )}
                                                    {salusPatientInfo.centro && (
                                                        <div>📍 <b>Sede habitual:</b> {salusPatientInfo.centro}</div>
                                                    )}
                                                    {salusPatientInfo.departamento && (
                                                        <div>🗺️ <b>Localidad:</b> {salusPatientInfo.departamento}</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Historial de turnos */}
                                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                                                Historial de Chequeos e Informes ({salusPatientInfo.visitas.length})
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {salusPatientInfo.visitas.map((v, idx) => {
                                                    const isInf = String(v.tipo_visita || '').toUpperCase().includes('INFORME');
                                                    const isPres = v.asistencia === 'Presente';
                                                    return (
                                                        <div
                                                            key={v.id || idx}
                                                            style={{
                                                                padding: '10px 12px',
                                                                borderRadius: '9px',
                                                                background: '#FFFFFF',
                                                                border: '1px solid #E2E8F0',
                                                                borderLeft: `3px solid ${isInf ? '#0284C7' : '#10B981'}`,
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                                <span style={{ fontSize: '0.73rem', fontWeight: 800, color: isInf ? '#0284C7' : '#059669' }}>
                                                                    {isInf ? '📋 Consulta Informe' : '🏥 Chequeo Preventivo'}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '0.66rem', fontWeight: 700, padding: '1px 7px', borderRadius: '999px',
                                                                    background: isPres ? '#DCFCE7' : '#FEF3C7',
                                                                    color: isPres ? '#15803D' : '#B45309',
                                                                }}>
                                                                    {v.asistencia || 'Agendado'}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A' }}>
                                                                📅 {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                {v.hora ? ` · ⏰ ${v.hora} hs` : ''}
                                                            </div>
                                                            {v.medico && (
                                                                <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: '2px' }}>
                                                                    🩺 {v.medico}
                                                                </div>
                                                            )}
                                                            {v.centro && (
                                                                <div style={{ fontSize: '0.69rem', color: '#94A3B8', marginTop: '2px' }}>
                                                                    📍 {v.centro} ({v.tipo_agenda})
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
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
                    background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} onClick={() => { setShowMetaCostModal(false); setPendingMetaTemplate(null); }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', padding: '26px 30px',
                        maxWidth: '430px', width: '90%', boxShadow: '0 25px 50px rgba(15,23,42,0.25)',
                        border: '1px solid #E2E8F0', position: 'relative',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{
                                width: '42px', height: '42px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, #0284C7, #0369A1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Sparkles size={20} color="white" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>Enviar Plantilla Oficial Meta</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>WhatsApp Business Cloud API</div>
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC', borderRadius: '10px', padding: '14px',
                            marginBottom: '14px', border: '1px solid #E2E8F0',
                        }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0284C7', marginBottom: '6px' }}>
                                📋 /{pendingMetaTemplate.shortcut}
                            </div>
                            <div style={{ fontSize: '0.79rem', color: '#334155', lineHeight: '1.45', maxHeight: '120px', overflowY: 'auto' }}>
                                {pendingMetaTemplate.message}
                            </div>
                        </div>

                        <div style={{
                            background: '#FFFBEB', borderRadius: '8px', padding: '10px 12px',
                            marginBottom: '18px', border: '1px solid #FDE68A',
                            display: 'flex', alignItems: 'center', gap: '8px',
                        }}>
                            <span style={{ fontSize: '1rem' }}>ℹ️</span>
                            <span style={{ fontSize: '0.75rem', color: '#92400E', fontWeight: 600 }}>
                                Inicia o reabre la ventana de conversación de 24 hs vía Meta Cloud API.
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setShowMetaCostModal(false); setPendingMetaTemplate(null); }}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: 'white', color: '#475569', fontWeight: 600, fontSize: '0.82rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmSendMetaTemplate}
                                disabled={sendingMetaTemplate}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                                    background: sendingMetaTemplate ? '#94A3B8' : 'linear-gradient(135deg, #0284C7, #0369A1)',
                                    color: 'white', fontWeight: 700, fontSize: '0.82rem',
                                    cursor: sendingMetaTemplate ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 8px rgba(2,132,199,0.3)',
                                }}
                            >
                                {sendingMetaTemplate ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                                {sendingMetaTemplate ? 'Enviando...' : 'Confirmar y Enviar'}
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
