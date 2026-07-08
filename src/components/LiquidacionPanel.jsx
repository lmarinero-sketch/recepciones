/**
 * LiquidacionPanel — Cuadro automático de liquidación para Sandra
 * 
 * Genera la tabla pivoteada Médico × Mañanas/Siestas/Tardes por sede,
 * contabilizando turnos desde las asignaciones (sin indicar día).
 * Exporta a Excel y PDF.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    DollarSign, Calendar, ChevronLeft, ChevronRight, Download,
    FileSpreadsheet, Loader2, RefreshCw, Search, Building2,
} from 'lucide-react';
import {
    fetchLiquidacion, fetchSedes, getPeriodoActual,
} from '../services/alquileresService';

function parsePeriodo(p) { const [y, m] = p.split('-').map(Number); return { year: y, month: m }; }
function formatPeriodo(p) {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const { year, month } = parsePeriodo(p);
    return `${meses[month - 1]} ${year}`;
}
function shiftPeriodo(p, delta) {
    const { year, month } = parsePeriodo(p);
    const d = new Date(year, month - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function LiquidacionPanel({ addToast }) {
    const [periodo, setPeriodo] = useState(getPeriodoActual());
    const [data, setData] = useState([]);
    const [sedes, setSedes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filtroSede, setFiltroSede] = useState('todas');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [liq, sed] = await Promise.all([
                fetchLiquidacion(periodo),
                fetchSedes(),
            ]);
            setData(liq);
            setSedes(sed);
        } catch (err) {
            addToast?.('Error cargando liquidación: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [periodo, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // Group data by medico (pivot across sedes)
    const pivoted = useMemo(() => {
        const map = {};
        for (const row of data) {
            const key = row.nombre_display;
            if (!map[key]) {
                map[key] = { nombre_display: key, matricula: row.matricula, sedes: {} };
            }
            map[key].sedes[row.sede_codigo] = {
                mananas: row.mananas,
                mananas_sabado: row.mananas_sabado,
                siestas: row.siestas,
                tardes: row.tardes,
            };
        }
        return Object.values(map).sort((a, b) => a.nombre_display.localeCompare(b.nombre_display));
    }, [data]);

    const filtered = useMemo(() => {
        let items = pivoted;
        if (search) {
            const s = search.toLowerCase();
            items = items.filter(m =>
                m.nombre_display.toLowerCase().includes(s) ||
                m.matricula?.includes(s)
            );
        }
        if (filtroSede !== 'todas') {
            items = items.filter(m => m.sedes[filtroSede]);
        }
        return items;
    }, [pivoted, search, filtroSede]);

    // Sede columns to show
    const sedeColumns = useMemo(() => {
        if (filtroSede !== 'todas') {
            const s = sedes.find(x => x.codigo === filtroSede);
            return s ? [s] : [];
        }
        return sedes;
    }, [sedes, filtroSede]);

    // Totals
    const totals = useMemo(() => {
        const t = {};
        for (const s of sedes) {
            t[s.codigo] = { mananas: 0, mananas_sabado: 0, siestas: 0, tardes: 0 };
        }
        for (const row of data) {
            if (t[row.sede_codigo]) {
                t[row.sede_codigo].mananas += row.mananas;
                t[row.sede_codigo].mananas_sabado += row.mananas_sabado;
                t[row.sede_codigo].siestas += row.siestas;
                t[row.sede_codigo].tardes += row.tardes;
            }
        }
        return t;
    }, [data, sedes]);

    const handleExportCSV = () => {
        let csv = 'MAT,PRESTADOR';
        for (const s of sedeColumns) {
            csv += `,Mañanas ${s.nombre},Mañanas Sáb ${s.nombre},Siestas ${s.nombre},Tardes ${s.nombre}`;
        }
        csv += '\n';
        for (const m of filtered) {
            csv += `${m.matricula || ''},${m.nombre_display}`;
            for (const s of sedeColumns) {
                const d = m.sedes[s.codigo] || {};
                csv += `,${d.mananas || 0},${d.mananas_sabado || 0},${d.siestas || 0},${d.tardes || 0}`;
            }
            csv += '\n';
        }
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Liquidacion_${periodo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        addToast?.('CSV descargado', 'success');
    };

    return (
        <div className="content" style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, -1))} style={iconBtn}><ChevronLeft size={16} /></button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--neutral-700)', minWidth: '130px', textAlign: 'center' }}>
                            <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            {formatPeriodo(periodo)}
                        </span>
                        <button onClick={() => setPeriodo(p => shiftPeriodo(p, 1))} style={iconBtn}><ChevronRight size={16} /></button>
                    </div>
                    <button onClick={loadData} style={iconBtn} title="Recargar"><RefreshCw size={14} /></button>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--neutral-400)' }} />
                        <input
                            type="text" placeholder="Buscar médico..."
                            value={search} onChange={e => setSearch(e.target.value)}
                            style={{ padding: '7px 12px 7px 32px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.8rem', width: '200px' }}
                        />
                    </div>
                    <select value={filtroSede} onChange={e => setFiltroSede(e.target.value)} style={{
                        padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.8rem', cursor: 'pointer',
                    }}>
                        <option value="todas">Todas las sedes</option>
                        {sedes.map(s => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
                    </select>
                    <button onClick={handleExportCSV} style={{
                        padding: '8px 16px', borderRadius: '8px',
                        background: '#22C55E', color: 'white', border: 'none',
                        fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                        <FileSpreadsheet size={14} /> Exportar CSV
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div style={{
                display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap',
            }}>
                <div style={{
                    padding: '12px 20px', borderRadius: '10px', background: 'var(--neutral-50)',
                    border: '1px solid var(--neutral-200)',
                }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', fontWeight: 500 }}>Total Médicos</span>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-600)' }}>{filtered.length}</div>
                </div>
                {sedeColumns.map(s => {
                    const t = totals[s.codigo] || {};
                    const total = (t.mananas || 0) + (t.mananas_sabado || 0) + (t.siestas || 0) + (t.tardes || 0);
                    return (
                        <div key={s.codigo} style={{
                            padding: '12px 20px', borderRadius: '10px', background: 'var(--neutral-50)',
                            border: '1px solid var(--neutral-200)',
                        }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--neutral-500)', fontWeight: 500 }}>{s.nombre}</span>
                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--neutral-700)' }}>{total} turnos</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--neutral-400)' }}>
                                M:{t.mananas || 0} S:{t.siestas || 0} T:{t.tardes || 0}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={28} className="spin" style={{ color: 'var(--primary-400)' }} />
                </div>
            ) : (
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--neutral-200)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--neutral-50)' }}>
                                <th style={thStyle}>Mat.</th>
                                <th style={{ ...thStyle, textAlign: 'left', minWidth: '160px' }}>Prestador</th>
                                {sedeColumns.map(s => (
                                    <th key={s.codigo} colSpan={4} style={{ ...thStyle, borderLeft: '2px solid var(--neutral-300)', background: '#EFF6FF' }}>
                                        {s.nombre}
                                    </th>
                                ))}
                            </tr>
                            <tr style={{ background: 'var(--neutral-50)' }}>
                                <th style={thStyle}></th>
                                <th style={thStyle}></th>
                                {sedeColumns.map(s => (
                                    [
                                        <th key={`${s.codigo}-m`} style={{ ...thSubStyle, borderLeft: '2px solid var(--neutral-300)' }}>Mañ</th>,
                                        <th key={`${s.codigo}-ms`} style={thSubStyle}>Sáb</th>,
                                        <th key={`${s.codigo}-s`} style={thSubStyle}>Sie</th>,
                                        <th key={`${s.codigo}-t`} style={thSubStyle}>Tar</th>,
                                    ]
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((m, i) => (
                                <tr key={m.nombre_display} style={{ background: i % 2 === 0 ? 'white' : 'var(--neutral-50)' }}>
                                    <td style={{ ...tdStyle, color: 'var(--neutral-400)', fontWeight: 500 }}>{m.matricula || ''}</td>
                                    <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'left' }}>{m.nombre_display}</td>
                                    {sedeColumns.map(s => {
                                        const d = m.sedes[s.codigo] || {};
                                        return [
                                            <td key={`${s.codigo}-m`} style={{ ...tdStyle, borderLeft: '2px solid var(--neutral-200)' }}>{d.mananas || ''}</td>,
                                            <td key={`${s.codigo}-ms`} style={tdStyle}>{d.mananas_sabado || ''}</td>,
                                            <td key={`${s.codigo}-s`} style={tdStyle}>{d.siestas || ''}</td>,
                                            <td key={`${s.codigo}-t`} style={tdStyle}>{d.tardes || ''}</td>,
                                        ];
                                    })}
                                </tr>
                            ))}
                            {/* Totals row */}
                            <tr style={{ background: '#F0F9FF', fontWeight: 700 }}>
                                <td style={tdStyle}></td>
                                <td style={{ ...tdStyle, textAlign: 'left' }}>TOTALES</td>
                                {sedeColumns.map(s => {
                                    const t = totals[s.codigo] || {};
                                    return [
                                        <td key={`${s.codigo}-m`} style={{ ...tdStyle, borderLeft: '2px solid var(--neutral-200)', fontWeight: 700, color: 'var(--primary-600)' }}>{t.mananas || 0}</td>,
                                        <td key={`${s.codigo}-ms`} style={{ ...tdStyle, fontWeight: 700, color: 'var(--primary-600)' }}>{t.mananas_sabado || 0}</td>,
                                        <td key={`${s.codigo}-s`} style={{ ...tdStyle, fontWeight: 700, color: 'var(--primary-600)' }}>{t.siestas || 0}</td>,
                                        <td key={`${s.codigo}-t`} style={{ ...tdStyle, fontWeight: 700, color: 'var(--primary-600)' }}>{t.tardes || 0}</td>,
                                    ];
                                })}
                            </tr>
                        </tbody>
                    </table>
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
const thStyle = { padding: '10px 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-600)', textAlign: 'center', borderBottom: '2px solid var(--neutral-200)' };
const thSubStyle = { padding: '4px 6px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--neutral-500)', textAlign: 'center', borderBottom: '2px solid var(--neutral-200)' };
const tdStyle = { padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--neutral-100)', fontSize: '0.78rem' };
