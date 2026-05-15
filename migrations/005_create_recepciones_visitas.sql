-- =============================================
-- TABLA: recepciones_visitas
-- Alimentada por sync-server (syncRecepcionesVisitas)
-- Contiene turnos CHQ/ECO desde SALUS
-- Usada por RecordatoriosPanel (turnos futuros y recientes)
-- =============================================

CREATE TABLE IF NOT EXISTS recepciones_visitas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_agenda TEXT,
    fecha DATE,
    hora TEXT,
    tipo_visita TEXT,
    nhc TEXT,
    dni TEXT,
    paciente TEXT,
    obra_social TEXT,
    motivo TEXT,
    asistencia TEXT,
    medico TEXT,
    direccion TEXT,
    departamento TEXT,
    telefono1 TEXT,
    telefono2 TEXT,
    comentarios TEXT,
    especialidad TEXT,
    centro TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_recv_fecha ON recepciones_visitas(fecha);
CREATE INDEX IF NOT EXISTS idx_recv_dni ON recepciones_visitas(dni);
CREATE INDEX IF NOT EXISTS idx_recv_paciente ON recepciones_visitas(paciente);
CREATE INDEX IF NOT EXISTS idx_recv_asistencia ON recepciones_visitas(fecha, asistencia);

-- RLS: permitir lectura a todos los autenticados
ALTER TABLE recepciones_visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura recepciones_visitas" ON recepciones_visitas;
CREATE POLICY "Permitir lectura recepciones_visitas"
    ON recepciones_visitas FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Permitir todo service_role recepciones_visitas" ON recepciones_visitas;
CREATE POLICY "Permitir todo service_role recepciones_visitas"
    ON recepciones_visitas FOR ALL
    USING (true)
    WITH CHECK (true);
