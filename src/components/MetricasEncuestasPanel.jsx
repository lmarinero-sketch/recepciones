import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, RefreshCw, MessageSquare, Target, Trophy,
    TrendingUp, ThumbsUp, ThumbsDown, CheckCircle2,
    Calendar, Phone, Loader2
} from 'lucide-react';
import { fetchDetalleEncuestas } from '../services/visitasService';

export default function MetricasEncuestasPanel({ addToast }) {
    const [encuestas, setEncuestas] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchDetalleEncuestas();
            setEncuestas(data || []);
        } catch (e) {
            console.error(e);
            addToast?.('Error cargando métricas de encuestas', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Calculate metrics
    const metrics = useMemo(() => {
        const totalEnviadas = encuestas.length;
        const completadas = encuestas.filter(e => e.estado === 'COMPLETADA');
        const completadasCount = completadas.length;
        
        // NPS = % Promotores (9-10) - % Detractores (1-6)
        // Neutros (7-8)
        let promotores = 0;
        let detractores = 0;
        let neutros = 0;
        let validNpsCount = 0;

        // Distribucion Q2 (Claridad)
        const q2Dist = { A: 0, B: 0, C: 0 };
        // Distribucion Q3 (Agilidad)
        const q3Dist = { A: 0, B: 0, C: 0, D: 0 };

        const comentarios = [];

        encuestas.forEach(e => {
            if (e.q1_nps !== null && e.q1_nps !== undefined) {
                validNpsCount++;
                if (e.q1_nps >= 9) promotores++;
                else if (e.q1_nps <= 6) detractores++;
                else neutros++;
            }
            if (e.q2_claridad) q2Dist[e.q2_claridad] = (q2Dist[e.q2_claridad] || 0) + 1;
            if (e.q3_agilidad) q3Dist[e.q3_agilidad] = (q3Dist[e.q3_agilidad] || 0) + 1;
            
            if (e.cierre_comentario && e.cierre_comentario.trim().length > 0) {
                comentarios.push({
                    telefono: e.telefono,
                    nombre: e.nombre_paciente || 'Paciente',
                    fecha: e.updated_at || e.created_at,
                    texto: e.cierre_comentario,
                    audio: e.cierre_audio_url
                });
            }
        });

        let nps = 0;
        if (validNpsCount > 0) {
            nps = Math.round(((promotores / validNpsCount) - (detractores / validNpsCount)) * 100);
        }

        const responseRate = totalEnviadas > 0 ? Math.round((completadasCount / totalEnviadas) * 100) : 0;

        return {
            totalEnviadas,
            completadasCount,
            responseRate,
            nps,
            validNpsCount,
            promotores,
            neutros,
            detractores,
            q2Dist,
            q3Dist,
            comentarios
        };
    }, [encuestas]);

    return (
        <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ marginBottom: '20px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{
                        fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: 0,
                        display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '12px',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <BarChart3 size={20} color="#fff" />
                        </div>
                        Métricas de Encuestas
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '4px 0 0 50px' }}>
                        Visualización de resultados y feedback de pacientes post-chequeo
                    </p>
                </div>
                <div>
                    <button onClick={loadData} disabled={loading} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                        background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px',
                        cursor: 'pointer', fontSize: '0.8rem', color: '#475569', fontWeight: 600,
                    }}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualizar
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
                        <Loader2 size={32} className="spin" color="#94a3b8" />
                    </div>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Target size={24} color="#8b5cf6" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{metrics.responseRate}%</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Tasa de Respuesta</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{metrics.completadasCount} de {metrics.totalEnviadas} completadas</div>
                                </div>
                            </div>
                            
                            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Trophy size={24} color="#10b981" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{metrics.nps}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Net Promoter Score</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Promotores: {metrics.promotores} | Detractores: {metrics.detractores}</div>
                                </div>
                            </div>

                            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ThumbsUp size={24} color="#3b82f6" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{metrics.q2Dist.A || 0}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Explicación Muy Clara</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Q2 Claridad: Opción A</div>
                                </div>
                            </div>

                            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <TrendingUp size={24} color="#f97316" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{metrics.q3Dist.A || 0}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Agilidad Excelente</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Q3 Agilidad: Opción A</div>
                                </div>
                            </div>
                        </div>

                        {/* Distribution Charts / Bars */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Claridad Médica (Q2)</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <BarItem label="A. Muy claro" count={metrics.q2Dist.A || 0} total={metrics.validNpsCount} color="#10b981" />
                                    <BarItem label="B. Algunas dudas" count={metrics.q2Dist.B || 0} total={metrics.validNpsCount} color="#f59e0b" />
                                    <BarItem label="C. Faltó claridad" count={metrics.q2Dist.C || 0} total={metrics.validNpsCount} color="#ef4444" />
                                </div>
                            </div>
                            <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>Agilidad del Circuito (Q3)</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <BarItem label="A. Excelente" count={metrics.q3Dist.A || 0} total={metrics.validNpsCount} color="#10b981" />
                                    <BarItem label="B. Buena" count={metrics.q3Dist.B || 0} total={metrics.validNpsCount} color="#3b82f6" />
                                    <BarItem label="C. Regular" count={metrics.q3Dist.C || 0} total={metrics.validNpsCount} color="#f59e0b" />
                                    <BarItem label="D. Mala" count={metrics.q3Dist.D || 0} total={metrics.validNpsCount} color="#ef4444" />
                                </div>
                            </div>
                        </div>

                        {/* Comments List */}
                        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <MessageSquare size={18} color="#475569" />
                                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Comentarios Abiertos ({metrics.comentarios.length})</h3>
                            </div>
                            
                            {metrics.comentarios.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    Aún no hay comentarios.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {metrics.comentarios.map((c, i) => (
                                        <div key={i} style={{ padding: '16px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>
                                                        {c.nombre}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#64748b' }}>
                                                        <Phone size={10} /> {c.telefono}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                    <Calendar size={12} /> {new Date(c.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#1e293b', lineHeight: '1.5' }}>
                                                {c.texto}
                                            </div>
                                            {c.audio && (
                                                <div style={{ marginTop: '12px' }}>
                                                    <audio controls src={c.audio} style={{ height: '32px', width: '250px' }} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function BarItem({ label, count, total, color }) {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                <span>{label}</span>
                <span>{count} ({percentage}%)</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.5s ease-out' }} />
            </div>
        </div>
    );
}
