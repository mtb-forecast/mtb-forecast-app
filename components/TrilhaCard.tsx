import Link from 'next/link'
import { TrilhaComCondicao, VEREDICTO_CONFIG } from '@/lib/types'
import { formatLocalidade } from '@/lib/geocoding'
import { rainColor, windColor, DISPLAY_THR, VEREDICTO_ACCENT, VEREDICTO_JANELA_BG } from '@/lib/display'

type Props = {
  trilha: TrilhaComCondicao
  isFavorito?: boolean
  onToggleFavorito?: () => void
}

export default function TrilhaCard({ trilha, isFavorito, onToggleFavorito }: Props) {
  const c = trilha.condicao
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg      = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const hasData   = c != null && vcfg != null
  const accentColor = veredictoText ? (VEREDICTO_ACCENT[veredictoText] ?? '#D1D5DB') : '#D1D5DB'
  const janelaBg    = veredictoText ? (VEREDICTO_JANELA_BG[veredictoText] ?? '#F9FAFB') : '#F9FAFB'
  const has12h    = !!c?.veredicto_12h?.trim()
  const showPico  = c?.pico_3h != null && c.pico_3h >= DISPLAY_THR.picoMin
  const windKmh   = c?.wind_ms != null ? c.wind_ms * 3.6 : null
  const hasAlerta = !!(c?.aderencia_futura_status && c?.aderencia_futura_label &&
    c.aderencia_futura_status !== c.aderencia_status)

  const pill: React.CSSProperties = {
    fontSize: '0.7rem', color: '#6B7280', background: '#F3F4F6',
    borderRadius: 999, padding: '2px 9px',
  }

  return (
    <div
      style={{
        background: '#FFFFFF', borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        display: 'flex', overflow: 'hidden',
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
          <span style={pill}>{formatLocalidade(trilha.localidades, trilha.regiao)}</span>
        </div>

        {hasData && c ? (
          <>
            {/* Veredicto */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  background: accentColor + '26', color: accentColor,
                  borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px',
                }}>
                  {vcfg.emoji} {veredictoText}
                </span>
                {has12h && (
                  <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>12h</span>
                )}
              </div>
              {c.aderencia_status && (
                <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>
                  {c.aderencia_status}
                </span>
              )}
            </div>

            {/* Texto dinâmico */}
            {(c.texto_dinamico || c.frase_secagem) && (
              <p style={{
                fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0,
                borderLeft: `3px solid ${accentColor}`, paddingLeft: 10,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              } as React.CSSProperties}>
                {c.texto_dinamico ?? c.frase_secagem}
              </p>
            )}

            {/* Badges solo */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {c.acumulo_48h != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '4px 10px' }}>
                  <i className="ti ti-droplet" style={{ fontSize: 12, color: rainColor(c.acumulo_48h) }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: rainColor(c.acumulo_48h) }}>{c.acumulo_48h.toFixed(1)}mm</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF' }}>chuva 48h</span>
                </div>
              )}
              {showPico && c.pico_3h != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '4px 10px' }}>
                  <i className="ti ti-droplet-half" style={{ fontSize: 12, color: rainColor(c.pico_3h) }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: rainColor(c.pico_3h) }}>{c.pico_3h.toFixed(1)}mm</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF' }}>pico 3h</span>
                </div>
              )}
              {windKmh != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '4px 10px' }}>
                  <i className="ti ti-wind" style={{ fontSize: 12, color: windColor(windKmh) }} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: windColor(windKmh) }}>{windKmh.toFixed(0)} km/h</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF' }}>vento</span>
                </div>
              )}
            </div>

            {/* Alerta aderência futura */}
            {hasAlerta && (
              <div style={{
                background: '#FFFBEB', borderLeft: '3px solid #F59E0B',
                borderRadius: 8, padding: '6px 10px',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: '#92400E',
              }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 12, color: '#F59E0B', flexShrink: 0 }} />
                <span>{c.aderencia_futura_label}: <b>{c.aderencia_futura_status}</b></span>
              </div>
            )}

            {/* Janela de pedal */}
            {c.janela ? (
              <div style={{ background: janelaBg, borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-clock" style={{ fontSize: 13, color: '#6B7280' }} />
                <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Melhor janela:</span>
                <span style={{ fontSize: 12, color: '#374151' }}>{c.janela}</span>
              </div>
            ) : (
              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#9CA3AF' }} />
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>Sem janela definida</span>
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
              background: '#F3F4F6', borderRadius: '50%', width: 22, height: 22,
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
