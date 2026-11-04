import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Supabase URL o Anon Key no configuradas en .env');
}

const SESSION_KEY = 'admqui_session';
const SESSION_TOKEN_KEY = 'admqui_session_token';
const DEVICE_TOKEN_KEY = 'admqui_device_token';

function generateRandomHex(len = 32) {
    try {
        const arr = new Uint8Array(len / 2);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }
}

export function getOrCreateDeviceToken() {
    try {
        let token = localStorage.getItem(DEVICE_TOKEN_KEY);
        if (!token || token.length < 15) {
            token = 'sa_dev_' + generateRandomHex(32);
            localStorage.setItem(DEVICE_TOKEN_KEY, token);
        }
        return token;
    } catch {
        return '';
    }
}

export function getOrCreateSessionToken() {
    try {
        const hasSession = !!localStorage.getItem(SESSION_KEY);
        if (!hasSession) return 'anonymous';

        let token = localStorage.getItem(SESSION_TOKEN_KEY);
        if (!token || token === 'anonymous' || token.length < 15) {
            token = 'sa_sess_' + generateRandomHex(32);
            localStorage.setItem(SESSION_TOKEN_KEY, token);
        }
        return token;
    } catch {
        return 'anonymous';
    }
}

export function setSessionToken(token) {
    try {
        if (token) {
            localStorage.setItem(SESSION_TOKEN_KEY, token);
        }
    } catch {
        // ignore storage errors
    }
}

export function clearSessionToken() {
    try {
        localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
        // ignore storage errors
    }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: (url, options = {}) => {
            const urlStr = String(url || '');
            if (urlStr.includes('/rest/v1/')) {
                const headers = new Headers(options.headers || {});
                headers.set('x-session-token', getOrCreateSessionToken());
                headers.set('x-device-token', getOrCreateDeviceToken());
                options = { ...options, headers };
            }
            return fetch(url, options);
        },
    },
});
