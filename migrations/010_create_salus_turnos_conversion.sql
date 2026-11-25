-- ============================================================
-- 010: Tabla de turnos SALUS para Embudo de Conversión WhatsApp
-- Sincronizada desde [SALUS].[dbo].[VLISE_Visitas con categoria]
-- ============================================================

CREATE TABLE IF NOT EXISTS public.salus_turnos_conversion (
    id_visita BIGINT PRIMARY KEY,
    id_paciente BIGINT,
    paciente TEXT NOT NULL,
    dni TEXT,
    edad INTEGER,
    sexo TEXT,
    obra_social TEXT,
    centro TEXT,
    especialidad TEXT,
    medico TEXT,
    tipo_visita TEXT,
    categoria_turno TEXT NOT NULL DEFAULT 'Otros Ambulatorios',
    fecha_visita DATE NOT NULL,
    hora_visita TEXT,
    fecha_creacion TIMESTAMPTZ,
    usuario_creacion TEXT,
    asistencia TEXT,
    telefono1 TEXT,
    telefono2 TEXT,
    tel1_last7 TEXT,
    tel2_last7 TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salus_conv_fecha_visita ON public.salus_turnos_conversion (fecha_visita);
CREATE INDEX IF NOT EXISTS idx_salus_conv_fecha_creacion ON public.salus_turnos_conversion (fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_salus_conv_tel1_last7 ON public.salus_turnos_conversion (tel1_last7);
CREATE INDEX IF NOT EXISTS idx_salus_conv_tel2_last7 ON public.salus_turnos_conversion (tel2_last7);
CREATE INDEX IF NOT EXISTS idx_salus_conv_categoria ON public.salus_turnos_conversion (categoria_turno);

ALTER TABLE public.salus_turnos_conversion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read salus_turnos_conversion" ON public.salus_turnos_conversion;
CREATE POLICY "Allow read salus_turnos_conversion"
    ON public.salus_turnos_conversion
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow service write salus_turnos_conversion" ON public.salus_turnos_conversion;
CREATE POLICY "Allow service write salus_turnos_conversion"
    ON public.salus_turnos_conversion
    FOR ALL
    USING (true)
    WITH CHECK (true);
