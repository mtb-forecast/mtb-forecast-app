'use client'

import { memo, useMemo, useState, useEffect } from 'react'
import {
  IconAlertTriangle, IconWind, IconDroplet, IconInfoCircle,
  IconCloud, IconCalendar, IconChevronDown,
} from '@tabler/icons-react'
import { Condicao, VEREDICTO_CONFIG } from '@/lib/types'
import { rainColor, windColor, DISPLAY_THR, emojiTempo } from '@/lib/display'
import DiaDetalheModal from '@/components/DiaDetalheModal'

type Props = {
  condicao: Condicao
  lat?: number
  lon?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function verdictBadge(v: string): { bg: string; color: string } {
  if (v.trim() === 'DROP LIBERADO') return { bg: '#DCFCE7', color: '#15803D' }
  if (v.includes('MELHOR ESPERAR')) return { bg: '#FEE2E2', color: '#B91C1C' }
  return { bg: '#FEF9C3', color: '#A16207' }
}


function verdictBorderColor(v: string): string {
  if (v.trim() === 'DROP LIBERADO') return '#22C55E'
  if (v.includes('MELHOR ESPERAR')) return '#EF4444'
  return '#F59E0B'
}

function aderenciaBadge(a: string): { bg: string; color: string } {
  if (a === 'SECO')                  return { bg: '#FEF9C3', color: '#A16207' }   // amarelo
  if (a === 'GRIP PERFEITO')         return { bg: '#DCFCE7', color: '#15803D' }   // verde
  if (a === 'BOA ADERÊNCIA - ÚMIDO') return { bg: '#F7FEE7', color: '#4D7C0F' }   // lima
  if (a === 'BAIXA ADERÊNCIA')       return { bg: '#FEE2E2', color: '#B91C1C' }   // vermelho
  return { bg: '#F9FAFB', color: '#9CA3AF' }
}

function recalcularSolo(condicao: Condicao) {
  const agora    = new Date()
  const geradoEm = new Date(condicao.gerado_em)
  if (isNaN(geradoEm.getTime())) {
    return { driftHoras: 0, acumuloAgora: 0, ultimaChuvaH: condicao.ultima_chuva_h ?? 0, horasParaGrip: 0, temChuvaFutura: false, trilhaSecaEmAgora: 0 }
  }
  const driftHoras  = (agora.getTime() - geradoEm.getTime()) / 3600000
  const meiaVida    = condicao.meia_vida_h ?? 24
  const acumuloBase = condicao.acumulo_ef ?? 0
  const GRIP_THRESHOLD = condicao.grip_threshold_ef ?? 3.0

  const acumuloAgora = acumuloBase * Math.pow(0.5, driftHoras / meiaVida)
  const trilhaSecaEmAgora = acumuloAgora > GRIP_THRESHOLD
    ? Math.max(0, Math.round(meiaVida * Math.log2(acumuloAgora / GRIP_THRESHOLD) * 10) / 10)
    : 0

  // Option C: step through future blocks sequentially to find last rainy block peak
  let lastRainEndH: number | null = null
  let peakAtLastRainEnd = 0
  let prevH   = 0
  let prevAcc = acumuloAgora

  for (const bloco of (condicao.previsao_24h ?? [])) {
    const horaInicio = parseInt(bloco.label.split('h')[0])
    const horaBloco  = new Date(geradoEm)
    horaBloco.setHours(horaInicio, 0, 0, 0)
    if (horaBloco <= agora) continue

    const h        = (horaBloco.getTime() - agora.getTime()) / 3600000
    const accStart = prevAcc * Math.pow(0.5, (h - prevH) / meiaVida)
    const accAfter = accStart + bloco.rain_mm

    if (bloco.rain_mm > 0.5) {
      lastRainEndH      = h + 6
      peakAtLastRainEnd = accAfter * Math.pow(0.5, 6 / meiaVida)
    }

    prevH   = h
    prevAcc = accAfter
  }

  const temChuvaFutura = lastRainEndH !== null && peakAtLastRainEnd > GRIP_THRESHOLD
  const horasParaGrip  = temChuvaFutura
    ? Math.round(meiaVida * Math.log2(peakAtLastRainEnd / GRIP_THRESHOLD) * 10) / 10
    : trilhaSecaEmAgora

  return {
    driftHoras:       Math.round(driftHoras * 10) / 10,
    acumuloAgora:     Math.round(acumuloAgora * 10) / 10,
    ultimaChuvaH:     Math.round(((condicao.ultima_chuva_h ?? 0) + driftHoras) * 10) / 10,
    horasParaGrip,
    temChuvaFutura,
    trilhaSecaEmAgora,
  }
}

function barZone(aderencia: string): number {
  if (aderencia === 'SECO')                  return 100
  if (aderencia === 'GRIP PERFEITO')         return 80
  if (aderencia === 'BOA ADERÊNCIA - ÚMIDO') return 62
  if (aderencia === 'BAIXA ADERÊNCIA')       return 15
  return 0
}

function zoneColor(zone: number): string {
  if (zone >= 100) return '#A16207'  // amarelo — SECO
  if (zone >= 80)  return '#15803D'  // verde   — GRIP PERFEITO
  if (zone >= 62)  return '#4D7C0F'  // lima    — BOA ADERÊNCIA - ÚMIDO
  if (zone >= 15)  return '#C2410C'  // laranja — reserva / sem uso
  return '#B91C1C'                   // vermelho — BAIXA ADERÊNCIA
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SEC: React.CSSProperties = {
  fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 500,
}

const DIV: React.CSSProperties = { borderTop: '0.5px solid #E5E7EB' }

// ── Solar Arc ─────────────────────────────────────────────────────────────────

// Fase da lua calculada localmente — sem API, sempre disponível.
// Retorna 0–1: 0 = lua nova, 0.5 = lua cheia.
function calcMoonPhase(date: Date): number {
  const known = new Date(2000, 0, 6, 18, 14, 0) // lua nova conhecida: 6 jan 2000
  const synodic = 29.530588853                   // mês sinódico em dias
  const diff = (date.getTime() - known.getTime()) / 86400000
  return (((diff % synodic) + synodic) % synodic) / synodic
}

const STAR_POS = [
  { x: 30,  y: 11, r: 0.9, o: 0.9 }, { x: 72,  y: 6,  r: 1.2, o: 1.0 },
  { x: 118, y: 14, r: 0.7, o: 0.8 }, { x: 176, y: 5,  r: 1.1, o: 0.9 },
  { x: 220, y: 17, r: 0.8, o: 1.0 }, { x: 265, y: 9,  r: 1.3, o: 0.9 },
  { x: 50,  y: 30, r: 0.7, o: 0.7 }, { x: 138, y: 23, r: 0.9, o: 0.8 },
  { x: 198, y: 31, r: 0.8, o: 0.9 }, { x: 88,  y: 36, r: 1.0, o: 1.0 },
  { x: 252, y: 38, r: 0.7, o: 0.7 }, { x: 295, y: 24, r: 0.9, o: 0.8 },
  { x: 166, y: 42, r: 0.8, o: 0.9 }, { x: 308, y: 14, r: 1.1, o: 1.0 },
  { x: 22,  y: 44, r: 0.7, o: 0.7 },
]

const CLOUD_POS = [
  { x: 60,  y: 20, s: 0.85 },
  { x: 205, y: 14, s: 1.1  },
  { x: 268, y: 29, s: 0.75 },
  { x: 128, y: 34, s: 0.95 },
]

function moonPhaseInfo(p: number) {
  if (p < 0.063 || p >= 0.938) return { emoji: '🌑', name: 'Lua Nova' }
  if (p < 0.188) return { emoji: '🌒', name: 'Crescente' }
  if (p < 0.313) return { emoji: '🌓', name: 'Quarto Crescente' }
  if (p < 0.438) return { emoji: '🌔', name: 'Gibosa Crescente' }
  if (p < 0.563) return { emoji: '🌕', name: 'Lua Cheia' }
  if (p < 0.688) return { emoji: '🌖', name: 'Gibosa Minguante' }
  if (p < 0.813) return { emoji: '🌗', name: 'Quarto Minguante' }
  return { emoji: '🌘', name: 'Minguante' }
}

function SolarArc({ sunrise, sunset, cloudCover, isRaining, moonPhase }: {
  sunrise: string; sunset: string
  cloudCover: number; isRaining: boolean; moonPhase: number
}) {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const now    = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const srMin  = toMin(sunrise), ssMin = toMin(sunset)
  const totalMin = ssMin - srMin
  const progress  = totalMin > 0 ? Math.min(1, Math.max(0, (nowMin - srMin) / totalMin)) : 0
  const isDaytime = nowMin > srMin && nowMin < ssMin
  const dh = Math.floor(totalMin / 60), dm = totalMin % 60

  const cx = 160, cy = 62, rx = 140, ry = 46
  const arcLen = Math.PI * Math.sqrt((rx * rx + ry * ry) / 2)
  const sunX = cx - rx * Math.cos(progress * Math.PI)
  const sunY = cy - ry * Math.sin(progress * Math.PI)

  const isFoggy = false // sem weather_code disponível; placeholder

  // Sky theme
  type Theme = { bg: string; txt: string; sub: string; arc: string; hor: string }
  const sky: Theme = (() => {
    if (!isDaytime) {
      if (cloudCover < 25) return { bg:'linear-gradient(180deg,#060d1f 0%,#0f1f3d 55%,#1a2f4e 100%)', txt:'#E2E8F0', sub:'#94A3B8', arc:'rgba(148,163,184,0.25)', hor:'rgba(148,163,184,0.2)' }
      if (cloudCover < 65) return { bg:'linear-gradient(180deg,#111827 0%,#1f2937 55%,#27334a 100%)', txt:'#D1D5DB', sub:'#6B7280', arc:'rgba(107,114,128,0.35)', hor:'rgba(107,114,128,0.25)' }
      return              { bg:'linear-gradient(180deg,#1a1d24 0%,#23272f 55%,#2d323c 100%)', txt:'#CBD5E1', sub:'#6B7280', arc:'rgba(107,114,128,0.3)', hor:'rgba(107,114,128,0.2)' }
    }
    if (isRaining) return { bg:'linear-gradient(180deg,#2d3748 0%,#4a5568 45%,#718096 100%)', txt:'#F3F4F6', sub:'#D1D5DB', arc:'rgba(209,213,219,0.4)', hor:'rgba(209,213,219,0.35)' }
    if (isFoggy)   return { bg:'linear-gradient(180deg,#9CA3AF 0%,#D1D5DB 50%,#E5E7EB 100%)', txt:'#374151', sub:'#6B7280', arc:'rgba(107,114,128,0.4)', hor:'rgba(107,114,128,0.3)' }
    if (cloudCover < 20)  return { bg:'linear-gradient(180deg,#1D4ED8 0%,#3B82F6 35%,#60A5FA 65%,#BAE6FD 100%)', txt:'#fff', sub:'rgba(255,255,255,0.8)', arc:'rgba(255,255,255,0.45)', hor:'rgba(255,255,255,0.4)' }
    if (cloudCover < 50)  return { bg:'linear-gradient(180deg,#2563EB 0%,#60A5FA 40%,#93C5FD 70%,#DBEAFE 100%)', txt:'#fff', sub:'rgba(255,255,255,0.75)', arc:'rgba(255,255,255,0.4)', hor:'rgba(255,255,255,0.35)' }
    if (cloudCover < 80)  return { bg:'linear-gradient(180deg,#6B7280 0%,#9CA3AF 45%,#CBD5E1 100%)', txt:'#1F2937', sub:'#374151', arc:'rgba(31,41,55,0.3)', hor:'rgba(31,41,55,0.2)' }
    return                { bg:'linear-gradient(180deg,#374151 0%,#4B5563 45%,#9CA3AF 100%)', txt:'#F3F4F6', sub:'#D1D5DB', arc:'rgba(209,213,219,0.4)', hor:'rgba(209,213,219,0.35)' }
  })()

  // Stars: only at night, fewer as clouds increase
  const starCount = !isDaytime && cloudCover < 65
    ? Math.floor(STAR_POS.length * (1 - Math.max(0, cloudCover - 20) / 60))
    : 0

  // Clouds: only daytime, count proportional to cloudCover
  const cloudCount    = isDaytime ? Math.min(CLOUD_POS.length, Math.round(cloudCover / 25)) : 0
  const cloudOpacity  = Math.min(0.88, 0.3 + cloudCover / 120)

  // Moon position: right side of arc (70% progress)
  const moonX = cx - rx * Math.cos(0.72 * Math.PI)
  const moonY = cy - ry * Math.sin(0.72 * Math.PI) - 6

  // Moon SVG shape based on phase
  const MoonShape = () => {
    const r = 9
    const ill = moonPhase <= 0.5 ? moonPhase * 2 : (1 - moonPhase) * 2
    const isWaxing = moonPhase < 0.5
    if (ill < 0.08) return <circle cx={moonX} cy={moonY} r={r} fill="#0f1f3d" stroke="#1e3a5f" strokeWidth="0.8" />
    if (ill > 0.92) return (
      <g>
        <circle cx={moonX} cy={moonY} r={r} fill="#F1F5F9" opacity={0.95} />
        <circle cx={moonX} cy={moonY} r={r - 0.5} fill="none" stroke="#CBD5E1" strokeWidth="0.3" opacity={0.5} />
      </g>
    )
    const offset = r * (1 - ill * 2) * (isWaxing ? 1 : -1)
    const shadowFill = isDaytime ? '#60A5FA' : '#060d1f'
    return (
      <g>
        <circle cx={moonX} cy={moonY} r={r} fill="#F1F5F9" opacity={0.9} />
        <circle cx={moonX + offset} cy={moonY} r={r * 0.98} fill={shadowFill} opacity={0.95} />
      </g>
    )
  }

  const moon = moonPhaseInfo(moonPhase)

  return (
    <div style={{ maxWidth: 340, margin: '0 auto', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: sky.bg }}>

        {/* SVG sky scene */}
        <svg viewBox="0 0 320 92" style={{ width: '100%', height: 'auto', display: 'block' }}>

          {/* Stars — clear nights */}
          {STAR_POS.slice(0, starCount).map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.o * 0.85} />
          ))}

          {/* Clouds — daytime */}
          {CLOUD_POS.slice(0, cloudCount).map((c, i) => (
            <g key={i} transform={`translate(${c.x},${c.y}) scale(${c.s})`} opacity={cloudOpacity} fill="white">
              <ellipse cx={0}   cy={0}  rx={22} ry={9} />
              <ellipse cx={-13} cy={3}  rx={14} ry={7} />
              <ellipse cx={14}  cy={2}  rx={16} ry={8} />
            </g>
          ))}

          {/* Rain drops */}
          {isRaining && [40,68,96,130,168,206,240,274].map((bx, i) => (
            <line key={i}
              x1={bx} y1={16 + (i % 3) * 6} x2={bx - 5} y2={30 + (i % 3) * 6}
              stroke="rgba(147,197,253,0.55)" strokeWidth="1.5" strokeLinecap="round"
            />
          ))}

          {/* Arc track */}
          <path d={`M ${cx-rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx+rx} ${cy}`}
            fill="none" stroke={sky.arc} strokeWidth="1.5" strokeDasharray="3 4" />

          {/* Elapsed arc */}
          {progress > 0.01 && (
            <path d={`M ${cx-rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx+rx} ${cy}`}
              fill="none"
              stroke={isDaytime ? '#FCD34D' : '#94A3B8'}
              strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={`${progress * arcLen} ${arcLen}`}
            />
          )}

          {/* Moon at night */}
          {!isDaytime && <MoonShape />}

          {/* Sun (daytime only) */}
          {isDaytime && (
            <>
              <circle cx={sunX} cy={sunY} r={18} fill={cloudCover < 50 ? '#FEF3C7' : '#E5E7EB'} opacity={0.28} />
              <circle cx={sunX} cy={sunY} r={11} fill={cloudCover < 50 ? '#FDE68A' : '#D1D5DB'} opacity={0.62} />
              <circle cx={sunX} cy={sunY} r={6}  fill={cloudCover < 50 ? '#FCD34D' : '#9CA3AF'} />
              <circle cx={sunX} cy={sunY} r={3}  fill={cloudCover < 50 ? '#F59E0B' : '#6B7280'} />
            </>
          )}

          {/* Horizon */}
          <line x1={cx-rx-6} y1={cy} x2={cx+rx+6} y2={cy} stroke={sky.hor} strokeWidth="1" />
        </svg>

        {/* Info row: nascer · duração+lua · pôr */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'2px 16px 10px' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:sky.txt }}>{sunrise}</div>
            <div style={{ fontSize:9, color:sky.sub }}>nascer</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:10, color:sky.sub }}>
              {`${dh}h${dm > 0 ? String(dm).padStart(2,'0')+'m' : ''} de luz`}
            </div>
            <div style={{ fontSize:12, color:sky.sub, marginTop:3 }}>
              {moon.emoji} <span style={{ fontSize:10 }}>{moon.name}</span>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:13, fontWeight:700, color:sky.txt }}>{sunset}</div>
            <div style={{ fontSize:9, color:sky.sub }}>pôr do sol</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

function CondicaoCard({ condicao, lat, lon }: Props) {
  // ── Estado do modal e dados solares ──────────────────────────────────────
  type SelectedDay = {
    date: Date
    label: string
    rain: number | null
    wind: number | null
    tmax: number | null
    tmin: number | null
  }
  const [selectedDay, setSelectedDay] = useState<SelectedDay | null>(null)
  const [solar, setSolar] = useState<{
    sunrise: string; sunset: string; moonPhase: number
  } | null>(null)

  useEffect(() => {
    if (!lat || !lon) return
    const ctrl = new AbortController()
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=America%2FSao_Paulo&forecast_days=1`,
      { signal: ctrl.signal }
    )
      .then(r => r.json())
      .then(data => {
        const sr = (data.daily?.sunrise?.[0] as string | undefined)?.split('T')[1]?.slice(0, 5)
        const ss = (data.daily?.sunset?.[0] as string | undefined)?.split('T')[1]?.slice(0, 5)
        if (sr && ss) setSolar({ sunrise: sr, sunset: ss, moonPhase: calcMoonPhase(new Date()) })
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [lat, lon])

  const veredictoDisplay = condicao.veredicto_12h?.trim() || condicao.veredicto
  const has12h      = !!condicao.veredicto_12h?.trim()
  const badge       = verdictBadge(veredictoDisplay)
  const borderColor = verdictBorderColor(veredictoDisplay)

  const solo = useMemo(() => recalcularSolo(condicao), [condicao])
  const { driftHoras, acumuloAgora, ultimaChuvaH,
          horasParaGrip, temChuvaFutura, trilhaSecaEmAgora } = solo

  const aderenciaStr = condicao.aderencia_status?.trim() ?? ''
  const isGripOk     = aderenciaStr === 'GRIP PERFEITO' || aderenciaStr === 'SECO' || aderenciaStr === 'BOA ADERÊNCIA - ÚMIDO'

  const zone             = barZone(aderenciaStr)
  const progressoExibido = zone
  const indicatorColor   = zoneColor(zone)
  const horaReport = new Date(condicao.gerado_em).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  })

  function fmtH(h: number): string {
    if (h < 24) return `~${Math.round(h)}h restantes`
    const dias = Math.floor(h / 24); const hrs = Math.round(h % 24)
    return `~${dias}d ${hrs}h restantes`
  }

  function fmtHAposChuva(h: number): string {
    if (h < 24) return `~${Math.round(h)}h após chuva`
    const dias = Math.floor(h / 24); const hrs = Math.round(h % 24)
    return hrs > 0 ? `~${dias}d ${hrs}h após chuva` : `~${dias}d após chuva`
  }

  function fmtUltimaChuva(h: number): string {
    const hrs = Math.round(h)
    if (h < 24) return `${hrs}h atrás`
    const dias = Math.floor(h / 24)
    const resto = Math.round(h % 24)
    return `${hrs}h atrás · ${dias}d${resto > 0 ? ` ${resto}h` : ''}`
  }

  const labelGrip = zone >= 100 ? 'Solo Seco ✓'
    : zone >= 80  ? 'Grip Perfeito ✓'
    : zone >= 62  ? 'Solo úmido'
    : zone === 0  ? 'Sem aderência'
    : zone <= 15  ? (horasParaGrip > 0 ? fmtH(horasParaGrip) : 'Baixa aderência')
    : temChuvaFutura && horasParaGrip > 0 ? fmtHAposChuva(horasParaGrip)
    : horasParaGrip > 0 ? fmtH(horasParaGrip)
    : zone >= 45  ? 'Boa Aderência ✓'
    : 'Monitorar chuva'

  // Badge do estado do solo — Python é a fonte de verdade; drift calcula o tempo restante
  // Retorna null quando o solo já está em boas condições (GRIP PERFEITO) — badge desnecessário
  const badgeSolo = (() => {
    if (temChuvaFutura) return fmtHAposChuva(horasParaGrip)
    const futPior = !!(
      condicao.aderencia_futura_status &&
      condicao.aderencia_futura_label &&
      condicao.aderencia_futura_status !== condicao.aderencia_status
    )
    if (futPior && isGripOk) return `piora ${condicao.aderencia_futura_label}`
    if (trilhaSecaEmAgora > 0) return `seca em ~${trilhaSecaEmAgora}h`
    if (aderenciaStr === 'SECO' || acumuloAgora < 0.3) return 'Solo seco'
    if (aderenciaStr === 'BOA ADERÊNCIA - ÚMIDO') return 'Solo úmido'
    return null
  })()

  // Próximos 3 dias
  const hoje = new Date()
  const fmtDia = (d: Date) => {
    const ns = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${ns[d.getDay()]}`
  }
  const d1 = new Date(hoje); d1.setDate(hoje.getDate() + 1)
  const d2 = new Date(hoje); d2.setDate(hoje.getDate() + 2)
  const d3 = new Date(hoje); d3.setDate(hoje.getDate() + 3)
  const emojiTempo = (rain: number | null | undefined, pop: number | null | undefined): string => {
    const r = rain ?? 0
    const p = pop ?? 0
    if (r >= 10 || (r >= 5 && p >= 70)) return '⛈'
    if (r >= 2  || p >= 60)             return '🌧'
    if (r >= 0.5 || p >= 35)            return '🌦'
    if (p < 20)                         return '☀️'
    return '🌤'
  }
  const fdsDias = [
    { label: fmtDia(d1), v: condicao.fds_d1_veredicto, rain: condicao.fds_d1_rain, wind: condicao.fds_d1_wind, pop: condicao.fds_d1_pop, tmax: condicao.fds_d1_temp, tmin: condicao.fds_d1_temp_min },
    { label: fmtDia(d2), v: condicao.fds_d2_veredicto, rain: condicao.fds_d2_rain, wind: condicao.fds_d2_wind, pop: condicao.fds_d2_pop, tmax: condicao.fds_d2_temp, tmin: condicao.fds_d2_temp_min },
    { label: fmtDia(d3), v: condicao.fds_d3_veredicto, rain: condicao.fds_d3_rain, wind: condicao.fds_d3_wind, pop: condicao.fds_d3_pop, tmax: condicao.fds_d3_temp, tmin: condicao.fds_d3_temp_min },
  ]
  const hasFds    = fdsDias.some(d => d.v)
  const hasPrev24 = (condicao.previsao_24h?.length ?? 0) > 0
  const hasAlerta = !!(condicao.aderencia_futura_status && condicao.aderencia_futura_label &&
    condicao.aderencia_futura_status !== condicao.aderencia_status)

  // Alertas 24h
  const isAlertaVeredicto = veredictoDisplay.toUpperCase().includes('ALERTA')
  const nivelVento   = condicao.alerta_vento_nivel ?? 0
  const temRajada    = condicao.gust_max_kmh != null && condicao.gust_max_kmh >= DISPLAY_THR.rajada.fechada
  const chuvasPrev   = condicao.previsao_24h?.filter(b => b.rain_mm > 1) ?? []
  const temChuva24h  = chuvasPrev.length > 0
  const hasAlertas   = nivelVento > 0 || temRajada || temChuva24h || hasAlerta || isAlertaVeredicto

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
    <>
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
          <div style={{ fontSize: 10, color: '#9CA3AF' }} className="font-mono">{driftHoras}h atrás</div>
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
            {aderenciaStr && (() => {
              const ab = aderenciaBadge(aderenciaStr)
              return (
                <span style={{ background: ab.bg, color: ab.color, fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '4px 12px' }}>
                  {condicao.aderencia_status}
                </span>
              )
            })()}
          </div>

          {(() => {
            const st = condicao.aderencia_status?.trim()
            return condicao.frase_secagem &&
              st !== 'GRIP PERFEITO' && st !== 'SECO' && st !== 'BOA ADERÊNCIA - ÚMIDO' && (
              <p style={{ fontSize: 12, fontStyle: 'italic', color: '#555555', lineHeight: 1.75, margin: 0 }}>
                {condicao.frase_secagem}
              </p>
            )
          })()}
        </div>

        <div style={DIV} />

        {/* ── 2. Solo ──────────────────────────────────────────────── */}
        <div>
          {/* métrica de última chuva */}
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 20, rowGap: 6, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6B7280' }}>
              Última chuva{' '}
              <span style={{ fontWeight: 600, color: '#374151' }} className="font-mono">
                = {condicao.ultima_chuva_h != null ? fmtUltimaChuva(ultimaChuvaH) : '—'}
              </span>
            </div>
          </div>

          {condicao.texto_dinamico && (
            <div style={{ background: '#F9FAFB', borderLeft: `3px solid ${borderColor}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#111111', marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                Análise do report · {horaReport}
              </div>
              {condicao.texto_dinamico}
            </div>
          )}

          {/* Barra Grip Perfeito */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>Estado do Solo</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: indicatorColor }} className="font-mono">
                {labelGrip}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, position: 'relative', background: 'linear-gradient(to right, #EF4444 0%, #F97316 15%, #F59E0B 45%, #84CC16 62%, #22C55E 80%, #EAB308 100%)' }}>
              <div style={{ position: 'absolute', left: `${progressoExibido}%`, top: -3, transform: 'translateX(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF', border: `2px solid ${indicatorColor}`, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.6s ease' }} />
            </div>
          </div>
        </div>

        {/* ── 3. Alertas — próximas 24h ────────────────────────────── */}
        {hasAlertas && (
          <>
            <div style={DIV} />
            <div>
              <div style={{ ...SEC, marginBottom: 10 }}>Alertas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Aderência futura */}
                {hasAlerta && (
                  <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', borderRadius: 8, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
                      <IconAlertTriangle size={13} style={{ color: '#F59E0B' }} />
                      Previsão {condicao.aderencia_futura_label}: {condicao.aderencia_futura_status}
                      {condicao.aderencia_futura_rain != null && condicao.aderencia_futura_rain > 0
                        ? <span className="font-mono"> ({condicao.aderencia_futura_rain.toFixed(1)}mm previstos)</span> : null}
                    </div>
                    <span style={{ fontSize: 11, color: '#B45309', paddingLeft: 19 }}>Evite a trilha neste período.</span>
                  </div>
                )}

                {/* Vento histórico */}
                {vCfg && (
                  <div style={{ background: '#FEFCE8', borderLeft: `3px solid ${vCfg.border}`, borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, color: vCfg.cor, fontWeight: 600, marginBottom: 3 }}>
                      <IconWind size={12} style={{ marginRight: 5 }} />
                      {vCfg.titulo}
                      {condicao.alerta_vento_kmh != null && <span className="font-mono"> · {condicao.alerta_vento_kmh.toFixed(0)} km/h</span>}
                    </div>
                    <p style={{ fontSize: 11, color: vCfg.cor, margin: 0, opacity: 0.8, paddingLeft: 19 }}>{vCfg.msg}</p>
                  </div>
                )}

                {/* Rajada prevista */}
                {temRajada && condicao.gust_max_kmh != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#374151' }}>
                    <IconWind size={14} style={{ color: windColor(condicao.gust_max_kmh) }} />
                    <span>Rajada prevista de até <b className="font-mono">{condicao.gust_max_kmh.toFixed(0)} km/h</b> nas próximas 24h</span>
                  </div>
                )}

                {/* Chuva prevista */}
                {temChuva24h && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#374151' }}>
                    <IconDroplet size={14} style={{ color: '#3B82F6' }} />
                    <span className="font-mono">
                      Chuva prevista: {chuvasPrev.map(b => `${b.rain_mm.toFixed(1)}mm (${b.label})`).join(', ')}
                    </span>
                  </div>
                )}

                {/* Fallback: motivo do veredicto quando nenhum alerta específico foi disparado */}
                {isAlertaVeredicto && !hasAlerta && !vCfg && !temRajada && !temChuva24h && condicao.motivo_veredicto && (
                  <div style={{ background: '#FFFBEB', borderLeft: '3px solid #F59E0B', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#92400E', fontWeight: 600, marginBottom: 4 }}>
                      <IconInfoCircle size={13} style={{ color: '#F59E0B' }} />
                      Fatores de atenção
                    </div>
                    <span style={{ fontSize: 11, color: '#B45309', paddingLeft: 19, display: 'block' }}>
                      {condicao.motivo_veredicto}
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
                  <span style={{ color: b.rain_mm > 5 ? '#EF4444' : b.rain_mm > 1 ? '#F59E0B' : '#22C55E' }} className="font-mono">
                    <IconDroplet size={11} /> {b.rain_mm.toFixed(1)}mm
                  </span>
                  <span style={{ color: '#9CA3AF' }} className="font-mono">
                    <IconCloud size={11} /> {b.pop_max}%
                  </span>
                  <span style={{ color: '#6B7280' }} className="font-mono">
                    <IconWind size={11} /> {b.wind_max.toFixed(1)}m/s
                  </span>
                  <span style={{ color: '#9CA3AF', marginLeft: 'auto' }} className="font-mono">{b.temp_med}°C</span>
                </div>
              ))}
            </div>
          )}

          {condicao.horarios_chuva && (
            <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.6 }}>
              <IconCalendar size={11} style={{ marginRight: 4 }} />
              {condicao.horarios_chuva}
            </div>
          )}

          {!hasPrev24 && !condicao.horarios_chuva && (
            <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', margin: 0 }}>Sem dados de previsão disponíveis.</p>
          )}
        </div>

        {/* ── 5. Nascer e Pôr do Sol ──────────────────────────────── */}
        {solar && (
          <>
            <div style={DIV} />
            <div>
              <div style={{ ...SEC, marginBottom: 8 }}>Luz do dia — Hoje</div>
              <SolarArc
                sunrise={solar.sunrise}
                sunset={solar.sunset}
                cloudCover={condicao.cloud_pct ?? 30}
                isRaining={(condicao.acumulo_48h ?? 0) > 0.5}
                moonPhase={solar.moonPhase}
              />
            </div>
          </>
        )}

        {/* ── 6. Próximos 3 dias ───────────────────────────────────── */}
        {hasFds && (
          <>
            <div style={DIV} />
            <div>
              <div style={{ ...SEC, marginBottom: 10 }}>
                Próximos 3 dias
                {lat && lon && (
                  <span style={{ fontSize: 9, color: '#6B7280', fontWeight: 400, marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
                    toque para ver hora a hora
                  </span>
                )}
              </div>
              <div className="fds-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {fdsDias.map(({ label, v, rain, wind, pop, tmax, tmin }, idx) => {
                  const vcfg       = v ? (VEREDICTO_CONFIG[v] ?? null) : null
                  const diaDate    = [d1, d2, d3][idx]
                  const clickable  = !!(lat && lon)

                  return (
                    <div
                      key={label}
                      onClick={clickable ? () => setSelectedDay({ date: diaDate, label, rain: rain ?? null, wind: wind ?? null, tmax: tmax ?? null, tmin: tmin ?? null }) : undefined}
                      style={{
                        background: vcfg ? vcfg.bg : '#F9FAFB',
                        border: `0.5px solid ${vcfg ? vcfg.cor + '44' : '#E5E7EB'}`,
                        borderRadius: 8, padding: '10px 8px', textAlign: 'center',
                        cursor: clickable ? 'pointer' : 'default',
                        transition: 'transform 0.1s, box-shadow 0.1s',
                        position: 'relative',
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, marginBottom: 2 }}>{emojiTempo(rain, pop)}</div>
                      {(tmax != null || tmin != null) && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3 }} className="font-mono">
                          {tmax != null ? `${tmax}°` : '—'}<span style={{ color: '#9CA3AF', fontWeight: 400 }}> / {tmin != null ? `${tmin}°` : '—'}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 10, fontWeight: 600, color: vcfg?.cor ?? '#9CA3AF', marginBottom: 4 }}>{vcfg?.emoji ?? ''} {v ?? 'SEM DADOS'}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }} className="font-mono">
                        {rain != null && `🌧 ${rain.toFixed(1)}mm`}
                        {pop != null && ` (${pop}%)`}
                        {wind != null && ` · 💨 ${wind.toFixed(1)}m/s`}
                      </div>
                      {clickable && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                          <IconChevronDown size={12} style={{ color: '#9CA3AF' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

      </div>
    </div>

    {/* ── Modal hora a hora ─────────────────────────────────────────── */}
    {selectedDay && lat && lon && (
      <DiaDetalheModal
        lat={lat}
        lon={lon}
        diaDate={selectedDay.date}
        summaryRain={selectedDay.rain}
        summaryTmax={selectedDay.tmax}
        summaryTmin={selectedDay.tmin}
        summaryWind={selectedDay.wind}
        onClose={() => setSelectedDay(null)}
      />
    )}
    </>
  )
}

export default memo(CondicaoCard)
