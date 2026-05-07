-- =============================================
-- MIGRACIÓN: Fix unique constraint en whatsapp_shortcuts
-- Problema: El constraint UNIQUE era solo sobre 'shortcut' sin considerar 'sistema'
-- Esto bloqueaba la creación de shortcuts con el mismo nombre en diferentes sistemas
-- (ADM-QUI vs Recepciones)
-- 
-- Ejecutar en: Supabase SQL Editor
-- Fecha: 2026-05-07
-- =============================================

-- 1) Eliminar el constraint viejo (solo shortcut)
ALTER TABLE whatsapp_shortcuts 
DROP CONSTRAINT IF EXISTS whatsapp_shortcuts_shortcut_key;

-- 2) Crear nuevo constraint compuesto (shortcut + sistema)
-- Esto permite que ADM-QUI y Recepciones tengan shortcuts con el mismo nombre
ALTER TABLE whatsapp_shortcuts 
ADD CONSTRAINT whatsapp_shortcuts_shortcut_sistema_key UNIQUE (shortcut, sistema);

-- 3) Verificar que el constraint nuevo existe
SELECT constraint_name, table_name 
FROM information_schema.table_constraints 
WHERE table_name = 'whatsapp_shortcuts' 
  AND constraint_type = 'UNIQUE';
