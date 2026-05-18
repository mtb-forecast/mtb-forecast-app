import { Condicao } from '@/lib/types'

type Props = {
  condicao: Condicao
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

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

function verdictBorderColor(veredicto: string): string {
  if (veredicto.trim() === 'DROP LIBERADO') return '#22C55E'
  if (veredicto.includes('MELHOR ESPERAR')) return '#EF4444'
  return '#F59E0B'
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

function recalcularSolo(condicao: Condicao) {
  const agora    = new Date()
  const geradoEm = new Date(condicao.gerado_em)
  const driftHoras = (agora.getTime() - geradoEm.getTime()) / 3600000

  const meiaVida    = condicao.meia_vida_h ?? 24
  const acumuloBase = condicao.acumulo_ef ?? 0

  // 1. Solo secando naturalmente até agora
  let acumuloAgora = acumuloBase * Math.pow(0.5, driftHoras / meiaVida)

  // 2. Blocos futuros de chuva que ainda não ocorreram
  let chuvaFutura = 0
  if (condicao.previsao_24h) {
    for (const bloco of condicao.previsao_24h) {
      const horaInicio = parseInt(bloco.label.split('h')[0])
      const horaBloco  = new Date(geradoEm)
      horaBloco.setHours(horaInicio, 0, 0, 0)
      if (horaBloco > agora && bloco.rain_mm > 0.5) {
        const horasAteBloco  = (horaBloco.getTime() - agora.getTime()) / 3600000
        const acumuloNaBloco = acumuloAgora * Math.pow(0.5, horasAteBloco / meiaVida)
        chuvaFutura = Math.max(chuvaFutura, acumuloNaBloco + bloco.rain_mm)
      }
    }
  }

  // 3. Pior cenário: solo agora vs solo após chuva futura
  const acumuloFinal = Math.max(acumuloAgora, chuvaFutura)

  // 4. Horas para Grip Perfeito (threshold = 5.0mm)
  const GRIP_THRESHOLD = 5.0
  const efetivo = acumuloFinal + (condicao.pico_3h ?? 0)
  let horasParaGrip = 0
  if (efetivo > GRIP_THRESHOLD) {
    horasParaGrip = meiaVida * Math.log2(efetivo / GRIP_THRESHOLD)
  }

  // 5. Progresso para barra gradiente
  const maxEfetivo = Math.max(efetivo, condicao.thresh_desc ?? efetivo, 10)
  const progresso  = efetivo <= GRIP_THRESHOLD ? 100 :
    Math.max(0, Math.min(100,
      ((maxEfetivo - efetivo) / (maxEfetivo - GRIP_THRESHOLD)) * 100
    ))

  return {
    driftHoras:       Math.round(driftHoras * 10) / 10,
    acumuloAgora:     Math.round(acumuloAgora * 10) / 10,
    ultimaChuvaH:     Math.round(((condicao.ultima_chuva_h ?? 0) + driftHoras) * 10) / 10,
    horasParaGrip:    Math.round(horasParaGrip * 10) / 10,
    progresso,
    temChuvaFutura:   chuvaFutura > acumuloAgora,
    acumuloOriginal:  acumuloBase,
    trilhaSecaEmAgora: Math.max(0, Math.round((meiaVida - driftHoras) * 10) / 10),
  }
}

// ── Shared style ──────────────────────────────────────────────────────────────

const metricLabelStyle: React.CSSProperties = {
  fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 3,
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LiveMetricCell({ label, icon, value, color = '#111111', sub, tooltip }: {
  label: string; icon: string; value: string; color?: string; sub?: string; tooltip?: string
}) {
  return (
    <div style={{ background: '#F0FDF4', border: '0.5px solid #BBF7D0', borderRadius: 10, padding: '8px 10px' }} title={tooltip}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 14 }} />
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function ReportMetricCell({ label, icon, value, color = '#111111', tooltip }: {
  label: string; icon: string; value: string; color?: string; tooltip?: string
}) {
  return (
    <div style={{ background: '#EFF6FF', border: '0.5px solid #BFDBFE', borderRadius: 10, padding: '8px 10px' }} title={tooltip}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ ...metricLabelStyle, marginBottom: 0 }}>{label}</span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: '#3B82F6',
          background: '#DBEAFE', borderRadius: 3, padding: '1px 4px',
          textTransform: 'uppercase', letterSpacing: '0.03em',
        }}>REPORT</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 14 }} />
        {value}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CondicaoCard({ condicao }: Props) {
  const veredictoDisplay = condicao.veredicto_12h?.trim() || condicao.veredicto
  const has12h      = !!condicao.veredicto_12h?.trim()
  const badge       = verdictBadge(veredictoDisplay)
  const janela      = janelaStyle(veredictoDisplay)
  const borderColor = verdictBorderColor(veredictoDisplay)
  const windKmh     = condicao.wind_ms * 3.6
  const showPico    = condicao.pico_3h != null && condicao.pico_3h >= 3
  const showInc     = condicao.inclinacao != null && condicao.inclinacao !== 0

  const solo = recalcularSolo(condicao)
  const { driftHoras, acumuloAgora, ultimaChuvaH,
          horasParaGrip, progresso, temChuvaFutura, trilhaSecaEmAgora } = solo

  const indicatorColor = progresso >= 80 ? '#22C55E' : progresso >= 50 ? '#F59E0B' : '#EF4444'

  const horaReport = new Date(condicao.gerado_em).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })

  function formatHoras(h: number): string {
    if (h < 24) return `~${Math.round(h)}h restantes`
    const dias = Math.floor(h / 24)
    const hrs  = Math.round(h % 24)
    return `~${dias}d ${hrs}h restantes`
  }

  const efetivoAgora = acumuloAgora + (condicao.pico_3h ?? 0)
  const labelGrip = progresso >= 100 || efetivoAgora <= 5
    ? 'Grip Perfeito ✓'
    : horasParaGrip < 24
      ? `~${Math.round(horasParaGrip)}h restantes`
      : formatHoras(horasParaGrip)

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 16,
      border: '0.5px solid #E5E7EB',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes cc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        padding: '14px 18px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0,
            animation: 'cc-pulse 1.8s ease-in-out infinite',
          }} />
          <div>
            <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Condição do Solo
            </div>
            <div style={{ fontSize: 10, color: '#22C55E', fontWeight: 500 }}>
              Solo calculado agora
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Report: {horaReport}</div>
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>{driftHoras}h atrás</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Veredicto + aderência_status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{
              background: badge.bg, color: badge.color,
              fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 12px',
            }}>
              {veredictoDisplay}
            </span>
            <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {has12h ? '12h' : '48h'}
            </span>
          </div>
          <span style={{ fontSize: 11, color: '#6B7280', textAlign: 'right' }}>
            {condicao.aderencia_status}
          </span>
        </div>

        {/* Texto dinâmico */}
        {condicao.texto_dinamico && (
          <div style={{
            background: '#F9FAFB', borderLeft: `3px solid ${borderColor}`,
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, fontWeight: 500, color: '#111111',
          }}>
            {condicao.texto_dinamico}
          </div>
        )}

        {/* Frase de secagem */}
        {condicao.frase_secagem && (
          <p style={{ fontSize: 12, fontStyle: 'italic', color: '#555555', lineHeight: 1.75, margin: 0 }}>
            {condicao.frase_secagem}
          </p>
        )}

        {/* Alerta futuro */}
        {condicao.aderencia_futura_status && condicao.aderencia_futura_label &&
         condicao.aderencia_futura_status !== condicao.aderencia_status && (
          <div style={{
            background: '#FFFBEB', borderLeft: '3px solid #F59E0B',
            borderRadius: 8, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400E' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#F59E0B' }} />
              <span>
                Previsão {condicao.aderencia_futura_label}: {condicao.aderencia_futura_status}
                {condicao.aderencia_futura_rain != null && condicao.aderencia_futura_rain > 0
                  ? ` (${condicao.aderencia_futura_rain.toFixed(1)}mm previstos)`
                  : ''}
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#B45309', paddingLeft: 19 }}>
              Evite a trilha neste período.
            </span>
          </div>
        )}

        {/* Barra gradiente — Caminho para Grip Perfeito */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span
              style={{ fontSize: 11, color: '#9CA3AF', cursor: 'default' }}
              title="Estimativa recalculada com decaimento desde o report, pico de chuva e secagem do solo."
            >
              Caminho para Grip Perfeito
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: indicatorColor }}>
              {labelGrip}
              {temChuvaFutura && progresso < 100 && (
                <span style={{ color: '#F59E0B' }}> (chuva prevista)</span>
              )}
            </span>
          </div>
          <div style={{
            height: 8, borderRadius: 999, position: 'relative',
            background: 'linear-gradient(to right, #EF4444 0%, #F59E0B 50%, #22C55E 100%)',
          }}>
            <div style={{
              position: 'absolute',
              left: `${progresso}%`,
              top: -3,
              transform: 'translateX(-50%)',
              width: 14, height: 14,
              borderRadius: '50%',
              background: '#FFFFFF',
              border: `2px solid ${indicatorColor}`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }} />
          </div>
        </div>

        {/* Grid de métricas — Live (verde) + Report (azul) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>

          <LiveMetricCell
            label="Umidade retida"
            icon="ti-calculator"
            value={`${acumuloAgora.toFixed(1)}mm`}
            color={accumColor(acumuloAgora)}
            tooltip="Umidade retida recalculada com decaimento desde o report"
          />

          <LiveMetricCell
            label="Trilha seca em"
            icon="ti-clock"
            value={`${trilhaSecaEmAgora}h`}
            color="#6B7280"
            tooltip="Tempo restante estimado para o solo atingir condição ideal"
          />

          {condicao.ultima_chuva_h != null && (
            <LiveMetricCell
              label="Última chuva"
              icon="ti-history"
              value={`${ultimaChuvaH}h atrás`}
              color="#6B7280"
              tooltip="Horas desde a última precipitação, ajustado pelo tempo desde o report"
            />
          )}

          <ReportMetricCell
            label="Chuva 48h"
            icon="ti-droplet"
            value={`${condicao.acumulo_48h.toFixed(1)}mm`}
            color={accumColor(condicao.acumulo_48h)}
            tooltip="Chuva acumulada histórica nas últimas 48h — valor do report"
          />

          {showPico && (
            <ReportMetricCell
              label="Pico de chuva"
              icon="ti-droplet-half"
              value={`${condicao.pico_3h.toFixed(1)}mm`}
              color={peakColor(condicao.pico_3h)}
              tooltip="Maior acumulado em janela de 3h na previsão — valor do report"
            />
          )}

          <ReportMetricCell
            label="Vento máx. 48h"
            icon="ti-wind"
            value={`${windKmh.toFixed(1)} km/h`}
            color={windColor(windKmh)}
            tooltip="Velocidade máxima de vento sustentado prevista nas próximas 48h"
          />

          {condicao.gust_max_kmh != null && (
            <ReportMetricCell
              label="Rajada máx. 48h"
              icon="ti-wind"
              value={`${condicao.gust_max_kmh.toFixed(0)} km/h`}
              color={windColor(condicao.gust_max_kmh)}
              tooltip="Rajada máxima prevista nas próximas 48h"
            />
          )}

          {showInc && (
            <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '8px 10px' }}>
              <div style={metricLabelStyle}>Inclinação</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-trending-up" style={{ fontSize: 14 }} />
                {condicao.inclinacao}%
              </div>
            </div>
          )}
        </div>

        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#9CA3AF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
            Calculado agora
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />
            Report das {horaReport}
          </div>
        </div>

        {/* Divisor */}
        <div style={{ borderTop: '0.5px solid #E5E7EB' }} />

        {/* Janela de pedal */}
        {condicao.janela ? (
          <div style={{
            background: janela.bg, borderRadius: 8, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
