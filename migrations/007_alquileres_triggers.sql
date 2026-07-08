-- =============================================
-- TRIGGERS: Auto-registrar novedades de cambios
-- =============================================

-- Trigger function para INSERT en asignaciones (altas)
CREATE OR REPLACE FUNCTION alq_trigger_asignacion_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_medico_display TEXT;
    v_cons_numero TEXT;
    v_sede_id UUID;
    v_sede_nombre TEXT;
    v_dia_label TEXT;
    v_franja_label TEXT;
BEGIN
    SELECT nombre_display INTO v_medico_display FROM alq_medicos WHERE id = NEW.medico_id;
    SELECT c.numero, c.sede_id, s.nombre 
    INTO v_cons_numero, v_sede_id, v_sede_nombre
    FROM alq_consultorios c 
    JOIN alq_sedes s ON s.id = c.sede_id 
    WHERE c.id = NEW.consultorio_id;
    
    v_dia_label := CASE NEW.dia_semana
        WHEN 'lunes' THEN 'lunes' WHEN 'martes' THEN 'martes'
        WHEN 'miercoles' THEN 'miércoles' WHEN 'jueves' THEN 'jueves'
        WHEN 'viernes' THEN 'viernes' WHEN 'sabado' THEN 'sábado'
        ELSE NEW.dia_semana END;
    v_franja_label := CASE NEW.franja
        WHEN 'mañana' THEN 'mañana' WHEN 'siesta' THEN 'siesta'
        WHEN 'tarde' THEN 'tarde' ELSE NEW.franja END;

    INSERT INTO alq_novedades_log (periodo, tipo, medico_id, sede_id, descripcion, detalle)
    VALUES (
        NEW.periodo,
        'alta',
        NEW.medico_id,
        v_sede_id,
        COALESCE(v_medico_display, 'Médico') || ': se incorpora ' || v_dia_label || ' ' || v_franja_label || ' – Consultorio ' || COALESCE(v_cons_numero, '?'),
        jsonb_build_object(
            'consultorio', v_cons_numero,
            'dia', NEW.dia_semana,
            'franja', NEW.franja,
            'sede', v_sede_nombre
        )
    );
    
    RETURN NEW;
END;
$$;

-- Trigger function para UPDATE en asignaciones (bajas y cambios)
CREATE OR REPLACE FUNCTION alq_trigger_asignacion_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_medico_display TEXT;
    v_cons_numero TEXT;
    v_sede_id UUID;
    v_sede_nombre TEXT;
    v_dia_label TEXT;
    v_franja_label TEXT;
    v_tipo TEXT;
    v_descripcion TEXT;
BEGIN
    -- Only log when estado changes to 'baja'
    IF OLD.estado = 'activo' AND NEW.estado = 'baja' THEN
        SELECT nombre_display INTO v_medico_display FROM alq_medicos WHERE id = NEW.medico_id;
        SELECT c.numero, c.sede_id, s.nombre 
        INTO v_cons_numero, v_sede_id, v_sede_nombre
        FROM alq_consultorios c 
        JOIN alq_sedes s ON s.id = c.sede_id 
        WHERE c.id = NEW.consultorio_id;
        
        v_dia_label := CASE NEW.dia_semana
            WHEN 'lunes' THEN 'lunes' WHEN 'martes' THEN 'martes'
            WHEN 'miercoles' THEN 'miércoles' WHEN 'jueves' THEN 'jueves'
            WHEN 'viernes' THEN 'viernes' WHEN 'sabado' THEN 'sábado'
            ELSE NEW.dia_semana END;
        v_franja_label := CASE NEW.franja
            WHEN 'mañana' THEN 'mañana' WHEN 'siesta' THEN 'siesta'
            WHEN 'tarde' THEN 'tarde' ELSE NEW.franja END;

        INSERT INTO alq_novedades_log (periodo, tipo, medico_id, sede_id, descripcion, detalle)
        VALUES (
            NEW.periodo,
            'baja',
            NEW.medico_id,
            v_sede_id,
            COALESCE(v_medico_display, 'Médico') || ': deja ' || v_dia_label || ' ' || v_franja_label || ' – Consultorio ' || COALESCE(v_cons_numero, '?'),
            jsonb_build_object(
                'consultorio', v_cons_numero,
                'dia', NEW.dia_semana,
                'franja', NEW.franja,
                'sede', v_sede_nombre
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$;

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS trg_asignacion_insert ON alq_asignaciones;
DROP TRIGGER IF EXISTS trg_asignacion_update ON alq_asignaciones;

-- Create triggers
CREATE TRIGGER trg_asignacion_insert
    AFTER INSERT ON alq_asignaciones
    FOR EACH ROW
    EXECUTE FUNCTION alq_trigger_asignacion_insert();

CREATE TRIGGER trg_asignacion_update
    AFTER UPDATE ON alq_asignaciones
    FOR EACH ROW
    EXECUTE FUNCTION alq_trigger_asignacion_update();
