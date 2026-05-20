import { Condicao, VEREDICTO_CONFIG } from '@/lib/types'
import { rainColor, windColor, DISPLAY_THR } from '@/lib/display'

type Props = {
  condicao: Condicao
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function verdictBadge(v: string): { bg: string; color: string } {
  if (v.trim() === 'DROP LIBERADO') return { bg: '#DCFCE7', color: '#15803D' }
  if (v.includes('MELHOR ESPERAR')) return { bg: '#FEE2E2', color: '#B91C1C' }
  return { bg: '#FEF9C3', color: '#A16207' }
}

function janelaStyle(v: string): { bg: string; color: string } {
  if (v.trim() === 'DROP LIBERADO') return { bg: '#F0FDF4', color: '#166534' }
  if (v.includes('MELHOR ESPERAR')) return { bg: '#FEF2F2', color: '#991B1B' }
  return { bg: '#FFFBEB', color: '#92400E' }
}

function verdictBorderColor(v: string): string {
  if (v.trim() === 'DROP LIBERADO') return '#22C55E'
  if (v.includes('MELHOR ESPERAR')) return '#EF4444'
  return '#F59E0B'
}

function recalcularSolo(condicao: Condicao) {
  const agora    = new Date()
  const geradoEm = new Date(condicao.gerado_em)
  const driftHoras = (agora.getTime() - geradoEm.getTime()) / 3600000
  const meiaVida   = condicao.meia_vida_h ?? 24
  const acumuloBase = condicao.acumulo_ef ?? 0
  const GRIP_THRESHOLD = condicao.grip_threshold_ef ?? 3.0

  let acumuloAgora = acumuloBase * Math.pow(0.5, driftHoras / meiaVida)

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

  const acumuloFinal = Math.max(acumuloAgora, chuvaFutura)
  const efetivo = acumuloFinal + (condicao.pico_3h ?? 0)
  let horasParaGrip = 0
  if (efetivo > GRIP_THRESHOLD) {
    horasParaGrip = meiaVida * Math.log2(efetivo / GRIP_THRESHOLD)
  }
  const maxEfetivo = Math.max(efetivo, condicao.thresh_desc ?? efetivo, 10)
  const progresso  = efetivo <= GRIP_THRESHOLD ? 100 :
    Math.max(0, Math.min(100, ((maxEfetivo - efetivo) / (maxEfetivo - GRIP_THRESHOLD)) * 100))

  return {
    driftHoras:        Math.round(driftHoras * 10) / 10,
    acumuloAgora:      Math.round(acumuloAgora * 10) / 10,
    ultimaChuvaH:      Math.round(((condicao.ultima_chuva_h ?? 0) + driftHoras) * 10) / 10,
    horasParaGrip:     Math.round(horasParaGrip * 10) / 10,
    progresso,
    temChuvaFutura:    chuvaFutura > acumuloAgora,
    trilhaSecaEmAgora: acumuloAgora > GRIP_THRESHOLD
      ? Math.max(0, Math.round(meiaVida * Math.log2(acumuloAgora / GRIP_THRESHOLD) * 10) / 10)
      : 0,
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SEC: React.CSSProperties = {
  fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 500,
}

const DIV: React.CSSProperties = { borderTop: '0.5px solid #E5E7EB' }

// ── Main component ────────────────────────────────────────────────────────────

export default function CondicaoCard({ condicao }: Props) {
  const veredictoDisplay = condicao.veredicto_12h?.trim() || condicao.veredicto
  const has12h      = !!condicao.veredicto_12h?.trim()
  const badge       = verdictBadge(veredictoDisplay)
  const janela      = janelaStyle(veredictoDisplay)
  const borderColor = verdictBorderColor(veredictoDisplay)
  const windKmh     = condicao.wind_ms * 3.6

  const solo = recalcularSolo(condicao)
  const { driftHoras, acumuloAgora, ultimaChuvaH,
          horasParaGrip, progresso, temChuvaFutura, trilhaSecaEmAgora } = solo

  const isGripOk = condicao.aderencia_status === 'GRIP PERFEITO' || condicao.aderencia_status === 'SECO'
  const progressoExibido = isGripOk ? progresso : Math.min(progresso, 95)
  const indicatorColor = progressoExibido >= 80 ? '#22C55E' : progressoExibido >= 50 ? '#F59E0B' : '#EF4444'
  const horaReport = new Date(condicao.gerado_em).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })

  function formatHoras(h: number): string {
    if (h < 24) return `~${Math.round(h)}h restantes`
    const dias = Math.floor(h / 24); const hrs = Math.round(h % 24)
    return `~${dias}d ${hrs}h restantes`
  }

  const labelGrip = isGripOk
    ? 'Grip Perfeito ✓'
    : horasParaGrip < 24 ? `~${Math.round(horasParaGrip)}h restantes` : formatHoras(horasParaGrip)

  // Próximos 3 dias
  const hoje = new Date()
  const fmtDia = (d: Date) => {
    const ns = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${ns[d.getDay()]}`
  }
  const d1 = new Date(hoje); d1.setDate(hoje.getDate() + 1)
  const d2 = new Date(hoje); d2.setDate(hoje.getDate() + 2)
  const d3 = new Date(hoje); d3.setDate(hoje.getDate() + 3)
  const fdsDias = [
    { label: fmtDia(d1), v: condicao.fds_d1_veredicto, rain: condicao.fds_d1_rain, wind: condicao.fds_d1_wind },
    { label: fmtDia(d2), v: condicao.fds_d2_veredicto, rain: condicao.fds_d2_rain, wind: condicao.fds_d2_wind },
    { label: fmtDia(d3), v: condicao.fds_d3_veredicto, rain: condicao.fds_d3_rain, wind: condicao.fds_d3_wind },
  ]
  const hasFds    = fdsDias.some(d => d.v)
  const hasPrev24 = (condicao.previsao_24h?.length ?? 0) > 0
  const hasAlerta = !!(condicao.aderencia_futura_status && condicao.aderencia_futura_label &&
    condicao.aderencia_futura_status !== condicao.aderencia_status)

  // Alertas 24h
  const nivelVento   = condicao.alerta_vento_nivel ?? 0
  const temRajada    = condicao.gust_max_kmh != null && condicao.gust_max_kmh >= DISPLAY_THR.rajada.fechada
  const chuvasPrev   = condicao.previsao_24h?.filter(b => b.rain_mm > 1) ?? []
  const temChuva24h  = chuvasPrev.length > 0
  const hasAlertas   = nivelVento > 0 || temRajada || temChuva24h || hasAlerta

  const ventoTextos: Record<number, { titulo: string; msg: string; cor: string; border: string }> = {
    1: { titulo: 'Vento moderado a forte nas últimas 48h', cor: '#713f12', border: '#fde047',
         msg: 'Ventos entre 55–65 km/h podem quebrar galhos de árvores com saúde comprometida.' },
    2: { titulo: 'Ventos fortes nas últimas 48h', cor: '#7c2d12', border: '#fdba74',
         msg: 'Ventos entre 65–90 km/h podem derrubar árvores. Avalie as condições antes de pedalar.' },
    3: { titulo: 'Risco alto — vento de tempestade', cor: '#7f1d1d', border: '#fca5a5',
         msg: 'Ventos acima de 90 km/h com risco severo de obstrução. Avalie presencialmente.' },
  }
  const vCfg = nivelVento > 0 ? ventoTextos[Math.min(nivelVento, 3) as 1 | 2 | 3] : null

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 16, border: '0.5px solid #E5E7EB', overflow: 'hidden' }}>
      <style>{`@keyframes cc-pulse { 0%,100%{opacity:1} 50%{opacity:.25} }`}</style>

      {/* Card header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0, animation: 'cc-pulse 1.8s ease-in-out infinite' }} />
          <div>
            <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Condição do Solo</div>
            <div style={{ fontSize: 10, color: '#22C55E', fontWeight: 500 }}>Solo calculado agora</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Report: {horaReport}</div>
          <div style={{ fontSize: 10, color: '#9CA3AF' }}>{driftHoras}h atrás</div>
        </div>
      </div>

      <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── 1. Veredicto ─────────────────────────────────────────── */}
        <div>
          <div style={{ ...SEC, marginBottom: 8 }}>Veredicto</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: badge.bg, color: badge.color, fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 12px' }}>
                {veredictoDisplay}
              </span>
              {has12h && <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>12h</span>}
            </div>
            <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500 }}>{condicao.aderencia_status}</span>
          </div>

          {condicao.texto_dinamico && (
            <div style={{ background: '#F9FAFB', borderLeft: `3px solid ${borderColor}`, borderRadius: 8, padding: '10px 14px', marginBottom: condicao.frase_secagem ? 8 : 0, fontSize: 13, fontWeight: 500, color: '#111111' }}>
              {condicao.texto_dinamico}
            </div>
          )}
          {condicao.frase_secagem && (
            <p style={{ fontSize: 12, fontStyle: 'italic', color: '#555555', lineHeight: 1.75, margin: 0 }}>
              {condicao.frase_secagem}
            </p>
          )}
        </div>

        <div style={DIV} />

        {/* ── 2. Condição do Solo — Agora ──────────────────────────── */}
        <div>
          <div style={{ ...SEC, marginBottom: 10 }}>Condição do Solo — Agora</div>

          {/* Legenda */}
          <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#9CA3AF', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />Calculado agora
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />Report das {horaReport}
            </div>
          </div>

          {/* 3 badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F0FDF4', border: '0.5px solid #BBF7D0', borderRadius: 20, padding: '5px 12px' }}>
              <i className="ti ti-droplet" style={{ fontSize: 13, color: rainColor(acumuloAgora) }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: rainColor(acumuloAgora) }}>{acumuloAgora.toFixed(1)}mm</span>
              <span style={{ fontSize: 11, color: '#6B7280' }}>retidos</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F0FDF4', border: '0.5px solid #BBF7D0', borderRadius: 20, padding: '5px 12px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
              <i className="ti ti-clock" style={{ fontSize: 13, color: '#9CA3AF' }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>
                {trilhaSecaEmAgora === 0 ? 'Solo seco' : `seca em ~${trilhaSecaEmAgora}h`}
              </span>
            </div>

            {condicao.ultima_chuva_h != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F0FDF4', border: '0.5px solid #BBF7D0', borderRadius: 20, padding: '5px 12px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                <i className="ti ti-history" style={{ fontSize: 13, color: '#9CA3AF' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>última chuva {ultimaChuvaH}h atrás</span>
              </div>
            )}
          </div>

          {/* Barra Grip Perfeito */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>Caminho para Grip Perfeito</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: indicatorColor }}>
                {labelGrip}
                {temChuvaFutura && !isGripOk && <span style={{ color: '#F59E0B' }}> (chuva prevista)</span>}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, position: 'relative', background: 'linear-gradient(to right, #EF4444 0%, #F59E0B 50%, #22C55E 100%)' }}>
              <div style={{ position: 'absolute', left: `${progressoExibido}%`, top: -3, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF', border: `2px solid ${indicatorColor}`, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </div>
          </div>
        </div>

        {/* ── 3. Alertas — próximas 24h ────────────────────────────── */}
        {hasAlertas && (
          <>
            <div style={DIV} />
            <div>
              <div style={{ ...SEC, marginBottom: 10 }}>Alertas — próximas 24h</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Aderência futura */}
                {hasAlerta && (
                  <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
                      <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#F59E0B' }} />
                      Previsão {condicao.aderencia_futura_label}: {condicao.aderencia_futura_status}
                      {condicao.aderencia_futura_rain != null && condicao.aderencia_futura_rain > 0
                        ? ` (${condicao.aderencia_futura_rain.toFixed(1)}mm previstos)` : ''}
                    </div>
                    <span style={{ fontSize: 11, color: '#B45309', paddingLeft: 19 }}>Evite a trilha neste período.</span>
                  </div>
                )}

                {/* Vento histórico */}
                {vCfg && (
                  <div style={{ background: '#FEFCE8', borderLeft: `3px solid ${vCfg.border}`, borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, color: vCfg.cor, fontWeight: 600, marginBottom: 3 }}>
                      <i className="ti ti-wind" style={{ fontSize: 12, marginRight: 5 }} />
                      {vCfg.titulo}
                      {condicao.alerta_vento_kmh != null && ` · ${condicao.alerta_vento_kmh.toFixed(0)} km/h`}
                    </div>
                    <p style={{ fontSize: 11, color: vCfg.cor, margin: 0, opacity: 0.8, paddingLeft: 19 }}>{vCfg.msg}</p>
                  </div>
                )}

                {/* Rajada prevista */}
                {temRajada && condicao.gust_max_kmh != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#374151' }}>
                    <i className="ti ti-wind" style={{ fontSize: 14, color: windColor(condicao.gust_max_kmh) }} />
                    <span>Rajada prevista de até <b>{condicao.gust_max_kmh.toFixed(0)} km/h</b> nas próximas 24h</span>
                  </div>
                )}

                {/* Chuva prevista */}
                {temChuva24h && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#374151' }}>
                    <i className="ti ti-droplet" style={{ fontSize: 14, color: '#3B82F6' }} />
                    <span>
                      Chuva prevista: {chuvasPrev.map(b => `${b.rain_mm.toFixed(1)}mm (${b.label})`).join(', ')}
                    </span>
                  </div>
                )}

              </div>
            </div>
          </>
        )}

        <div style={DIV} />

        {/* ── 4. Previsão — próximas 24h ───────────────────────────── */}
        <div>
          <div style={{ ...SEC, marginBottom: 10 }}>Previsão — próximas 24h</div>

          {hasPrev24 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: condicao.horarios_chuva ? 8 : 0 }}>
              {condicao.previsao_24h!.map(b => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '5px 10px', borderRadius: 6, background: '#F9FAFB' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', minWidth: 70 }}>{b.label}</span>
                  <span style={{ color: b.rain_mm > 5 ? '#EF4444' : b.rain_mm > 1 ? '#F59E0B' : '#22C55E' }}>
                    <i className="ti ti-droplet" style={{ fontSize: 11 }} /> {b.rain_mm.toFixed(1)}mm
                  </span>
                  <span style={{ color: '#9CA3AF' }}>
                    <i className="ti ti-cloud" style={{ fontSize: 11 }} /> {b.pop_max}%
                  </span>
                  <span style={{ color: '#6B7280' }}>
                    <i className="ti ti-wind" style={{ fontSize: 11 }} /> {b.wind_max.toFixed(1)}m/s
                  </span>
                  <span style={{ color: '#9CA3AF', marginLeft: 'auto' }}>{b.temp_med}°C</span>
                </div>
              ))}
            </div>
          )}

          {condicao.horarios_chuva && (
            <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6 }}>
              <i className="ti ti-calendar" style={{ fontSize: 11, marginRight: 4 }} />
              {condicao.horarios_chuva}
            </div>
          )}

          {!hasPrev24 && !condicao.horarios_chuva && (
            <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: 0 }}>Sem dados de previsão disponíveis.</p>
          )}
        </div>

        {/* ── 5. Próximos 3 dias ───────────────────────────────────── */}
        {hasFds && (
          <>
            <div style={DIV} />
            <div>
              <div style={{ ...SEC, marginBottom: 10 }}>Próximos 3 dias</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {fdsDias.map(({ label, v, rain, wind }) => {
                  const vcfg = v ? (VEREDICTO_CONFIG[v] ?? null) : null
                  return (
                    <div key={label} style={{ background: vcfg ? vcfg.bg : '#F9FAFB', border: `0.5px solid ${vcfg ? vcfg.cor + '44' : '#E5E7EB'}`, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 18, marginBottom: 2 }}>{vcfg?.emoji ?? '—'}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: vcfg?.cor ?? '#9CA3AF', marginBottom: 4 }}>{v ?? 'SEM DADOS'}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>
                        {rain != null && `🌧 ${rain.toFixed(1)}mm`}
                        {rain != null && wind != null && ' · '}
                        {wind != null && `💨 ${wind.toFixed(1)}m/s`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <div style={DIV} />

        {/* ── 6. Melhor janela ─────────────────────────────────────── */}
        {condicao.janela ? (
          <div style={{ background: janela.bg, borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Melhor janela</span>
            <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-clock" style={{ fontSize: 13, color: janela.color }} />
              <span style={{ color: janela.color }}>{condicao.janela}</span>
            </div>
          </div>
        ) : (
          <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#9CA3AF' }} />
            <span style={{ color: '#9CA3AF' }}>Sem janela definida</span>
          </div>
        )}

      </div>
    </div>
  )
}
