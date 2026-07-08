-- =============================================
-- MÓDULO ALQUILERES DE CONSULTORIOS — SCHEMA
-- Sanatorio Argentino — Gestión de ocupación
-- =============================================

-- ═══════════════════════════════════════════
-- TABLA: alq_sedes
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alq_sedes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    codigo TEXT NOT NULL UNIQUE,
    orden INT DEFAULT 0,
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- TABLA: alq_consultorios
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alq_consultorios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sede_id UUID NOT NULL REFERENCES alq_sedes(id) ON DELETE CASCADE,
    numero TEXT NOT NULL,
    tipo TEXT DEFAULT 'standard' CHECK (tipo IN ('standard', 'especial', 'sum', 'kinesiologia')),
    es_alquilable BOOLEAN DEFAULT TRUE,
    slots_disponibles INT DEFAULT 16,
    orden INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sede_id, numero)
);

-- ═══════════════════════════════════════════
-- TABLA: alq_medicos
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alq_medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    nombre_display TEXT NOT NULL,
    matricula TEXT,
    especialidad TEXT,
    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'baja', 'suspendido')),
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alq_medicos_display ON alq_medicos(nombre_display);
CREATE INDEX IF NOT EXISTS idx_alq_medicos_estado ON alq_medicos(estado);

-- ═══════════════════════════════════════════
-- TABLA: alq_asignaciones (CORE)
-- ═══════════════════════════════════════════
-- Cada fila = un médico ocupa un consultorio en un día + franja
-- El periodo permite historial sin duplicar tablas
CREATE TABLE IF NOT EXISTS alq_asignaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medico_id UUID NOT NULL REFERENCES alq_medicos(id) ON DELETE CASCADE,
    consultorio_id UUID NOT NULL REFERENCES alq_consultorios(id) ON DELETE CASCADE,
    dia_semana TEXT NOT NULL CHECK (dia_semana IN ('lunes','martes','miercoles','jueves','viernes','sabado')),
    franja TEXT NOT NULL CHECK (franja IN ('mañana','siesta','tarde')),
    periodo TEXT NOT NULL,
    es_residente BOOLEAN DEFAULT FALSE,
    es_rotativo BOOLEAN DEFAULT FALSE,
    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
    fecha_alta DATE DEFAULT CURRENT_DATE,
    fecha_baja DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(consultorio_id, dia_semana, franja, periodo)
);

CREATE INDEX IF NOT EXISTS idx_alq_asig_periodo ON alq_asignaciones(periodo);
CREATE INDEX IF NOT EXISTS idx_alq_asig_medico ON alq_asignaciones(medico_id);
CREATE INDEX IF NOT EXISTS idx_alq_asig_consultorio ON alq_asignaciones(consultorio_id);
CREATE INDEX IF NOT EXISTS idx_alq_asig_estado ON alq_asignaciones(estado);

-- ═══════════════════════════════════════════
-- TABLA: alq_novedades_log
-- ═══════════════════════════════════════════
-- Se llena automáticamente via triggers o manualmente
CREATE TABLE IF NOT EXISTS alq_novedades_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('alta','baja','cambio_horario','cambio_sede','cambio_consultorio')),
    medico_id UUID REFERENCES alq_medicos(id),
    sede_id UUID REFERENCES alq_sedes(id),
    descripcion TEXT NOT NULL,
    detalle JSONB,
    usuario TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alq_novedades_periodo ON alq_novedades_log(periodo);
CREATE INDEX IF NOT EXISTS idx_alq_novedades_tipo ON alq_novedades_log(tipo);

-- ═══════════════════════════════════════════
-- TABLA: alq_periodos_snapshot
-- ═══════════════════════════════════════════
-- Historial mensual (reemplaza la duplicación de Excel)
CREATE TABLE IF NOT EXISTS alq_periodos_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    periodo TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL,
    metricas JSONB,
    cerrado BOOLEAN DEFAULT FALSE,
    cerrado_por TEXT,
    cerrado_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- TABLA: alq_onboarding_medicos
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alq_onboarding_medicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medico_nombre TEXT NOT NULL,
    especialidad TEXT,
    etapa_actual TEXT NOT NULL DEFAULT 'consulta_inicial'
        CHECK (etapa_actual IN (
            'consulta_inicial','cv_solicitado','cv_enviado_director',
            'aprobacion_pendiente','aprobado','requisitos_enviados',
            'documentacion_pendiente','documentacion_recibida',
            'agenda_creada','especialidad_configurada','foto_solicitada',
            'publicado_web','turnos_online_activos','completado'
        )),
    historial_etapas JSONB DEFAULT '[]',
    fecha_consulta DATE,
    cv_url TEXT,
    aprobado_por TEXT,
    documentacion JSONB DEFAULT '{}',
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- TABLA: alq_catalogo_servicios
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alq_catalogo_servicios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    icono TEXT,
    categoria TEXT DEFAULT 'servicio',
    orden INT DEFAULT 0,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- RPC: Calcular métricas de ocupación
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION alq_calcular_metricas(p_periodo TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    resultado JSONB;
BEGIN
    SELECT jsonb_agg(sede_data) INTO resultado
    FROM (
        SELECT jsonb_build_object(
            'sede_id', s.id,
            'sede_nombre', s.nombre,
            'sede_codigo', s.codigo,
            'consultorios', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'consultorio_id', c.id,
                        'numero', c.numero,
                        'disponibilidad', c.slots_disponibles,
                        'ocupacion', COALESCE((
                            SELECT COUNT(*)::int
                            FROM alq_asignaciones a
                            WHERE a.consultorio_id = c.id
                              AND a.periodo = p_periodo
                              AND a.estado = 'activo'
                        ), 0),
                        'tasa', CASE 
                            WHEN c.slots_disponibles > 0 THEN
                                ROUND(COALESCE((
                                    SELECT COUNT(*)::numeric
                                    FROM alq_asignaciones a
                                    WHERE a.consultorio_id = c.id
                                      AND a.periodo = p_periodo
                                      AND a.estado = 'activo'
                                ), 0) / c.slots_disponibles * 100, 1)
                            ELSE 0
                        END
                    )
                )
                FROM alq_consultorios c
                WHERE c.sede_id = s.id AND c.es_alquilable = TRUE
                ORDER BY c.orden
            ),
            'total_disponibilidad', COALESCE((
                SELECT SUM(c2.slots_disponibles)::int
                FROM alq_consultorios c2
                WHERE c2.sede_id = s.id AND c2.es_alquilable = TRUE
            ), 0),
            'total_ocupacion', COALESCE((
                SELECT COUNT(*)::int
                FROM alq_asignaciones a2
                JOIN alq_consultorios c3 ON c3.id = a2.consultorio_id
                WHERE c3.sede_id = s.id
                  AND a2.periodo = p_periodo
                  AND a2.estado = 'activo'
            ), 0)
        ) AS sede_data
        FROM alq_sedes s
        WHERE s.activa = TRUE
        ORDER BY s.orden
    ) sub;
    
    RETURN COALESCE(resultado, '[]'::jsonb);
END;
$$;

-- ═══════════════════════════════════════════
-- RPC: Calcular liquidación (cuadro para Sandra)
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION alq_calcular_liquidacion(p_periodo TEXT)
RETURNS TABLE(
    medico_id UUID,
    matricula TEXT,
    nombre_display TEXT,
    sede_codigo TEXT,
    sede_nombre TEXT,
    mananas INT,
    mananas_sabado INT,
    siestas INT,
    tardes INT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id AS medico_id,
        m.matricula,
        m.nombre_display,
        s.codigo AS sede_codigo,
        s.nombre AS sede_nombre,
        COUNT(*) FILTER (WHERE a.franja = 'mañana' AND a.dia_semana != 'sabado')::int AS mananas,
        COUNT(*) FILTER (WHERE a.franja = 'mañana' AND a.dia_semana = 'sabado')::int AS mananas_sabado,
        COUNT(*) FILTER (WHERE a.franja = 'siesta')::int AS siestas,
        COUNT(*) FILTER (WHERE a.franja = 'tarde')::int AS tardes
    FROM alq_asignaciones a
    JOIN alq_medicos m ON m.id = a.medico_id
    JOIN alq_consultorios c ON c.id = a.consultorio_id
    JOIN alq_sedes s ON s.id = c.sede_id
    WHERE a.periodo = p_periodo
      AND a.estado = 'activo'
    GROUP BY m.id, m.matricula, m.nombre_display, s.codigo, s.nombre
    ORDER BY m.nombre_display, s.codigo;
END;
$$;

-- ═══════════════════════════════════════════
-- RPC: Cerrar período (snapshot)
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION alq_cerrar_periodo(p_periodo TEXT, p_usuario TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    snapshot_data JSONB;
    metricas_data JSONB;
BEGIN
    -- Build snapshot from current assignments
    SELECT jsonb_agg(
        jsonb_build_object(
            'medico_id', a.medico_id,
            'medico_display', m.nombre_display,
            'consultorio_id', a.consultorio_id,
            'consultorio_numero', c.numero,
            'sede_codigo', s.codigo,
            'dia_semana', a.dia_semana,
            'franja', a.franja,
            'es_residente', a.es_residente
        )
    ) INTO snapshot_data
    FROM alq_asignaciones a
    JOIN alq_medicos m ON m.id = a.medico_id
    JOIN alq_consultorios c ON c.id = a.consultorio_id
    JOIN alq_sedes s ON s.id = c.sede_id
    WHERE a.periodo = p_periodo AND a.estado = 'activo';

    -- Get metrics
    metricas_data := alq_calcular_metricas(p_periodo);

    -- Upsert snapshot
    INSERT INTO alq_periodos_snapshot (periodo, data, metricas, cerrado, cerrado_por, cerrado_at)
    VALUES (p_periodo, COALESCE(snapshot_data, '[]'::jsonb), metricas_data, TRUE, p_usuario, NOW())
    ON CONFLICT (periodo) DO UPDATE SET
        data = EXCLUDED.data,
        metricas = EXCLUDED.metricas,
        cerrado = TRUE,
        cerrado_por = EXCLUDED.cerrado_por,
        cerrado_at = NOW();

    RETURN TRUE;
END;
$$;

-- ═══════════════════════════════════════════
-- SEED: Sedes y Consultorios
-- ═══════════════════════════════════════════

-- Sedes
INSERT INTO alq_sedes (nombre, codigo, orden) VALUES
    ('Santa Fe', 'SSFS', 1),
    ('San Luis 1', 'SSL1', 2),
    ('San Luis 2', 'SSL2', 3),
    ('San Luis 3', 'SSL3', 4)
ON CONFLICT (codigo) DO NOTHING;

-- Consultorios Santa Fe (17 consultorios)
INSERT INTO alq_consultorios (sede_id, numero, tipo, es_alquilable, slots_disponibles, orden)
SELECT s.id, c.numero, 'standard', TRUE, 16, c.ord
FROM alq_sedes s,
(VALUES 
    ('1', 1), ('2', 2), ('3', 3), ('4', 4), ('5', 5), ('6', 6), ('7', 7), ('8', 8),
    ('9', 9), ('11', 10), ('12', 11), ('13', 12), ('14', 13), ('15', 14), ('16', 15), ('17', 16)
) AS c(numero, ord)
WHERE s.codigo = 'SSFS'
ON CONFLICT (sede_id, numero) DO NOTHING;

-- Consultorios San Luis 1 (3 consultorios + Ergometría)
INSERT INTO alq_consultorios (sede_id, numero, tipo, es_alquilable, slots_disponibles, orden)
SELECT s.id, c.numero, c.tipo, c.alq, c.slots, c.ord
FROM alq_sedes s,
(VALUES 
    ('1', 'standard', TRUE, 16, 1),
    ('3', 'standard', TRUE, 16, 2),
    ('4', 'standard', TRUE, 16, 3),
    ('Ergometría', 'especial', TRUE, 16, 4)
) AS c(numero, tipo, alq, slots, ord)
WHERE s.codigo = 'SSL1'
ON CONFLICT (sede_id, numero) DO NOTHING;

-- Consultorios San Luis 2 (10 consultorios, 1-4 son SUM/Pediatría fijos)
INSERT INTO alq_consultorios (sede_id, numero, tipo, es_alquilable, slots_disponibles, orden)
SELECT s.id, c.numero, c.tipo, c.alq, c.slots, c.ord
FROM alq_sedes s,
(VALUES 
    ('1', 'sum', FALSE, 16, 1),
    ('2', 'sum', FALSE, 16, 2),
    ('3', 'sum', FALSE, 16, 3),
    ('4', 'sum', FALSE, 16, 4),
    ('5', 'standard', TRUE, 16, 5),
    ('6', 'standard', TRUE, 16, 6),
    ('7', 'standard', TRUE, 16, 7),
    ('8', 'standard', TRUE, 16, 8),
    ('9', 'standard', TRUE, 16, 9),
    ('10', 'standard', TRUE, 16, 10)
) AS c(numero, tipo, alq, slots, ord)
WHERE s.codigo = 'SSL2'
ON CONFLICT (sede_id, numero) DO NOTHING;

-- Consultorios San Luis 3 (7 consultorios + Kinesiología)
INSERT INTO alq_consultorios (sede_id, numero, tipo, es_alquilable, slots_disponibles, orden)
SELECT s.id, c.numero, c.tipo, c.alq, c.slots, c.ord
FROM alq_sedes s,
(VALUES 
    ('1', 'standard', TRUE, 15, 1),
    ('2', 'standard', TRUE, 15, 2),
    ('3', 'standard', TRUE, 15, 3),
    ('4', 'standard', TRUE, 15, 4),
    ('5', 'standard', TRUE, 15, 5),
    ('6', 'standard', TRUE, 15, 6),
    ('7', 'standard', TRUE, 15, 7),
    ('Kinesiología', 'kinesiologia', TRUE, 15, 8)
) AS c(numero, tipo, alq, slots, ord)
WHERE s.codigo = 'SSL3'
ON CONFLICT (sede_id, numero) DO NOTHING;
