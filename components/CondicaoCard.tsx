import { Condicao } from '@/lib/types'

type Props = {
  condicao: Condicao
}

function verdictBadge(veredicto: string): { bg: string; color: string } {
  if (veredicto.trim() === 'DROP LIBERADO') return { bg: '#DCFCE7', color: '#15803D' }
  if (veredicto.includes('MELHOR ESPERAR'))  return { bg: '#FEE2E2', color: '#B91C1C' }
  return { bg: '#FEF9C3', color: '#A16207' }
}

function janelaStyle(veredicto: string): { bg: string; color: string } {
  if (veredicto.trim() === 'DROP LIBERADO') return { bg: '#F0FDF4', color: '#166534' }
  if (veredicto.includes('MELHOR ESPERAR')) return { bg: '#FEF2F2', color: '#991B1B' }
  return { bg: '#FFFBEB', color: '#92400E' }
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22C55E'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}

function rainColor(mm: number): string {
  if (mm === 0)  return '#22C55E'
  if (mm <= 5)   return '#F59E0B'
  return '#EF4444'
}

function peakColor(mm: number): string {
  if (mm < 5)   return '#22C55E'
  if (mm <= 10) return '#F59E0B'
  return '#EF4444'
}

function accumColor(mm: number): string {
  if (mm < 10)  return '#22C55E'
  if (mm <= 30) return '#F59E0B'
  return '#EF4444'
}

function windColor(kmh: number): string {
  if (kmh < 20)  return '#22C55E'
  if (kmh <= 40) return '#F59E0B'
  return '#EF4444'
}

const metricBox: React.CSSProperties = {
  background: '#F9FAFB', borderRadius: 10, padding: '8px 10px',
}

const metricLabel: React.CSSProperties = {
  fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 3,
}

function MetricCell({ label, icon, value, color = '#111111' }: {
  label: string; icon: string; value: string; color?: string
}) {
  return (
    <div style={metricBox}>
      <div style={metricLabel}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 14 }} />
        {value}
      </div>
    </div>
  )
}

export default function CondicaoCard({ condicao }: Props) {
  const badge    = verdictBadge(condicao.veredicto)
  const janela   = janelaStyle(condicao.veredicto)
  const score    = condicao.aderencia_score ?? 0
  const sc       = scoreColor(score)
  const windKmh  = condicao.wind_ms * 3.6
  const showPico = condicao.pico_3h != null && condicao.pico_3h >= 3
  const showInc  = condicao.inclinacao != null && condicao.inclinacao !== 0

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 16,
      border: '0.5px solid #E5E7EB',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px 0',
      }}>
        <span style={{
          fontSize: 11, color: '#9CA3AF',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Condição do Solo
        </span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
          {new Date(condicao.gerado_em).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Veredicto + aderência_status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: badge.bg, color: badge.color,
            fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 12px',
            flexShrink: 0,
          }}>
            {condicao.veredicto}
          </span>
          <span style={{ fontSize: 11, color: '#6B7280', textAlign: 'right' }}>
            {condicao.aderencia_status}
          </span>
        </div>

        {/* Barra de progresso */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>Aderência do solo</span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{score} / 100</span>
          </div>
          <div style={{ height: 6, background: '#F3F4F6', borderRadius: 999 }}>
            <div style={{
              height: '100%',
              width: `${score}%`,
              background: sc,
              borderRadius: 999,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Grid de métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <MetricCell
            label="Chuva agora"
            icon="ti-droplet"
            value={`${condicao.rain_mm.toFixed(1)}mm`}
            color={rainColor(condicao.rain_mm)}
          />
          {showPico && (
            <MetricCell
              label="Pico 3h"
              icon="ti-droplet-half"
              value={`${condicao.pico_3h.toFixed(1)}mm`}
              color={peakColor(condicao.pico_3h)}
            />
          )}
          <MetricCell
            label="Acúmulo 48h"
            icon="ti-droplet"
            value={`${condicao.acumulo_48h.toFixed(1)}mm`}
            color={accumColor(condicao.acumulo_48h)}
          />
          <MetricCell
            label="Acúmulo ef."
            icon="ti-calculator"
            value={`${condicao.acumulo_ef.toFixed(1)}mm`}
            color={accumColor(condicao.acumulo_ef)}
          />
          <MetricCell
            label="Meia-vida"
            icon="ti-clock"
            value={`${condicao.meia_vida_h}h`}
            color="#6B7280"
          />
          <MetricCell
            label="Vento"
            icon="ti-wind"
            value={`${windKmh.toFixed(1)} km/h`}
            color={windColor(windKmh)}
          />
          {condicao.gust_max_kmh != null && (
            <MetricCell
              label="Rajada máx."
              icon="ti-wind"
              value={`${condicao.gust_max_kmh.toFixed(0)} km/h`}
              color={windColor(condicao.gust_max_kmh)}
            />
          )}
          {condicao.ultima_chuva_h != null && (
            <MetricCell
              label="Última chuva"
              icon="ti-history"
              value={`${condicao.ultima_chuva_h}h atrás`}
              color="#6B7280"
            />
          )}
          {showInc && (
            <MetricCell
              label="Inclinação"
              icon="ti-trending-up"
              value={`${condicao.inclinacao}%`}
              color="#6B7280"
            />
          )}
        </div>

        {/* Divisor */}
        <div style={{ borderTop: '0.5px solid #E5E7EB' }} />

        {/* Frase de secagem */}
        {condicao.frase_secagem && (
          <p style={{ fontStyle: 'italic', fontSize: 12, color: '#555555', lineHeight: 1.7, margin: 0 }}>
            {condicao.frase_secagem}
          </p>
        )}

        {/* Janela de pedal */}
        {condicao.janela ? (
          <div style={{
            background: janela.bg, borderRadius: 8, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <span style={{
              fontSize: 11, color: '#9CA3AF',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              Melhor janela
            </span>
            <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-clock" style={{ fontSize: 13, color: janela.color }} />
              <span style={{ color: janela.color }}>{condicao.janela}</span>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#F9FAFB', borderRadius: 8, padding: '6px 12px',
            fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#9CA3AF' }} />
            <span style={{ color: '#9CA3AF' }}>Sem janela definida</span>
          </div>
        )}

      </div>
    </div>
  )
}
