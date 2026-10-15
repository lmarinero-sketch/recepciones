-- =============================================
-- TABLA: programa_prevenir_leads
-- Captación digital in situ para el Programa Prevenir
-- =============================================

CREATE TABLE IF NOT EXISTS programa_prevenir_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    nombre_completo TEXT NOT NULL,
    fecha_nacimiento DATE,
    edad INTEGER,
    telefono TEXT NOT NULL,
    telefono_wa TEXT NOT NULL,
    dni TEXT,
    obra_social TEXT DEFAULT 'Obra Social Provincia',
    tipo_chequeo TEXT DEFAULT 'General',
    lugar_captacion TEXT DEFAULT 'Obra Social Provincia',
    registrado_por TEXT,
    observaciones TEXT,
    estado TEXT DEFAULT 'nuevo',
    mensaje_enviado BOOLEAN DEFAULT false,
    fecha_mensaje_enviado TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prevenir_created_at ON programa_prevenir_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prevenir_telefono_wa ON programa_prevenir_leads(telefono_wa);
CREATE INDEX IF NOT EXISTS idx_prevenir_dni ON programa_prevenir_leads(dni);

-- RLS: permitir inserción y lectura anónima (formulario público en el celular)
ALTER TABLE programa_prevenir_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir insercion publica programa_prevenir_leads" ON programa_prevenir_leads;
CREATE POLICY "Permitir insercion publica programa_prevenir_leads"
    ON programa_prevenir_leads FOR INSERT
    TO public
    WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir lectura programa_prevenir_leads" ON programa_prevenir_leads;
CREATE POLICY "Permitir lectura programa_prevenir_leads"
    ON programa_prevenir_leads FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "Permitir actualizacion programa_prevenir_leads" ON programa_prevenir_leads;
CREATE POLICY "Permitir actualizacion programa_prevenir_leads"
    ON programa_prevenir_leads FOR UPDATE
    TO public
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion programa_prevenir_leads" ON programa_prevenir_leads;
CREATE POLICY "Permitir eliminacion programa_prevenir_leads"
    ON programa_prevenir_leads FOR DELETE
    TO public
    USING (true);
