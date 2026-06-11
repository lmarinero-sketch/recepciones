/**
 * SkeletonLoader — Componentes skeleton con shimmer para estados de carga.
 * Usa la clase CSS `.skeleton` de index.css (shimmer animation).
 */

/**
 * Skeleton para una tarjeta individual
 */
export function SkeletonCard() {
    return (
        <div style={{
            background: '#fff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
        }}>
            {/* Avatar + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className="skeleton" style={{ height: '14px', width: '70%', borderRadius: '6px' }} />
                    <div className="skeleton" style={{ height: '10px', width: '45%', borderRadius: '6px' }} />
                </div>
            </div>
            {/* Info rows */}
            <div className="skeleton" style={{ height: '12px', width: '90%', borderRadius: '6px' }} />
            <div className="skeleton" style={{ height: '12px', width: '60%', borderRadius: '6px' }} />
            {/* Bottom badges */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <div className="skeleton" style={{ height: '24px', width: '80px', borderRadius: '12px' }} />
                <div className="skeleton" style={{ height: '24px', width: '60px', borderRadius: '12px' }} />
            </div>
        </div>
    );
}

/**
 * Grid de tarjetas skeleton
 * @param {{ cards: number }} props
 */
export function SkeletonCardGrid({ cards = 6 }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '16px',
            padding: '4px',
        }}>
            {Array.from({ length: cards }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}

/**
 * Skeleton para una fila de tabla
 */
export function SkeletonRow({ cols = 5 }) {
    return (
        <tr>
            {Array.from({ length: cols }).map((_, i) => (
                <td key={i} style={{ padding: '12px 16px' }}>
                    <div className="skeleton" style={{
                        height: '12px',
                        width: `${50 + Math.random() * 40}%`,
                        borderRadius: '6px',
                    }} />
                </td>
            ))}
        </tr>
    );
}

/**
 * Skeleton para una lista de filas
 */
export function SkeletonTable({ rows = 8, cols = 5 }) {
    return (
        <>
            {Array.from({ length: rows }).map((_, i) => (
                <SkeletonRow key={i} cols={cols} />
            ))}
        </>
    );
}

/**
 * Skeleton para estadísticas (stat cards)
 */
export function SkeletonStats({ count = 4 }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: '12px' }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} style={{
                    background: '#fff', borderRadius: '12px', padding: '16px',
                    border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                    <div className="skeleton" style={{ width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div className="skeleton" style={{ height: '20px', width: '50%', borderRadius: '6px' }} />
                        <div className="skeleton" style={{ height: '10px', width: '70%', borderRadius: '6px' }} />
                    </div>
                </div>
            ))}
        </div>
    );
}
