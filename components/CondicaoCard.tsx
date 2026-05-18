import { Condicao, VEREDICTO_CONFIG } from '@/lib/types'

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
  const meiaVida   = condicao.meia_vida_h ?? 24
  const acumuloBase = condicao.acumulo_ef ?? 0

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
  const GRIP_THRESHOLD = 5.0
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
    trilhaSecaEmAgora: Math.max(0, Math.round((meiaVida - driftHoras) * 10) / 10),
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SEC: React.CSSProperties = {
  fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 500,
}

const ML: React.CSSProperties = {
  fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 3,
}

const DIV: React.CSSProperties = { borderTop: '0.5px solid #E5E7EB' }

// ── Sub-components ────────────────────────────────────────────────────────────

function LiveCell({ label, icon, value, color = '#111111', tooltip }: {
  label: string; icon: string; value: string; color?: string; tooltip?: string
}) {
  return (
    <div style={{ background: '#F0FDF4', border: '0.5px solid #BBF7D0', borderRadius: 10, padding: '8px 10px' }} title={tooltip}>
      <div style={ML}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 14 }} />{value}
      </div>
    </div>
  )
}

function ReportCell({ label, icon, value, color = '#111111', tooltip }: {
  label: string; icon: string; value: string; color?: string; tooltip?: string
}) {
  return (
    <div style={{ background: '#EFF6FF', border: '0.5px solid #BFDBFE', borderRadius: 10, padding: '8px 10px' }} title={tooltip}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ ...ML, marginBottom: 0 }}>{label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#3B82F6', background: '#DBEAFE', borderRadius: 3, padding: '1px 4px', textTransform: 'uppercase' }}>RPT</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color, display: 'flex', alignItems: 'center', gap: 4 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 14 }} />{value}
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
    const dias = Math.floor(h / 24); const hrs = Math.round(h % 24)
    return `~${dias}d ${hrs}h restantes`
  }

  const efetivoAgora = acumuloAgora + (condicao.pico_3h ?? 0)
  const labelGrip = progresso >= 100 || efetivoAgora <= 5
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

        {/* ── 1. Agora — próximas 12h ──────────────────────────────── */}
        <div>
          <div style={{ ...SEC, marginBottom: 8 }}>Agora — próximas 12h</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: condicao.texto_dinamico || condicao.frase_secagem ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: badge.bg, color: badge.color, fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 12px' }}>
                {veredictoDisplay}
              </span>
              {has12h && <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>12h</span>}
            </div>
            <span style={{ fontSize: 11, color: '#6B7280' }}>{condicao.aderencia_status}</span>
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

        {/* ── 2. Solo — calculado agora ────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={SEC}>Solo — calculado agora</span>
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>Report das {horaReport}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            <LiveCell label="Umidade retida" icon="ti-calculator" value={`${acumuloAgora.toFixed(1)}mm`} color={accumColor(acumuloAgora)} tooltip="Umidade retida recalculada com decaimento desde o report" />
            <LiveCell label="Trilha seca em" icon="ti-clock" value={`${trilhaSecaEmAgora}h`} color="#6B7280" tooltip="Tempo restante estimado para o solo atingir condição ideal" />
            {condicao.ultima_chuva_h != null && (
              <LiveCell label="Última chuva" icon="ti-history" value={`${ultimaChuvaH}h atrás`} color="#6B7280" tooltip="Horas desde a última precipitação, ajustado pelo tempo desde o report" />
            )}
            <ReportCell label="Chuva 48h" icon="ti-droplet" value={`${condicao.acumulo_48h.toFixed(1)}mm`} color={accumColor(condicao.acumulo_48h)} tooltip="Chuva acumulada histórica nas últimas 48h" />
            {showPico && <ReportCell label="Pico 3h" icon="ti-droplet-half" value={`${condicao.pico_3h.toFixed(1)}mm`} color={peakColor(condicao.pico_3h)} tooltip="Maior acumulado em janela de 3h na previsão" />}
            <ReportCell label="Vento máx." icon="ti-wind" value={`${windKmh.toFixed(1)} km/h`} color={windColor(windKmh)} tooltip="Vento máximo sustentado previsto nas próximas 48h" />
            {condicao.gust_max_kmh != null && (
              <ReportCell label="Rajada máx." icon="ti-wind" value={`${condicao.gust_max_kmh.toFixed(0)} km/h`} color={windColor(condicao.gust_max_kmh)} tooltip="Rajada máxima prevista nas próximas 48h" />
            )}
            {showInc && (
              <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '8px 10px' }}>
                <div style={ML}>Inclinação</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-trending-up" style={{ fontSize: 14 }} />{condicao.inclinacao}%
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#9CA3AF', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />Calculado agora
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6' }} />Report das {horaReport}
            </div>
          </div>

          {/* Barra gradiente */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF', cursor: 'default' }} title="Estimativa recalculada com decaimento desde o report, pico de chuva e secagem do solo.">
                Caminho para Grip Perfeito
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: indicatorColor }}>
                {labelGrip}
                {temChuvaFutura && progresso < 100 && <span style={{ color: '#F59E0B' }}> (chuva prevista)</span>}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, position: 'relative', background: 'linear-gradient(to right, #EF4444 0%, #F59E0B 50%, #22C55E 100%)' }}>
              <div style={{ position: 'absolute', left: `${progresso}%`, top: -3, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF', border: `2px solid ${indicatorColor}`, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
            </div>
          </div>
        </div>

        <div style={DIV} />

        {/* ── 3. Previsão — próximas 24h ───────────────────────────── */}
        <div>
          <div style={{ ...SEC, marginBottom: 10 }}>Previsão — próximas 24h</div>

          {hasAlerta && (
            <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400E' }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#F59E0B' }} />
                <span>
                  Previsão {condicao.aderencia_futura_label}: {condicao.aderencia_futura_status}
                  {condicao.aderencia_futura_rain != null && condicao.aderencia_futura_rain > 0
                    ? ` (${condicao.aderencia_futura_rain.toFixed(1)}mm previstos)` : ''}
                </span>
              </div>
              <span style={{ fontSize: 11, color: '#B45309', paddingLeft: 19 }}>Evite a trilha neste período.</span>
            </div>
          )}

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

          {!hasAlerta && !hasPrev24 && !condicao.horarios_chuva && (
            <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: 0 }}>Sem dados de previsão disponíveis.</p>
          )}
        </div>

        {/* ── 4. Próximos 3 dias ───────────────────────────────────── */}
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

        {/* ── 5. Melhor janela ─────────────────────────────────────── */}
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
