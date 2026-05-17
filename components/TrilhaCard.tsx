import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG, ADERENCIA_CONFIG } from '@/lib/types'

type Props = {
  trilha: TrilhaComCondicao
  isFavorito?: boolean
  onToggleFavorito?: () => void
}

const ACCENT_COLOR: Record<string, string> = {
  'DROP LIBERADO':                  '#22C55E',
  'DROP LIBERADO - Veja os alertas': '#F59E0B',
  'MELHOR ESPERAR':                  '#EF4444',
}

const JANELA_BG: Record<string, string> = {
  'DROP LIBERADO':                  '#F0FDF4',
  'DROP LIBERADO - Veja os alertas': '#FFFBEB',
  'MELHOR ESPERAR':                  '#FEF2F2',
}

function rainColor(mm: number | null | undefined): string {
  if (mm == null) return '#6B7280'
  if (mm === 0)   return '#22C55E'
  if (mm <= 20)   return '#F59E0B'
  return '#EF4444'
}

function peakColor(mm: number): string {
  if (mm < 5)  return '#22C55E'
  if (mm <= 10) return '#F59E0B'
  return '#EF4444'
}

function windColor(ms: number | null | undefined): string {
  if (ms == null) return '#6B7280'
  const kmh = ms * 3.6
  if (kmh < 20)  return '#22C55E'
  if (kmh <= 40) return '#F59E0B'
  return '#EF4444'
}

export default function TrilhaCard({ trilha, isFavorito, onToggleFavorito }: Props) {
  const c = trilha.condicao
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const acfg = c?.aderencia_status ? (ADERENCIA_CONFIG[c.aderencia_status] ?? null) : null
  const hasData = c != null && vcfg != null

  const accentColor = veredictoText ? (ACCENT_COLOR[veredictoText] ?? '#D1D5DB') : '#D1D5DB'
  const janelaBg    = veredictoText ? (JANELA_BG[veredictoText]   ?? '#F9FAFB')  : '#F9FAFB'
  const showPico    = c?.pico_3h != null && c.pico_3h >= 3

  const pill: React.CSSProperties = {
    fontSize: '0.7rem', color: '#6B7280', background: '#F3F4F6',
    borderRadius: 999, padding: '2px 9px',
  }

  const metricBox: React.CSSProperties = {
    background: '#F9FAFB', borderRadius: 10, padding: '8px 10px',
  }

  const metricLabel: React.CSSProperties = {
    fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
    letterSpacing: '0.04em', marginBottom: 3,
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        display: 'flex',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.10)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)')}
    >
      {/* Barra vertical esquerda */}
      <div style={{ width: 6, flexShrink: 0, background: accentColor }} />

      {/* Conteúdo */}
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Nome + estrela */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111111', lineHeight: 1.3, flex: 1, margin: 0 }}>
            {trilha.name}
          </h3>
          {onToggleFavorito && (
            <button
              onClick={e => { e.preventDefault(); onToggleFavorito() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 17, flexShrink: 0, lineHeight: 1, padding: 0,
                color: isFavorito ? '#FFE000' : '#D1D5DB',
                transition: 'color 0.15s',
              }}
            >
              {isFavorito ? '★' : '☆'}
            </button>
          )}
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {trilha.bioma && <span style={pill}>{trilha.bioma}</span>}
          <span style={pill}>{trilha.trail_type === 'bikepark' ? 'Bike Park' : 'Natural'}</span>
          <span style={pill}>{trilha.regiao}</span>
        </div>

        {hasData && c ? (
          <>
            {/* Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {c.aderencia_status && (
                <span style={{
                  background: '#F3F4F6', color: '#6B7280',
                  borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px',
                }}>
                  {c.aderencia_status}
                </span>
              )}
              {veredictoText && vcfg && (
                <span style={{
                  background: accentColor + '26',
                  color: accentColor,
                  borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px',
                }}>
                  {vcfg.emoji} {veredictoText}
                </span>
              )}
            </div>

            {/* Métricas */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${showPico ? 3 : 2}, 1fr)`,
              gap: 6,
            }}>
              <div style={metricBox}>
                <div style={metricLabel}>Chuva 48h</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: rainColor(c.acumulo_48h), display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-droplet" style={{ fontSize: 14 }} />
                  {c.acumulo_48h?.toFixed(1) ?? '—'}mm
                </div>
              </div>

              {showPico && (
                <div style={metricBox}>
                  <div style={metricLabel}>Pico 3h</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: peakColor(c.pico_3h!), display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-droplet-half" style={{ fontSize: 14 }} />
                    {c.pico_3h!.toFixed(1)}mm
                  </div>
                </div>
              )}

              <div style={metricBox}>
                <div style={metricLabel}>Vento</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: windColor(c.wind_ms), display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-wind" style={{ fontSize: 14 }} />
                  {c.wind_ms != null ? (c.wind_ms * 3.6).toFixed(1) : '—'} km/h
                </div>
              </div>
            </div>

            {/* Frase de secagem */}
            {c.frase_secagem && (
              <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: '#555555', lineHeight: 1.7, margin: 0 }}>
                {c.frase_secagem}
              </p>
            )}

            {/* Janela de pedal */}
            {c.janela ? (
              <div style={{ background: janelaBg, borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-clock" style={{ fontSize: 13, color: '#6B7280' }} />
                <span style={{ color: '#374151' }}>{c.janela}</span>
              </div>
            ) : (
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#9CA3AF' }} />
                <span style={{ color: '#9CA3AF' }}>Sem janela definida</span>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: '0.8rem', color: '#9CA3AF', fontStyle: 'italic', margin: 0 }}>
            Condição ainda não calculada.
          </p>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          {c?.gerado_em ? (
            <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
              Atualizado às {new Date(c.gerado_em).toLocaleTimeString('pt-BR', {
                hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
              })}
            </span>
          ) : <span />}
          <Link
            href={`/trilhas/${trilha.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#111111' }}>Ver detalhes</span>
            <span style={{
              background: '#F3F4F6', borderRadius: '50%',
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <i className="ti ti-arrow-right" style={{ fontSize: 13, color: '#111111' }} />
            </span>
          </Link>
        </div>

      </div>
    </div>
  )
}
