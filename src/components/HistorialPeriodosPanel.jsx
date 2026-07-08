/**
 * HistorialPeriodosPanel — Gestión de snapshots mensuales
 * 
 * Permite cerrar períodos, ver historial de snapshots y comparar.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    FolderClock, Calendar, Lock, Unlock, Loader2, RefreshCw,
    ChevronLeft, ChevronRight, Eye, FileDown, AlertCircle,
} from 'lucide-react';
import {
    fetchPeriodos, cerrarPeriodo, getPeriodoActual,
} from '../services/alquileresService';

export default function HistorialPeriodosPanel({ addToast }) {
    const [periodos, setPeriodos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchPeriodos();
            setPeriodos(data);
        } catch (err) {
            addToast?.('Error cargando historial: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleCerrar = async (periodo) => {
        if (!confirm(`¿Cerrar el período ${periodo}? Esto generará un snapshot de los datos actuales.`)) return;
        setClosing(periodo);
        try {
            await cerrarPeriodo(periodo, 'Valeria');
            addToast?.(`Período ${periodo} cerrado y guardado`, 'success');
            await loadData();
        } catch (err) {
            addToast?.('Error cerrando período: ' + err.message, 'error');
        } finally {
            setClosing(null);
        }
    };

    const formatPeriodoLabel = (p) => {
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const [y, m] = p.split('-').map(Number);
        return `${meses[m - 1]} ${y}`;
    };

    const currentPeriodo = getPeriodoActual();

    return (
        <div className="content" style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--neutral-700)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FolderClock size={20} style={{ color: 'var(--primary-500)' }} />
                    Historial de Períodos
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={loadData} style={iconBtn}><RefreshCw size={14} /></button>
                    <button
                        onClick={() => handleCerrar(currentPeriodo)}
                        disabled={closing !== null}
                        style={{
                            padding: '8px 16px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
                            color: 'white', border: 'none', fontWeight: 600,
                            fontSize: '0.82rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                    >
                        {closing === currentPeriodo ? <Loader2 size={14} className="spin" /> : <Lock size={14} />}
                        Cerrar Período Actual ({formatPeriodoLabel(currentPeriodo)})
                    </button>
                </div>
            </div>

            {/* Info box */}
            <div style={{
                padding: '12px 16px', borderRadius: '10px',
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                marginBottom: '20px', fontSize: '0.8rem', color: '#1E40AF',
                display: 'flex', alignItems: 'center', gap: '8px',
            }}>
                <AlertCircle size={16} />
                Al cerrar un período se genera un snapshot inmutable de todas las asignaciones y métricas. Esto permite comparar mes a mes sin perder datos.
            </div>

            {/* Periodos list */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={28} className="spin" style={{ color: 'var(--primary-400)' }} />
                </div>
            ) : periodos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--neutral-400)' }}>
                    <FolderClock size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <p style={{ fontSize: '0.88rem' }}>No hay períodos cerrados aún</p>
                    <p style={{ fontSize: '0.78rem' }}>Cerrá el período actual para generar el primer snapshot</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {periodos.map(p => {
                        const metricsArr = p.metricas || [];
                        const totalOcupado = metricsArr.reduce((a, s) => a + (s.total_ocupacion || 0), 0);
                        const totalDisponible = metricsArr.reduce((a, s) => a + (s.total_disponibilidad || 0), 0);
                        const tasa = totalDisponible > 0 ? Math.round((totalOcupado / totalDisponible) * 100) : 0;

                        return (
                            <div key={p.id} style={{
                                display: 'flex', alignItems: 'center', gap: '16px',
                                padding: '16px 20px', borderRadius: '12px',
                                border: '1px solid var(--neutral-200)', background: 'white',
                            }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '10px',
                                    background: p.cerrado ? '#F0FDF4' : '#FEF3C7',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {p.cerrado ? <Lock size={18} style={{ color: '#22C55E' }} /> : <Unlock size={18} style={{ color: '#F59E0B' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--neutral-800)' }}>
                                        {formatPeriodoLabel(p.periodo)}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--neutral-400)', marginTop: '2px' }}>
                                        {p.cerrado ? `Cerrado por ${p.cerrado_por || 'sistema'} el ${new Date(p.cerrado_at).toLocaleDateString('es-AR')}` : 'Abierto'}
                                    </div>
                                </div>
                                {totalDisponible > 0 && (
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: tasa >= 80 ? '#22C55E' : '#F59E0B' }}>{tasa}%</div>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--neutral-500)' }}>{totalOcupado}/{totalDisponible}</div>
                                    </div>
                                )}
                                {!p.cerrado && (
                                    <button
                                        onClick={() => handleCerrar(p.periodo)}
                                        disabled={closing !== null}
                                        style={{
                                            padding: '6px 12px', borderRadius: '6px',
                                            border: '1px solid var(--neutral-200)',
                                            background: 'white', cursor: 'pointer',
                                            fontSize: '0.75rem', fontWeight: 600,
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                        }}
                                    >
                                        {closing === p.periodo ? <Loader2 size={12} className="spin" /> : <Lock size={12} />} Cerrar
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const iconBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '30px', height: '30px', borderRadius: '8px',
    border: '1px solid var(--neutral-200)', background: 'white',
    cursor: 'pointer', color: 'var(--neutral-500)',
};
