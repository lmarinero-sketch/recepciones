CREATE TABLE IF NOT EXISTS public.encuestas_preventivos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telefono TEXT NOT NULL,
    fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    estado TEXT NOT NULL CHECK (estado IN ('INVITADO', 'Q1_PENDIENTE', 'Q2_PENDIENTE', 'Q3_PENDIENTE', 'CIERRE_PENDIENTE', 'COMPLETADA', 'RECHAZADA')),
    q1_nps INTEGER CHECK (q1_nps >= 1 AND q1_nps <= 10),
    q2_claridad TEXT CHECK (q2_claridad IN ('A', 'B', 'C')),
    q3_agilidad TEXT CHECK (q3_agilidad IN ('A', 'B', 'C', 'D')),
    cierre_comentario TEXT,
    cierre_audio_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by phone
CREATE INDEX IF NOT EXISTS idx_encuestas_preventivos_telefono ON public.encuestas_preventivos(telefono);
