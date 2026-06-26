'use client'

import { memo, useMemo, useState, useEffect } from 'react'
import {
  IconAlertTriangle, IconWind, IconDroplet, IconInfoCircle,
  IconCloud, IconCalendar, IconChevronDown,
  IconSun, IconCloudRain, IconCloudStorm, IconCircleCheck, IconClockPause, IconUmbrella,
} from '@tabler/icons-react'
import { Condicao, VEREDICTO_CONFIG } from '@/lib/types'
import { rainColor, windColor, DISPLAY_THR } from '@/lib/display'
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

function weatherIconName(rain: number | null | undefined, pop: number | null | undefined): { icon: string; color: string } {
  const r = rain ?? 0
  const p = pop ?? 0
  if (r >= 10 || (r >= 5 && p >= 70)) return { icon: 'IconCloudStorm', color: '#64748B' }
  if (r >= 2  || p >= 60)             return { icon: 'IconCloudRain',  color: '#64748B' }
  if (r >= 0.5 || p >= 35)            return { icon: 'IconCloudRain',  color: '#94A3B8' }
  if (p < 20  && r < 0.5)             return { icon: 'IconSun',        color: '#E6A817' }
  return { icon: 'IconCloud', color: '#94A3B8' }
}

type TablerIcon = React.ComponentType<{ size?: number | string; style?: React.CSSProperties; className?: string }>
function verdictIcon(v: string | null | undefined): { Icon: TablerIcon | null; color: string; label: string } {
  if (!v)                           return { Icon: null,             color: '#9CA3AF', label: 'Sem dados' }
  if (v.trim() === 'DROP LIBERADO') return { Icon: IconCircleCheck  as TablerIcon, color: '#16A34A', label: 'Drop liberado' }
  if (v.includes('Veja os alertas'))return { Icon: IconAlertTriangle as TablerIcon, color: '#D97706', label: 'Veja os alertas' }
  if (v.includes('MELHOR ESPERAR')) return { Icon: IconClockPause   as TablerIcon, color: '#DC2626', label: 'Melhor esperar' }
  return { Icon: null, color: '#9CA3AF', label: v }
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

// ── Sky Card ──────────────────────────────────────────────────────────────────

// Fase da lua calculada localmente — sem API, sempre disponível.
// Retorna 0–1: 0 = lua nova, 0.5 = lua cheia.
function calcMoonPhase(date: Date): number {
  const known = new Date(2000, 0, 6, 18, 14, 0) // lua nova conhecida: 6 jan 2000
  const synodic = 29.530588853                   // mês sinódico em dias
  const diff = (date.getTime() - known.getTime()) / 86400000
  return (((diff % synodic) + synodic) % synodic) / synodic
}

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

type SkyState = 'clear' | 'partly' | 'cloudy' | 'rain' | 'night-clear' | 'night-cloudy' | 'night-rain'

function getSkyState(cloudCover: number, isRaining: boolean, srMin: number, ssMin: number): SkyState {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const isNight = nowMin < srMin || nowMin > ssMin
  if (isNight) {
    if (isRaining)      return 'night-rain'
    if (cloudCover > 60) return 'night-cloudy'
    return 'night-clear'
  }
  if (isRaining)      return 'rain'
  if (cloudCover > 60) return 'cloudy'
  if (cloudCover > 25) return 'partly'
  return 'clear'
}

const skyBackgrounds: Record<SkyState, string> = {
  clear: [
    'radial-gradient(ellipse at 22% 22%, rgba(255,215,90,0.38) 0%, transparent 42%)',
    'radial-gradient(ellipse at 55% 0%, rgba(120,190,255,0.25) 0%, transparent 55%)',
    'linear-gradient(180deg,#0d4f8c 0%,#1a6bb5 18%,#2e8fd4 42%,#5aaee8 66%,#88c8f0 84%,#b8e0f8 100%)',
  ].join(','),
  partly: [
    'radial-gradient(ellipse at 28% 18%, rgba(255,215,90,0.22) 0%, transparent 38%)',
    'linear-gradient(180deg,#1060a8 0%,#2478c0 28%,#4a98d8 56%,#78bae8 80%,#a8d8f5 100%)',
  ].join(','),
  cloudy: [
    'radial-gradient(ellipse at 28% 5%, rgba(110,145,180,0.65) 0%, transparent 48%)',
    'radial-gradient(ellipse at 78% 28%, rgba(140,170,200,0.55) 0%, transparent 42%)',
    'radial-gradient(ellipse at 48% 65%, rgba(125,158,188,0.45) 0%, transparent 48%)',
    'linear-gradient(180deg,#3a5270 0%,#4a6585 25%,#607a98 52%,#7a95ae 76%,#96afc4 100%)',
  ].join(','),
  rain: [
    'radial-gradient(ellipse at 50% 0%, rgba(55,78,105,0.7) 0%, transparent 58%)',
    'linear-gradient(180deg,#1e2d3e 0%,#263848 26%,#2f4458 52%,#3a5268 76%,#425e76 100%)',
  ].join(','),
  'night-clear': [
    'radial-gradient(ellipse at 50% 90%, rgba(20,50,100,0.5) 0%, transparent 60%)',
    'linear-gradient(180deg,#020810 0%,#060f20 18%,#0a1830 38%,#0e2040 58%,#122848 78%,#163058 100%)',
  ].join(','),
  'night-cloudy': [
    'radial-gradient(ellipse at 50% 90%, rgba(20,50,100,0.5) 0%, transparent 60%)',
    'linear-gradient(180deg,#020810 0%,#060f20 18%,#0a1830 38%,#0e2040 58%,#122848 78%,#163058 100%)',
  ].join(','),
  'night-rain': 'linear-gradient(180deg,#050a10 0%,#080f18 30%,#0c1520 60%,#101c2a 100%)',
}

type CloudLayer = { w: number; h: number; top: number; left?: number | string; right?: number; bg: string; blur: number }

const cloudLayers: Partial<Record<SkyState, CloudLayer[]>> = {
  partly: [
    { w:130, h:55, top:8,  left:-15,   bg:'rgba(255,255,255,0.72)', blur:22 },
    { w:95,  h:42, top:22, right:0,    bg:'rgba(255,255,255,0.55)', blur:18 },
    { w:70,  h:32, top:5,  left:'38%', bg:'rgba(255,255,255,0.45)', blur:16 },
  ],
  cloudy: [
    { w:180, h:70, top:0,  left:-30,   bg:'rgba(190,208,225,0.8)',  blur:28 },
    { w:130, h:55, top:15, right:-20,  bg:'rgba(175,198,218,0.7)',  blur:24 },
    { w:100, h:45, top:30, left:'30%', bg:'rgba(185,205,222,0.65)', blur:20 },
    { w:80,  h:35, top:2,  left:'55%', bg:'rgba(195,212,228,0.6)',  blur:18 },
  ],
  rain: [
    { w:200, h:80, top:-5, left:-40,   bg:'rgba(70,90,108,0.72)',  blur:30 },
    { w:150, h:60, top:10, right:-30,  bg:'rgba(65,85,105,0.65)',  blur:26 },
    { w:110, h:48, top:28, left:'22%', bg:'rgba(75,95,112,0.6)',   blur:22 },
  ],
  'night-cloudy': [
    { w:180, h:70, top:0,  left:-30,  bg:'rgba(15,25,40,0.8)', blur:28 },
    { w:130, h:55, top:15, right:-20, bg:'rgba(12,20,35,0.7)', blur:24 },
  ],
  'night-rain': [
    { w:200, h:75, top:-5, left:-40,  bg:'rgba(15,22,35,0.8)', blur:28 },
    { w:155, h:58, top:18, right:-25, bg:'rgba(12,18,30,0.7)', blur:24 },
  ],
}

function getMoonStyle(phase: number): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute', top: 14, right: 22, width: 28, height: 28,
    borderRadius: '50%', pointerEvents: 'none',
    filter: 'drop-shadow(0 0 5px rgba(210,220,190,0.5))',
  }
  if (phase < 0.03 || phase > 0.97)
    return { ...base, background: '#0a0a18', boxShadow: 'none', filter: 'none' }
  if (phase < 0.22)
    return { ...base, background: '#dde0c8', boxShadow: 'inset -11px -1px 0 rgba(4,8,24,0.92)' }
  if (phase < 0.28)
    return { ...base, background: 'linear-gradient(to left,#dde0c8 50%,rgba(4,8,24,0.95) 50%)', boxShadow: 'none' }
  if (phase < 0.47)
    return { ...base, background: '#dde0c8', boxShadow: 'inset -3px -1px 0 rgba(4,8,24,0.55)' }
  if (phase < 0.53)
    return { ...base, background: '#e8ecd6', boxShadow: '0 0 14px 6px rgba(220,228,200,0.5)', filter: 'drop-shadow(0 0 8px rgba(220,228,180,0.6))' }
  if (phase < 0.72)
    return { ...base, background: '#dde0c8', boxShadow: 'inset 3px -1px 0 rgba(4,8,24,0.55)' }
  if (phase < 0.78)
    return { ...base, background: 'linear-gradient(to right,#dde0c8 50%,rgba(4,8,24,0.95) 50%)', boxShadow: 'none' }
  return { ...base, background: '#dde0c8', boxShadow: 'inset 11px -1px 0 rgba(4,8,24,0.92)' }
}

const skyTextColors: Record<SkyState, { txt: string; sub: string }> = {
  clear:          { txt: '#fff',     sub: 'rgba(255,255,255,0.8)'  },
  partly:         { txt: '#fff',     sub: 'rgba(255,255,255,0.75)' },
  cloudy:         { txt: '#1F2937', sub: '#374151'                 },
  rain:           { txt: '#F3F4F6', sub: '#D1D5DB'                 },
  'night-clear':  { txt: '#E2E8F0', sub: '#94A3B8'                 },
  'night-cloudy': { txt: '#D1D5DB', sub: '#6B7280'                 },
  'night-rain':   { txt: '#CBD5E1', sub: '#6B7280'                 },
}


// Calcula posição do sol na curva Bezier que coincide com o path SVG
// P0=(30,130) P1=(170,18) P2=(310,130) — viewBox 340×158
function getSunPosition(sunriseStr: string, sunsetStr: string): { left: string; top: string } | null {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const srMin = toMin(sunriseStr)
  const ssMin = toMin(sunsetStr)
  const total = ssMin - srMin
  if (total <= 0) return null
  const t = Math.max(0, Math.min(1, (nowMin - srMin) / total))
  const x = (1-t)*(1-t)*30  + 2*(1-t)*t*170 + t*t*310
  const y = (1-t)*(1-t)*130 + 2*(1-t)*t*18  + t*t*130
  return { left: `${(x / 340) * 100}%`, top: `${(y / 158) * 100}%` }
}

function SolarArc({ sunrise, sunset, cloudCover, isRaining, moonPhase, tempC }: {
  sunrise: string; sunset: string
  cloudCover: number; isRaining: boolean; moonPhase: number; tempC?: number
}) {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  const now    = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const srMin  = toMin(sunrise), ssMin = toMin(sunset)
  const totalMin = ssMin - srMin
  const dh = Math.floor(totalMin / 60), dm = totalMin % 60

  const skyState       = getSkyState(cloudCover, isRaining, srMin, ssMin)
  const isNightState   = skyState.startsWith('night')
  const isRainingVisual = skyState === 'rain' || skyState === 'night-rain'

  const { txt, sub } = skyTextColors[skyState]

  const sunPos = !isNightState ? getSunPosition(sunrise, sunset) : null

  // Estrelas como divs CSS — posições e timings pseudo-aleatórios fixos
  const stars = useMemo(() =>
    Array.from({ length: 55 }, (_, i) => ({
      left:       `${(i * 61.8) % 96 + 2}%`,
      top:        `${(i * 43.2) % 70 + 2}%`,  // max ~72% do sky area (≈ 114px de 158px)
      size:       0.8 + (i * 0.17) % 2.2,
      opacityMax: 0.5  + (i * 0.019) % 0.5,
      opacityMin: 0.15 + (i * 0.011) % 0.25,
      duration:   2.5  + (i * 0.31)  % 3.5,   // 2.5s–6s por estrela
      delay:      (i * 0.17) % 4,              // até 4s de delay individual
    }))
  , [])

  const rainDrops = useMemo(() =>
    Array.from({ length: 28 }, (_, i) => ({
      left:     `${(i * 37.3) % 110 - 5}%`,
      top:      `${(i * 53.7) % 110 - 10}%`,
      height:   10 + (i * 7.3) % 18,
      delay:    `${(i * 0.07) % 0.7}s`,
      duration: `${0.55 + (i * 0.03) % 0.3}s`,
      opacity:  0.2 + (i * 0.023) % 0.35,
    }))
  , [])

  const moon = moonPhaseInfo(moonPhase)

  return (
    <div style={{ overflow: 'hidden', position: 'relative', background: skyBackgrounds[skyState] }}>
      <style>{`
        @keyframes rainFall {
          from { transform: rotate(12deg) translateY(-20px); }
          to   { transform: rotate(12deg) translateY(160px); }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: var(--star-opacity-min); }
          50%      { opacity: var(--star-opacity-max); }
        }
      `}</style>

      {/* ── Sky area — altura fixa que define o espaço do céu ──────────── */}
      <div style={{ position: 'relative', height: 158, overflow: 'hidden' }}>

        {/* Estrelas — CSS divs com twinkle individualizado, só à noite */}
        {isNightState && stars.map((s, i) => (
          <div key={i} style={{
            position: 'absolute', borderRadius: '50%', background: '#fff',
            width: s.size, height: s.size, left: s.left, top: s.top,
            pointerEvents: 'none',
            ['--star-opacity-min' as string]: skyState === 'night-cloudy' ? s.opacityMin * 0.25 : s.opacityMin,
            ['--star-opacity-max' as string]: skyState === 'night-cloudy' ? s.opacityMax * 0.25 : s.opacityMax,
            animation: `star-twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          } as React.CSSProperties} />
        ))}

        {/* Nuvens CSS com blur */}
        {(cloudLayers[skyState] ?? []).map((c, i) => (
          <div key={i} style={{
            position: 'absolute', borderRadius: '50%', pointerEvents: 'none',
            width: c.w, height: c.h, top: c.top,
            ...(c.left  !== undefined ? { left:  c.left  } : {}),
            ...(c.right !== undefined ? { right: c.right } : {}),
            background: c.bg, filter: `blur(${c.blur}px)`,
          }} />
        ))}

        {/* Gotas de chuva animadas */}
        {isRainingVisual && rainDrops.map((d, i) => (
          <div key={i} style={{
            position: 'absolute', width: 1.5, height: d.height,
            left: d.left, top: d.top, borderRadius: 1,
            background: 'linear-gradient(to bottom, transparent, rgba(180,210,240,0.55))',
            transform: 'rotate(12deg)',
            animation: `rainFall ${d.duration} ${d.delay} linear infinite`,
            opacity: d.opacity, pointerEvents: 'none',
          }} />
        ))}

        {/* Temperatura ao vivo — canto superior esquerdo */}
        {tempC != null && (
          <div style={{
            position: 'absolute', top: 12, left: 14, zIndex: 3,
            pointerEvents: 'none',
          }}>
            <span style={{
              fontFamily: "var(--font-barlow-condensed), sans-serif",
              fontWeight: 800, fontSize: 36, lineHeight: 1,
              color: txt, letterSpacing: '-0.02em',
              textShadow: isNightState ? '0 1px 6px rgba(0,0,0,0.5)' : '0 1px 4px rgba(0,0,0,0.15)',
            }}>
              {tempC}°
            </span>
          </div>
        )}

        {/* Lua — posição fixa canto superior direito */}
        {isNightState && moonPhase > 0.03 && (
          <div style={getMoonStyle(moonPhase)} />
        )}

        {/* Sol — posição calculada pela mesma curva Bezier do arco SVG */}
        {sunPos && (
          <div style={{
            position: 'absolute', left: sunPos.left, top: sunPos.top,
            transform: 'translate(-50%, -50%)',
            width: 32, height: 32, borderRadius: '50%', pointerEvents: 'none', zIndex: 2,
            background: 'radial-gradient(circle,#fff 18%,#ffe566 48%,transparent 70%)',
            boxShadow: '0 0 20px 10px rgba(255,210,80,0.45)',
          }} />
        )}

        {/* Arco SVG — só durante o dia; à noite removido do DOM */}
        {!isNightState && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
            viewBox="0 0 340 158"
            preserveAspectRatio="none"
          >
            <path
              d="M30,130 Q170,18 310,130"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
              fill="none"
              strokeDasharray="2 5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>

      {/* Info row: nascer · duração+lua · pôr */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 16px 12px',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt }}>{sunrise}</div>
          <div style={{ fontSize: 9, color: sub }}>nascer do sol</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: sub }}>
            {`${dh}h${dm > 0 ? String(dm).padStart(2, '0') + 'm' : ''} de luz`}
          </div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>
            {moon.emoji} <span style={{ fontSize: 10 }}>{moon.name}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt }}>{sunset}</div>
          <div style={{ fontSize: 9, color: sub }}>pôr do sol</div>
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
  const [liveWeather, setLiveWeather] = useState<{
    precipitation: number; cloudCover: number; tempC: number
  } | null>(null)

  useEffect(() => {
    if (!lat || !lon) return
    const ctrl = new AbortController()
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation,cloud_cover,temperature_2m&daily=sunrise,sunset&timezone=America%2FSao_Paulo&forecast_days=1`,
      { signal: ctrl.signal }
    )
      .then(r => r.json())
      .then(data => {
        const sr = (data.daily?.sunrise?.[0] as string | undefined)?.split('T')[1]?.slice(0, 5)
        const ss = (data.daily?.sunset?.[0] as string | undefined)?.split('T')[1]?.slice(0, 5)
        if (sr && ss) setSolar({ sunrise: sr, sunset: ss, moonPhase: calcMoonPhase(new Date()) })
        const precip = data.current?.precipitation   ?? null
        const cloud  = data.current?.cloud_cover     ?? null
        const temp   = data.current?.temperature_2m  ?? null
        if (precip !== null && cloud !== null && temp !== null) {
          setLiveWeather({ precipitation: precip, cloudCover: cloud, tempC: Math.round(temp) })
        }
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
        {/* Placeholder reserva o espaço da seção enquanto o fetch não retorna (evita CLS) */}
        {lat && lon && !solar && <div style={{ height: 222 }} />}
        {solar && (
          <>
            <div style={DIV} />
            <div style={{ margin: '0 -18px' }}>
              <div style={{ padding: '0 18px 8px' }}>
                <div style={{ ...SEC }}>Luz do dia — Hoje</div>
              </div>
              <SolarArc
                sunrise={solar.sunrise}
                sunset={solar.sunset}
                cloudCover={liveWeather?.cloudCover ?? condicao.cloud_pct ?? 30}
                isRaining={liveWeather ? liveWeather.precipitation > 0.5 : false}
                moonPhase={solar.moonPhase}
                tempC={liveWeather?.tempC}
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
                  <span style={{ fontSize: 9, color: '#6B7280', fontWeight: 400, marginLeft: 6, textTransform: 'none' as const, letterSpacing: 0 }}>
                    toque para ver hora a hora
                  </span>
                )}
              </div>
              <div className="fds-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {fdsDias.map(({ label, v, rain, wind, pop, tmax, tmin }, idx) => {
                  const wi = weatherIconName(rain, pop)
                  const vi = verdictIcon(v)
                  const iconMap: Record<string, TablerIcon> = {
                    IconSun:        IconSun        as TablerIcon,
                    IconCloud:      IconCloud      as TablerIcon,
                    IconCloudRain:  IconCloudRain  as TablerIcon,
                    IconCloudStorm: IconCloudStorm as TablerIcon,
                  }
                  const WeatherIcon = iconMap[wi.icon] ?? (IconCloud as TablerIcon)
                  const diaDate = [d1, d2, d3][idx]
                  const clickable = !!(lat && lon)

                  return (
                    <div
                      key={label}
                      onClick={clickable ? () => setSelectedDay({ date: diaDate, label, rain: rain ?? null, wind: wind ?? null, tmax: tmax ?? null, tmin: tmin ?? null }) : undefined}
                      style={{
                        background: '#F3F4F6',
                        borderRadius: 10,
                        padding: '14px 12px 10px',
                        cursor: clickable ? 'pointer' : 'default',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Dia */}
                      <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, letterSpacing: '0.03em', marginBottom: 12 }}>
                        {label}
                      </div>

                      {/* Ícone + Temperatura hero */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <WeatherIcon size={22} style={{ color: wi.color, opacity: 0.7, flexShrink: 0 }} />
                        <div>
                          <span style={{ fontFamily: "var(--font-barlow-condensed), sans-serif", fontWeight: 800, fontSize: 32, lineHeight: 1, color: '#111', letterSpacing: '-0.02em' }}>
                            {tmax != null ? `${tmax}°` : '—'}
                          </span>
                          <span className="font-mono" style={{ fontSize: 13, fontWeight: 400, color: '#9CA3AF', marginLeft: 1 }}>
                            / {tmin != null ? `${tmin}°` : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Veredicto */}
                      <div style={{ fontSize: 11, fontWeight: 600, color: vi.color, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {vi.Icon && <vi.Icon size={12} />}
                        {vi.label}
                      </div>

                      {/* Dados secundários */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconDroplet size={12} style={{ opacity: 0.6 }} />Chuva
                          </span>
                          <span className="font-mono" style={{ color: rain != null && rain > 5 ? '#DC2626' : '#6B7280' }}>
                            {rain != null ? `${rain.toFixed(1)}mm` : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconUmbrella size={12} style={{ opacity: 0.6 }} />Prob.
                          </span>
                          <span className="font-mono">{pop != null ? `${pop}%` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconWind size={12} style={{ opacity: 0.6 }} />Vento
                          </span>
                          <span className="font-mono">{wind != null ? `${wind.toFixed(1)} m/s` : '—'}</span>
                        </div>
                      </div>

                      {/* Chevron hint */}
                      {clickable && (
                        <div style={{ textAlign: 'center', marginTop: 8 }}>
                          <IconChevronDown size={11} style={{ color: '#9CA3AF' }} />
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
