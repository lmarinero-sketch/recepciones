-- =============================================
-- RECEPCIONES MASTER SCHEMA (CRM WhatsApp + Visitas)
-- Puedes copiar y pegar esto entero en el SQL Editor de tu nuevo Supabase.
-- =============================================

-- =============================================
-- MÓDULO VISITAS (RECEPCIÓN / CHEQUEOS)
-- =============================================
CREATE TABLE IF NOT EXISTS visitas_chequeo (
    id SERIAL PRIMARY KEY,
    tipo_agenda TEXT,
    fecha DATE,
    hora TIME,
    tipo_visita TEXT,
    nhc TEXT,
    dni TEXT,
    paciente TEXT,
    obra_social TEXT,
    motivo TEXT,
    asistencia TEXT,
    medico TEXT,
    direccion_paciente TEXT,
    departamento TEXT,
    telefono1_paciente TEXT,
    telefono2_paciente TEXT,
    comentarios TEXT,
    especialidad TEXT,
    centro TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MÓDULO WHATSAPP CRM (Estructura Base)
-- =============================================

-- 1. Tabla de Configuración de la App (para builderbot URLs / keys, opcional)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Líneas Duales (Business / Messenger / etc)
CREATE TABLE IF NOT EXISTS whatsapp_lines (
    id TEXT PRIMARY KEY,               -- 'line_a', 'line_b', 'line_c'
    label TEXT NOT NULL,               -- Nombre visible
    phone TEXT NOT NULL,               -- Número
    api_key TEXT NOT NULL,             -- BuilderBot API Key
    project_id TEXT NOT NULL,          -- BuilderBot Project ID
    is_active BOOLEAN DEFAULT TRUE,    
    color TEXT DEFAULT '#25D366',      
    icon TEXT DEFAULT 'phone',         
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla Contactos (Agenda CRM)
CREATE TABLE IF NOT EXISTS crm_contacts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    name TEXT,
    dni TEXT,
    assigned_line_id TEXT REFERENCES whatsapp_lines(id),
    status TEXT DEFAULT 'active',
    notes TEXT,
    last_contact_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_phone ON crm_contacts(phone);

-- 4. Tabla Mensajes (Historial y Chat)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    content TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text' CHECK (media_type IN ('text', 'audio', 'image', 'video', 'document', 'sticker')),
    sender_name TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    raw_payload JSONB,
    line_id TEXT REFERENCES whatsapp_lines(id),
    ticket_id TEXT,
    original_media_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wam_phone ON whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_wam_phone_created ON whatsapp_messages(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wam_line_id ON whatsapp_messages(line_id);

-- Función conteo no leídos
CREATE OR REPLACE FUNCTION get_unread_counts()
RETURNS TABLE(phone TEXT, unread_count BIGINT)
LANGUAGE sql STABLE
AS $$
    SELECT phone, COUNT(*) as unread_count
    FROM whatsapp_messages
    WHERE direction = 'incoming' AND is_read = FALSE
    GROUP BY phone;
$$;

-- Función marcar como leídos
CREATE OR REPLACE FUNCTION mark_messages_read(p_phone TEXT)
RETURNS void
LANGUAGE sql
AS $$
    UPDATE whatsapp_messages
    SET is_read = TRUE
    WHERE phone = p_phone AND direction = 'incoming' AND is_read = FALSE;
$$;

-- 5. Tabla Shortcuts / Templates
CREATE TABLE IF NOT EXISTS whatsapp_shortcuts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'Generales',
    requires_variable BOOLEAN DEFAULT FALSE,
    variables JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
