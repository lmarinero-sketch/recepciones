/**
 * Reminder Service — scheduled_checkups CRUD
 * 
 * Gestiona los turnos agendados de chequeos preventivos en Supabase.
 * Reemplaza la lógica anterior basada en localStorage.
 */

import { supabase } from '../lib/supabase';

const TABLE = 'scheduled_checkups';

/**
 * Fetch all scheduled checkups, ordered by fecha_turno ascending.
 * @param {Object} filters - { estado, search, from, to }
 * @returns {Promise<Array>}
 */
export async function fetchScheduledCheckups(filters = {}) {
    let query = supabase
        .from(TABLE)
        .select('*')
        .order('fecha_turno', { ascending: true });

    if (filters.estado && filters.estado !== 'todos') {
        query = query.eq('estado', filters.estado);
    }

    if (filters.from) {
        query = query.gte('fecha_turno', filters.from);
    }
    if (filters.to) {
        query = query.lte('fecha_turno', filters.to);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching scheduled checkups:', error);
        throw error;
    }
    return data || [];
}

/**
 * Create (upsert) a scheduled checkup.
 * If a record with the same DNI + fecha_turno exists, updates it.
 */
export async function upsertCheckup(checkup) {
    const record = {
        dni: checkup.dni,
        paciente: checkup.paciente,
        telefono1: checkup.telefono1 || null,
        obra_social: checkup.obra_social || null,
        fecha_turno: checkup.fecha_turno || checkup.fecha,
        estado: checkup.estado || 'pendiente',
        notas: checkup.notas || null,
        created_by: checkup.created_by || null,
    };

    const { data, error } = await supabase
        .from(TABLE)
        .upsert(record, { onConflict: 'dni,fecha_turno' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting checkup:', error);
        throw error;
    }
    return data;
}

/**
 * Update the status (estado) of a scheduled checkup.
 */
export async function updateCheckupStatus(id, estado) {
    const updates = { estado };

    if (estado === 'enviado') {
        updates.recordatorio_enviado_at = new Date().toISOString();
    }

    const { data, error } = await supabase
        .from(TABLE)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating checkup status:', error);
        throw error;
    }
    return data;
}

/**
 * Increment the attempts counter and optionally update status.
 */
export async function incrementAttempts(id) {
    // First fetch current
    const { data: current, error: fetchError } = await supabase
        .from(TABLE)
        .select('intentos')
        .eq('id', id)
        .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabase
        .from(TABLE)
        .update({
            intentos: (current.intentos || 0) + 1,
            recordatorio_enviado_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update notes for a scheduled checkup.
 */
export async function updateCheckupNotes(id, notas) {
    const { data, error } = await supabase
        .from(TABLE)
        .update({ notas })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a scheduled checkup.
 */
export async function deleteCheckup(id) {
    const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting checkup:', error);
        throw error;
    }
    return true;
}

/**
 * Migrate localStorage data to Supabase (one-time migration helper).
 */
export async function migrateFromLocalStorage() {
    const STORAGE_KEY = 'scheduled_checkups_v1';
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { migrated: 0 };

        const data = JSON.parse(raw);
        const entries = Object.values(data);
        if (!entries.length) return { migrated: 0 };

        let migrated = 0;
        for (const entry of entries) {
            try {
                await upsertCheckup({
                    dni: entry.dni,
                    paciente: entry.paciente,
                    telefono1: entry.telefono1,
                    obra_social: entry.obra_social,
                    fecha_turno: entry.fecha,
                    estado: entry.estado || 'pendiente',
                });
                migrated++;
            } catch (e) {
                console.warn('Error migrating entry:', entry.dni, e.message);
            }
        }

        // Rename the old key so we don't migrate again
        localStorage.setItem(STORAGE_KEY + '_migrated', raw);
        localStorage.removeItem(STORAGE_KEY);

        return { migrated };
    } catch (e) {
        console.error('Migration error:', e);
        return { migrated: 0, error: e.message };
    }
}

/**
 * Get funnel summary stats.
 */
export async function getFunnelStats() {
    const { data, error } = await supabase
        .from(TABLE)
        .select('estado');

    if (error) throw error;

    const counts = { pendiente: 0, enviado: 0, confirmo: 0, cancelo: 0, reprogramo: 0 };
    (data || []).forEach(row => {
        if (counts[row.estado] !== undefined) counts[row.estado]++;
    });
    return counts;
}
