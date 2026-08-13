-- =============================================
-- MIGRACIÓN 008: Agregar columna 'edad' a recepciones_visitas y visitas_chequeo
-- =============================================

ALTER TABLE recepciones_visitas ADD COLUMN IF NOT EXISTS edad INTEGER;
ALTER TABLE visitas_chequeo ADD COLUMN IF NOT EXISTS edad INTEGER;

CREATE INDEX IF NOT EXISTS idx_recv_edad ON recepciones_visitas(edad);
CREATE INDEX IF NOT EXISTS idx_vis_edad ON visitas_chequeo(edad);
