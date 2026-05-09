import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG, ADERENCIA_CONFIG } from '@/lib/types'

type Props = {
  trilha: TrilhaComCondicao
  isFavorito?: boolean
  onToggleFavorito?: () => void
}

const VEREDICTO_BORDER: Record<string, string> = {
  'DROP LIBERADO': '#22c55e',
  'ATENÇÃO': '#FFE000',
  'MELHOR ESPERAR': '#ef4444',
}

const VEREDICTO_BADGE: Record<string, { bg: string; color: string }> = {
  'DROP LIBERADO': { bg: '#dcfce7', color: '#166534' },
  'GRIP PERFEITO': { bg: '#dcfce7', color: '#166534' },
  'BOA ADERÊNCIA': { bg: '#fff7ed', color: '#9a3412' },
  'BAIXA ADERÊNCIA': { bg: '#fee2e2', color: '#991b1b' },
  'SECO': { bg: '#fef9c3', color: '#854d0e' },
  'ATENÇÃO': { bg: '#FFE000', color: '#111' },
  'MELHOR ESPERAR': { bg: '#fee2e2', color: '#991b1b' },
  'SEM DADOS': { bg: '#f3f4f6', color: '#6b7280' },
}

export default function TrilhaCard({ trilha, isFavorito, onToggleFavorito }: Props) {
  const c = trilha.condicao
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const acfg = c?.aderencia_status ? (ADERENCIA_CONFIG[c.aderencia_status] ?? null) : null
  const hasData = c != null && vcfg != null

  const borderCor = veredictoText ? (VEREDICTO_BORDER[veredictoText] ?? '#e5e5e5') : '#e5e5e5'
  const vBadge = veredictoText ? (VEREDICTO_BADGE[veredictoText] ?? { bg: '#f3f4f6', color: '#6b7280' }) : null
  const aBadge = c?.aderencia_status ? (VEREDICTO_BADGE[c.aderencia_status] ?? null) : null

  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid #e5e5e5',
        borderLeft: `3px solid ${borderCor}`,
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#111')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = borderCor)}
    >
      <div style={{ padding: 16, flex: 1 }}>

        {/* Nome + favoritar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, color: '#111', lineHeight: 1.3, flex: 1 }}>
            {trilha.name}
          </h3>
          {onToggleFavorito && (
            <button
              onClick={e => { e.preventDefault(); onToggleFavorito() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 16, flexShrink: 0, lineHeight: 1,
                color: isFavorito ? '#FFE000' : '#ccc',
                transition: 'color 0.15s',
              }}
            >
              {isFavorito ? '★' : '☆'}
            </button>
          )}
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {trilha.bioma && (
            <span style={{ fontSize: 11, color: '#888', background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 6px' }}>
              {trilha.bioma}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#888', background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 6px' }}>
            {trilha.trail_type === 'bikepark' ? 'Bike Park' : 'Natural'}
          </span>
          <span style={{ fontSize: 11, color: '#888', background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 6px' }}>
            {trilha.regiao}
          </span>
        </div>

        {hasData && c ? (
          <>
            {/* Badges veredicto + aderência */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {aBadge && c.aderencia_status && (
                <span style={{ ...aBadge, borderRadius: 2, fontSize: 11, fontWeight: 500, padding: '2px 6px' }}>
                  {acfg?.emoji} {c.aderencia_status}
                </span>
              )}
              {vBadge && veredictoText && (
                <span style={{ ...vBadge, borderRadius: 2, fontSize: 11, fontWeight: 500, padding: '2px 6px' }}>
                  {vcfg?.emoji} {veredictoText}
                </span>
              )}
            </div>

            {/* Métricas */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#888', marginBottom: 4 }}>
              <span>🌧 <b>{c.acumulo_48h?.toFixed(1) ?? '—'}mm</b></span>
              {c.pico_3h != null && c.pico_3h > 0 && (
                <span style={{ color: '#ef4444' }}>⚡ <b>{c.pico_3h.toFixed(1)}mm</b> pico</span>
              )}
              <span>💨 <b>{c.wind_ms?.toFixed(1) ?? '—'}m/s</b></span>
            </div>

            {c.frase_secagem && (
              <p style={{ fontSize: 12, color: '#888', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.frase_secagem}
              </p>
            )}
            {c.janela && (
              <p style={{ fontSize: 12, color: '#888' }}>
                🕐 Janela: <span style={{ color: '#111', fontWeight: 500 }}>{c.janela}</span>
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>Condição ainda não calculada.</p>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '0.5px solid #e5e5e5' }}>
        <Link
          href={`/trilhas/${trilha.id}`}
          style={{ fontSize: 13, color: '#111', fontWeight: 500, borderBottom: '1px solid #111' }}
        >
          Ver detalhes →
        </Link>
      </div>
    </div>
  )
}
