'use client'

import { useState, useEffect, useRef } from 'react'
import { IconX, IconDroplet, IconWind, IconThermometer, IconSunrise, IconSunset } from '@tabler/icons-react'

// ── Types ────────────────────────────────────────────────────────────────────

type HourData = {
  hour: number
  label: string
  precip: number
  pop: number
  temp: number
  wind: number
}

type Solar = {
  sunrise: string
  sunriseHour: number
  sunset: string
  sunsetHour: number
}

type Props = {
  lat: number
  lon: number
  diaDate: Date
  summaryRain: number | null
  summaryTmax: number | null
  summaryTmin: number | null
  summaryWind: number | null
  onClose: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function barColor(pop: number, precip: number): string {
  if (precip >= 8)  return '#1E3A8A'
  if (precip >= 4)  return '#1D4ED8'
  if (precip >= 1)  return '#2563EB'
  if (precip >= 0.3) return '#3B82F6'
  if (pop >= 50)    return '#60A5FA'
  return '#93C5FD'
}

const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// ── Component ─────────────────────────────────────────────────────────────────

export default function DiaDetalheModal({
  lat, lon, diaDate, summaryRain, summaryTmax, summaryTmin, summaryWind, onClose,
}: Props) {
  const [hours, setHours] = useState<HourData[]>([])
  const [solar, setSolar] = useState<Solar | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const y = diaDate.getFullYear()
  const mo = String(diaDate.getMonth() + 1).padStart(2, '0')
  const dd = String(diaDate.getDate()).padStart(2, '0')
  const dateStr = `${y}-${mo}-${dd}`

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Fetch hourly + solar data from Open-Meteo
  useEffect(() => {
    const ctrl = new AbortController()
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,precipitation_probability,temperature_2m,wind_speed_10m&daily=sunrise,sunset&timezone=America%2FSao_Paulo&forecast_days=5`

    fetch(url, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        const times: string[] = data.hourly?.time ?? []
        const startIdx = times.findIndex(t => t.startsWith(dateStr))
        if (startIdx === -1) { setError(true); setLoading(false); return }

        const dayHours: HourData[] = times.slice(startIdx, startIdx + 24).map((t, i) => {
          const idx = startIdx + i
          const hour = parseInt(t.split('T')[1].split(':')[0])
          return {
            hour,
            label: `${String(hour).padStart(2, '0')}h`,
            precip: Math.round((data.hourly.precipitation[idx] ?? 0) * 10) / 10,
            pop:    data.hourly.precipitation_probability[idx] ?? 0,
            temp:   Math.round(data.hourly.temperature_2m[idx] ?? 0),
            wind:   Math.round((data.hourly.wind_speed_10m[idx] ?? 0) * 10) / 10,
          }
        })
        setHours(dayHours)

        // Solar
        const dailyTimes: string[] = data.daily?.time ?? []
        const dayIdx = dailyTimes.findIndex(t => t === dateStr)
        if (dayIdx >= 0) {
          const sr = (data.daily?.sunrise?.[dayIdx] as string | undefined)?.split('T')[1]?.slice(0, 5)
          const ss = (data.daily?.sunset?.[dayIdx] as string | undefined)?.split('T')[1]?.slice(0, 5)
          if (sr && ss) setSolar({
            sunrise: sr, sunriseHour: parseInt(sr.split(':')[0]),
            sunset:  ss, sunsetHour:  parseInt(ss.split(':')[0]),
          })
        }

        setLoading(false)

        // Auto-scroll to first rainy hour or 6am
        setTimeout(() => {
          if (!scrollRef.current) return
          const firstRainyIdx = dayHours.findIndex(h => h.pop >= 30)
          const targetHour = firstRainyIdx >= 0 ? Math.max(0, firstRainyIdx - 2) : 6
          scrollRef.current.scrollLeft = targetHour * 52
        }, 120)
      })
      .catch(e => { if (e.name !== 'AbortError') { setError(true); setLoading(false) } })

    return () => ctrl.abort()
  }, [lat, lon, dateStr])

  // Bar chart max height
  const BAR_H = 80

  const dayName   = DAY_NAMES[diaDate.getDay()]
  const dateLabel = `${diaDate.getDate()} de ${MONTH_NAMES[diaDate.getMonth()]}`

  return (
    <>
      <style>{`
        @keyframes ddm-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes ddm-spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2001,
        background: '#fff', borderRadius: '20px 20px 0 0',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.18)',
        animation: 'ddm-slide 0.28s cubic-bezier(.32,.72,0,1)',
      }}>

        {/* Handle */}
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: '#D1D5DB' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '8px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111', letterSpacing: '-0.3px' }}>{dayName}</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{dateLabel}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#F3F4F6', border: 'none', borderRadius: '50%',
              width: 34, height: 34, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#6B7280', flexShrink: 0,
            }}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Summary card */}
        <div style={{
          margin: '0 16px 12px', padding: '10px 14px', borderRadius: 12,
          background: '#F0F9FF', border: '0.5px solid #BAE6FD',
          display: 'flex', flexWrap: 'wrap', gap: 12, flexShrink: 0,
        }}>
          {summaryRain != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <IconDroplet size={14} style={{ color: '#0EA5E9' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0369A1' }}>{summaryRain.toFixed(1)} mm</span>
            </div>
          )}
          {summaryTmin != null && summaryTmax != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <IconThermometer size={14} style={{ color: '#6B7280' }} />
              <span style={{ fontSize: 13, color: '#374151' }}>
                <b>{summaryTmin}°</b>
                <span style={{ color: '#9CA3AF' }}> – </span>
                <b>{summaryTmax}°</b>
              </span>
            </div>
          )}
          {summaryWind != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <IconWind size={14} style={{ color: '#6B7280' }} />
              <span style={{ fontSize: 13, color: '#374151' }}>{summaryWind.toFixed(1)} m/s</span>
            </div>
          )}
          {solar && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconSunrise size={14} style={{ color: '#F59E0B' }} />
                <span style={{ fontSize: 13, color: '#374151' }}>{solar.sunrise}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconSunset size={14} style={{ color: '#F59E0B' }} />
                <span style={{ fontSize: 13, color: '#374151' }}>{solar.sunset}</span>
              </div>
            </div>
          )}
        </div>

        {/* Section label */}
        <div style={{ padding: '0 20px 10px', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Previsão hora a hora
          </span>
        </div>

        {/* Hourly chart — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 160 }}>
              <div style={{
                width: 28, height: 28,
                border: '2.5px solid #E5E7EB', borderTopColor: '#3B82F6',
                borderRadius: '50%', animation: 'ddm-spin 0.8s linear infinite',
              }} />
            </div>
          )}

          {error && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
              Não foi possível carregar a previsão.
            </div>
          )}

          {!loading && !error && hours.length > 0 && (
            <div ref={scrollRef} style={{ overflowX: 'auto', paddingBottom: 4 }}>
              <div style={{ display: 'flex', paddingLeft: 12, paddingRight: 12, minWidth: 'max-content' }}>
                {hours.map((h, i) => {
                  const isSunrise = solar?.sunriseHour === h.hour
                  const isSunset  = solar?.sunsetHour  === h.hour
                  const isDay     = solar
                    ? h.hour >= solar.sunriseHour && h.hour < solar.sunsetHour
                    : h.hour >= 6 && h.hour < 18
                  const barHeight = h.pop > 0
                    ? Math.max(6, Math.round((h.pop / 100) * BAR_H))
                    : 0
                  const isRainy   = h.precip >= 0.3

                  return (
                    <div
                      key={i}
                      style={{
                        width: 52, flexShrink: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        padding: '4px 0',
                        background: isDay ? 'rgba(255,251,235,0.5)' : 'transparent',
                        borderLeft: (isSunrise || isSunset)
                          ? '1.5px dashed #FCD34D' : undefined,
                        position: 'relative',
                      }}
                    >
                      {/* Sunrise/sunset marker */}
                      {(isSunrise || isSunset) && (
                        <div style={{ position: 'absolute', top: 0, left: 1 }}>
                          {isSunrise
                            ? <IconSunrise size={11} style={{ color: '#F59E0B' }} />
                            : <IconSunset  size={11} style={{ color: '#F59E0B' }} />}
                        </div>
                      )}

                      {/* Temperature */}
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1F2937', height: 20, display: 'flex', alignItems: 'center' }}>
                        {h.temp}°
                      </div>

                      {/* Rain amount */}
                      <div style={{ fontSize: 10, height: 16, display: 'flex', alignItems: 'center', gap: 1, color: '#3B82F6', fontWeight: 600 }}>
                        {isRainy ? <><IconDroplet size={9} />{h.precip}</> : ''}
                      </div>

                      {/* Pop % */}
                      <div style={{ fontSize: 10, height: 14, display: 'flex', alignItems: 'center', color: '#60A5FA', fontWeight: 600 }}>
                        {h.pop >= 20 && !isRainy ? `${h.pop}%` : ''}
                      </div>

                      {/* Bar container */}
                      <div style={{
                        height: BAR_H, width: '100%', display: 'flex', alignItems: 'flex-end',
                        justifyContent: 'center', position: 'relative',
                        background: h.pop > 5 ? 'rgba(219,234,254,0.35)' : 'transparent',
                        borderRadius: '4px 4px 0 0',
                      }}>
                        {h.pop > 0 && (
                          <div style={{
                            width: 28, borderRadius: '3px 3px 0 0',
                            height: barHeight,
                            background: `linear-gradient(to top, ${barColor(h.pop, h.precip)}, ${barColor(h.pop, h.precip)}99)`,
                          }} />
                        )}
                      </div>

                      {/* Wind indicator */}
                      <div style={{ fontSize: 9, height: 13, display: 'flex', alignItems: 'center', gap: 1, color: '#9CA3AF' }}>
                        {h.wind >= 20 ? <><IconWind size={9} />{Math.round(h.wind)}</> : ''}
                      </div>

                      {/* Hour label */}
                      <div style={{
                        fontSize: 10,
                        fontWeight: h.hour % 6 === 0 ? 700 : 400,
                        color: h.hour % 6 === 0 ? '#374151' : '#9CA3AF',
                        marginTop: 2,
                      }}>
                        {h.label}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Rain scale legend */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '8px 0 0', fontSize: 10, color: '#9CA3AF' }}>
                <span>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: '#93C5FD', borderRadius: 2, verticalAlign: 'middle', marginRight: 3 }} />
                  baixa
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: '#3B82F6', borderRadius: 2, verticalAlign: 'middle', marginRight: 3 }} />
                  moderada
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: '#1D4ED8', borderRadius: 2, verticalAlign: 'middle', marginRight: 3 }} />
                  intensa
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
