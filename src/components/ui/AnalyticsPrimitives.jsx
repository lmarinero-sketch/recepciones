/**
 * AnalyticsPrimitives.jsx
 * Sistema de diseño unificado para todos los tableros de métricas de Recepciones
 * Estética: Figma Community Data Analytics ("Menos es más" — Snow / Untitled UI / Calidad-QOAG)
 */
import { RefreshCw, Info, Loader2 } from 'lucide-react';

export const ANALYTICS_PALETTE = {
    blue: '#0284C7',
    indigo: '#6366F1',
    sky: '#0EA5E9',
    emerald: '#10B981',
    amber: '#F59E0B',
    rose: '#F43F5E',
    violet: '#8B5CF6',
    teal: '#0D9488',
    slate: '#64748B',
};

export const CHART_SERIES_COLORS = [
    '#0284C7',
    '#10B981',
    '#6366F1',
    '#F59E0B',
    '#8B5CF6',
    '#0EA5E9',
    '#F43F5E',
    '#64748B',
];

export const TOOLTIP_STYLE = {
    borderRadius: '10px',
    border: '1px solid #E2E8F0',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
    fontSize: '0.78rem',
};

export function AnalyticsShell({
    icon: Icon,
    title,
    subtitle,
    controls,
    secondaryBar,
    tabs,
    activeTab,
    onTabChange,
    children,
}) {
    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: '#F8FAFC',
            overflow: 'hidden',
        }}>
            {/* Sticky Clean White Header */}
            <div style={{
                background: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                padding: tabs && tabs.length > 0 ? '16px 24px 0' : '16px 24px 14px',
                flexShrink: 0,
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    flexWrap: 'wrap',
                    marginBottom: (secondaryBar || (tabs && tabs.length > 0)) ? '12px' : 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
                        {Icon && (
                            <div style={{
                                width: '34px', height: '34px', borderRadius: '10px',
                                background: '#F0F9FF', border: '1px solid #BAE6FD',
                                color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <Icon size={18} />
                            </div>
                        )}
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{
                                margin: 0, fontSize: '1.12rem', fontWeight: 800,
                                color: '#0F172A', letterSpacing: '-0.015em',
                            }}>
                                {title}
                            </h2>
                            {subtitle && (
                                <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B', lineHeight: 1.35 }}>
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {controls && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {controls}
                        </div>
                    )}
                </div>

                {secondaryBar && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                        paddingBottom: tabs && tabs.length > 0 ? '10px' : '2px',
                    }}>
                        {secondaryBar}
                    </div>
                )}

                {tabs && tabs.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
                        {tabs.map(t => {
                            const TabIcon = t.icon;
                            const active = activeTab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => onTabChange?.(t.id)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '7px',
                                        padding: '9px 15px', border: 'none', background: 'transparent',
                                        borderBottom: active ? '2px solid #0284C7' : '2px solid transparent',
                                        color: active ? '#0284C7' : '#64748B',
                                        fontSize: '0.8rem', fontWeight: active ? 700 : 600,
                                        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                                    }}
                                >
                                    {TabIcon && <TabIcon size={15} />}
                                    <span>{t.label}</span>
                                    {t.badge !== undefined && t.badge !== null && (
                                        <span style={{
                                            fontSize: '0.68rem', fontWeight: 700,
                                            padding: '1px 7px', borderRadius: '999px',
                                            background: active ? '#E0F2FE' : '#F1F5F9',
                                            color: active ? '#0369A1' : '#64748B',
                                        }}>
                                            {t.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <div style={{ maxWidth: '1380px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

export function AnalyticsKpiCard({
    label,
    value,
    subtext,
    pill,
    pillBg,
    pillColor,
    icon: Icon,
    accent = '#0284C7',
    bg = '#F0F9FF',
}) {
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '17px 19px',
            display: 'flex',
            flexDirection: 'column',
            gap: '9px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>{label}</span>
                {Icon && (
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '9px',
                        background: bg, color: accent,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Icon size={16} />
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', flexWrap: 'wrap' }}>
                <span style={{
                    fontSize: '1.72rem', fontWeight: 800, color: '#0F172A',
                    letterSpacing: '-0.02em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums',
                }}>
                    {value}
                </span>
                {pill && (
                    <span style={{
                        fontSize: '0.69rem', fontWeight: 700, padding: '2px 8px',
                        borderRadius: '999px', background: pillBg || bg, color: pillColor || accent,
                    }}>
                        {pill}
                    </span>
                )}
            </div>
            {subtext && (
                <div style={{ fontSize: '0.73rem', color: '#64748B', lineHeight: 1.35 }}>
                    {subtext}
                </div>
            )}
        </div>
    );
}

export function AnalyticsCard({ title, subtitle, badge, explanation, children, style = {}, bodyStyle = {} }) {
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            ...style,
        }}>
            {(title || subtitle || badge) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                        {title && (
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                                {title}
                            </h3>
                        )}
                        {subtitle && (
                            <p style={{ margin: '3px 0 0', fontSize: '0.77rem', color: '#64748B', lineHeight: 1.4 }}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
                </div>
            )}
            <div style={bodyStyle}>{children}</div>
            {explanation && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    padding: '10px 12px', borderRadius: '10px',
                    background: '#F8FAFC', border: '1px solid #F1F5F9',
                    fontSize: '0.75rem', color: '#475569', lineHeight: 1.45,
                }}>
                    <Info size={14} color="#0284C7" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{explanation}</span>
                </div>
            )}
        </div>
    );
}

export function SegmentedControl({ options, value, onChange }) {
    return (
        <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '3px', borderRadius: '9px', gap: '2px' }}>
            {options.map(opt => {
                const active = value === opt.id;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange(opt.id)}
                        style={{
                            padding: '5px 11px', border: 'none', borderRadius: '7px',
                            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                            background: active ? '#FFFFFF' : 'transparent',
                            color: active ? '#0284C7' : '#64748B',
                            boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
                            transition: 'all 0.15s', whiteSpace: 'nowrap',
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

export function RefreshButton({ onClick, loading }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={loading}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '8px',
                border: '1px solid #E2E8F0', background: '#FFFFFF',
                fontSize: '0.75rem', fontWeight: 600, color: '#334155',
                cursor: loading ? 'not-allowed' : 'pointer',
            }}
        >
            <RefreshCw size={13} className={loading ? 'msg-panel__spinner' : ''} />
            Actualizar
        </button>
    );
}

export function AnalyticsLoader({ text = 'Cargando métricas...', subtext }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '280px', gap: '10px', color: '#64748B', fontSize: '0.86rem',
        }}>
            <Loader2 size={28} className="msg-panel__spinner" color="#0284C7" />
            <span>{text}</span>
            {subtext && <span style={{ fontSize: '0.75rem', color: '#0284C7' }}>{subtext}</span>}
        </div>
    );
}

export function EmptyChartState({ height = 240, text = 'Sin datos para el período seleccionado.' }) {
    return (
        <div style={{
            height, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94A3B8', fontSize: '0.83rem',
        }}>
            {text}
        </div>
    );
}

export const selectInputStyle = {
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    background: '#FFFFFF',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#334155',
    cursor: 'pointer',
};

export const dateInputStyle = {
    padding: '5px 8px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    fontSize: '0.75rem',
    color: '#0F172A',
};
