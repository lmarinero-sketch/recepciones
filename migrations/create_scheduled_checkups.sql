-- =============================================
-- TABLA: scheduled_checkups
-- Almacena turnos agendados para chequeos preventivos.
-- SEGURO: No modifica ninguna tabla existente.
-- =============================================

-- 1. Crear tabla solo si no existe
CREATE TABLE IF NOT EXISTS scheduled_checkups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dni TEXT NOT NULL,
    paciente TEXT NOT NULL,
    telefono1 TEXT,
    obra_social TEXT,
    fecha_turno DATE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' 
        CHECK (estado IN ('pendiente', 'enviado', 'confirmo', 'cancelo', 'reprogramo')),
    intentos INTEGER DEFAULT 0,
    notas TEXT,
    recordatorio_enviado_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices (IF NOT EXISTS = seguro)
CREATE INDEX IF NOT EXISTS idx_sc_fecha ON scheduled_checkups(fecha_turno);
CREATE INDEX IF NOT EXISTS idx_sc_estado ON scheduled_checkups(estado);
CREATE INDEX IF NOT EXISTS idx_sc_dni ON scheduled_checkups(dni);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sc_dni_fecha ON scheduled_checkups(dni, fecha_turno);
