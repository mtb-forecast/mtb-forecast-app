'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useMemo } from 'react'
import { decodePolyline } from '@/lib/polyline'

type ElevPoint = { lat: number; lon: number; ele: number }

// Trecho componente de uma trilha composta (ver trilha_segmentos / CLAUDE.md).
// Só usado pra colorir o perfil de elevação -- não é a origem dos dados de
// condição (isso continua vindo de TrilhaSegmentosBreakdown).
type Trecho = { id: string; name: string; polyline: string | null; lat: number | null; lon: number | null }

type Props = {
  polyline: string | null
  elevationProfile: ElevPoint[] | null
  desnivel_m?: number | null
  extensao_km?: number | null
  altitude_m?: number | null
  lat?: number
  lon?: number
  trechos?: Trecho[]
}

// Paleta categórica validada (skill dataviz, references/palette.md) --
// ordem fixa, nunca cíclica: garante Delta E >= 8 (CVD) e >= 15 (visão
// normal) entre pares ADJACENTES, que é o caso aqui (faixas contíguas ao
// longo do eixo de distância, nunca comparadas todas-contra-todas). Além do
// slot 8, um 9º trecho não ganha cor gerada -- some pra CORES_TRECHO_OUTRO.
const CORES_TRECHO = [
  '#2a78d6', // 1 azul
  '#eb6834', // 2 laranja
  '#1baf7a', // 3 água
  '#eda100', // 4 amarelo
  '#e87ba4', // 5 magenta
  '#008300', // 6 verde
  '#4a3aa7', // 7 violeta
  '#e34948', // 8 vermelho
]
const COR_TRECHO_OUTRO = '#898781' // ink mudo -- 9º+ trecho, sem hue gerado

// Distância máxima pra um ponto do perfil de elevação ser considerado
// "dentro" de um trecho -- pontos além disso ficam sem cor (são trecho de
// conexão da trilha composta, não coberto por nenhuma trilha do catálogo).
const RAIO_MATCH_M = 60

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanciaAtePontos(lat: number, lon: number, pontos: [number, number][]): number {
  let min = Infinity
  for (const [pLat, pLon] of pontos) {
    const d = haversineM(lat, lon, pLat, pLon)
    if (d < min) min = d
  }
  return min
}

function dot(color: string) {
  return `<div style="width:11px;height:11px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 9, color: '#9AA093', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#1A1D18', fontWeight: 500, marginTop: 1 }}>
        {value}
      </div>
    </div>
  )
}

export default function TrailMapWithProfile({
  polyline, elevationProfile, desnivel_m, extensao_km, altitude_m, lat, lon, trechos,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const divRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hoverMarkerRef = useRef<any>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    import('leaflet').then((L) => {
      if (!divRef.current || mapRef.current) return

      const map = L.map(divRef.current, { zoomControl: true })
      mapRef.current = map

      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      })
      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }
      )
      osm.addTo(map)
      L.control.layers({ 'Mapa': osm, 'Satélite': satellite }).addTo(map)

      const makeIcon = (color: string) =>
        L.divIcon({ html: dot(color), className: '', iconSize: [11, 11], iconAnchor: [5, 5] })

      if (polyline) {
        const coords = decodePolyline(polyline)
        if (coords.length > 0) {
          const line = L.polyline(coords, { color: '#FC4C02', weight: 4, opacity: 0.9 }).addTo(map)
          L.marker(coords[0], { icon: makeIcon('#22c55e') }).addTo(map)
          L.marker(coords[coords.length - 1], { icon: makeIcon('#1A1D18') }).addTo(map)
          map.fitBounds(line.getBounds(), { padding: [24, 24] })
          return
        }
      }

      if (lat != null && lon != null) {
        map.setView([lat, lon], 15)
        L.marker([lat, lon], { icon: makeIcon('#FC4C02') }).addTo(map)
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [polyline, lat, lon])

  const elevData = useMemo(() => {
    const pts = elevationProfile
    if (!pts || pts.length < 2) return null

    const haversineKm = (a: ElevPoint, b: ElevPoint) => {
      const R = 6371
      const dLat = (b.lat - a.lat) * Math.PI / 180
      const dLon = (b.lon - a.lon) * Math.PI / 180
      const aa = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
    }
    const dists = [0]
    for (let i = 1; i < pts.length; i++) dists.push(dists[i - 1] + haversineKm(pts[i - 1], pts[i]))
    const totalDist = dists[dists.length - 1]

    const eles = pts.map(p => p.ele)
    const minE = Math.min(...eles)
    const maxE = Math.max(...eles)
    const range = maxE - minE || 1

    const W = 648, H = 64, PY = 4
    const toX = (i: number) => (dists[i] / totalDist) * W
    const toY = (i: number) => H - PY - ((eles[i] - minE) / range) * (H - PY * 2)

    const xs = pts.map((_, i) => toX(i))
    const ys = pts.map((_, i) => toY(i))
    let line = `M${xs[0]},${ys[0]}`
    for (let i = 0; i < xs.length - 1; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2
      const my = (ys[i] + ys[i + 1]) / 2
      line += ` Q${xs[i]},${ys[i]} ${mx},${my}`
    }
    line += ` L${xs[xs.length - 1]},${ys[xs.length - 1]}`
    const fill = line + ` L${W},${H} L0,${H} Z`

    return { pts, dists, totalDist, minE, maxE, xs, ys, line, fill, toX, toY }
  }, [elevationProfile])

  // Casa cada ponto do perfil de elevação com o trecho componente mais
  // próximo (dentro de RAIO_MATCH_M) e agrupa em faixas contíguas -- ver
  // scripts/agregar_trilhas_compostas.py e o histórico da trilha composta.
  const bandas = useMemo(() => {
    if (!elevData || !trechos || trechos.length === 0) return []

    const trechosComPontos = trechos
      .map((t, idx) => {
        const pontos: [number, number][] = t.polyline
          ? decodePolyline(t.polyline)
          : (t.lat != null && t.lon != null ? [[t.lat, t.lon] as [number, number]] : [])
        return { idx, name: t.name, pontos }
      })
      .filter(t => t.pontos.length > 0)

    if (trechosComPontos.length === 0) return []

    const trechoPorPonto = elevData.pts.map(p => {
      let melhorIdx = -1
      let melhorDist = RAIO_MATCH_M
      for (const t of trechosComPontos) {
        const d = distanciaAtePontos(p.lat, p.lon, t.pontos)
        if (d < melhorDist) { melhorDist = d; melhorIdx = t.idx }
      }
      return melhorIdx
    })

    // Cor atribuída por ORDEM DE APARIÇÃO ao longo da rota (0km -> fim), não
    // pelo índice original do trecho -- garante que faixas vizinhas no
    // gráfico nunca herdem cores vizinhas na paleta por coincidência de
    // cadastro. Acima do 8º trecho distinto, usa a cor neutra (nunca gera hue).
    const corPorTrechoIdx = new Map<number, string>()
    for (const idx of trechoPorPonto) {
      if (idx === -1 || corPorTrechoIdx.has(idx)) continue
      const slot = corPorTrechoIdx.size
      corPorTrechoIdx.set(idx, slot < CORES_TRECHO.length ? CORES_TRECHO[slot] : COR_TRECHO_OUTRO)
    }

    type Banda = { trechoIdx: number; name: string; cor: string; x0: number; x1: number; i0: number; i1: number }
    const out: Banda[] = []
    let i = 0
    while (i < trechoPorPonto.length) {
      const idx = trechoPorPonto[i]
      let j = i
      while (j + 1 < trechoPorPonto.length && trechoPorPonto[j + 1] === idx) j++
      if (idx !== -1) {
        const t = trechosComPontos.find(tt => tt.idx === idx)!
        out.push({ trechoIdx: idx, name: t.name, cor: corPorTrechoIdx.get(idx)!, x0: elevData.toX(i), x1: elevData.toX(j), i0: i, i1: j })
      }
      i = j + 1
    }
    return out
  }, [elevData, trechos])

  // Trecho a que pertence o ponto sob o cursor agora -- usado no tooltip de
  // hover (mostra o nome do trecho, não só elevação/distância).
  const trechoHover = useMemo(() => {
    if (hoverIdx == null) return null
    return bandas.find(b => hoverIdx >= b.i0 && hoverIdx <= b.i1) ?? null
  }, [bandas, hoverIdx])

  const legendaTrechos = useMemo(() => {
    const vistos = new Map<number, { name: string; cor: string }>()
    for (const b of bandas) if (!vistos.has(b.trechoIdx)) vistos.set(b.trechoIdx, { name: b.name, cor: b.cor })
    return [...vistos.values()]
  }, [bandas])

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!elevData) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    // Pontos do GPX não são igualmente espaçados por distância (velocidade
    // varia ao longo do percurso) -- toX() posiciona cada ponto pela distância
    // acumulada (dists[]), então o índice sob o cursor também precisa ser
    // achado por distância, nunca por fração linear do índice (isso fazia a
    // bolinha de hover dessincronizar do cursor em trechos com pontos mais
    // esparsos/densos).
    const targetDist = fraction * elevData.totalDist
    let idx = 0
    let melhorDist = Infinity
    for (let i = 0; i < elevData.dists.length; i++) {
      const d = Math.abs(elevData.dists[i] - targetDist)
      if (d < melhorDist) { melhorDist = d; idx = i }
    }
    setHoverIdx(idx)
    const pt = elevData.pts[idx]
    if (!mapRef.current) return
    import('leaflet').then(L => {
      const html = '<div style="width:12px;height:12px;border-radius:50%;background:#F4F3EF;border:2.5px solid #6d745f;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>'
      const icon = L.divIcon({ html, className: '', iconSize: [12, 12], iconAnchor: [6, 6] })
      if (hoverMarkerRef.current) {
        hoverMarkerRef.current.setLatLng([pt.lat, pt.lon])
      } else {
        hoverMarkerRef.current = L.marker([pt.lat, pt.lon], { icon, zIndexOffset: 1000 }).addTo(mapRef.current)
      }
    })
  }

  function handleMouseLeave() {
    setHoverIdx(null)
    if (hoverMarkerRef.current) { hoverMarkerRef.current.remove(); hoverMarkerRef.current = null }
  }

  const hasStats = desnivel_m != null || extensao_km != null || altitude_m != null
  const mapsUrl = lat != null && lon != null
    ? `https://www.google.com/maps?q=${lat},${lon}`
    : `https://www.google.com/maps?q=${polyline ? 'route' : ''}`

  return (
    <div>
      <div
        ref={divRef}
        style={{ height: 220, background: '#d4dcc9', position: 'relative', zIndex: 0 }}
      />

      {elevData && (
        <div style={{ background: '#FAFAF8', borderTop: '1px solid rgba(0,0,0,.07)' }}>
          <div style={{ padding: '12px 16px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9AA093' }}>
              Perfil de elevação
            </span>
            <div style={{ display: 'flex', gap: 16 }}>
              <Stat label="Desnível" value={desnivel_m != null ? `${Math.round(desnivel_m)}m` : '—'} />
              <Stat label="Distância" value={extensao_km != null ? `${extensao_km}km` : `${elevData.totalDist.toFixed(1)}km`} />
              <Stat label="Alt. máx." value={altitude_m != null ? `${altitude_m}m` : `${Math.round(elevData.maxE)}m`} />
            </div>
          </div>

          <div style={{ padding: '4px 16px 14px', position: 'relative' }}>
            {hoverIdx != null && (
              <div style={{
                position: 'absolute', top: trechoHover ? -62 : -44,
                left: `${(elevData.xs[hoverIdx] / 648) * 100}%`,
                transform: 'translateX(-50%) translateY(0)',
                background: '#1A1D18', color: '#F4F3EF', borderRadius: 7,
                padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-dm-mono)',
                pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
                textAlign: 'center',
              }}>
                {trechoHover && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', marginBottom: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: trechoHover.cor, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: '#F4F3EF' }}>{trechoHover.name}</span>
                  </div>
                )}
                <span style={{ color: '#4ADE80', fontWeight: 500 }}>{Math.round(elevData.pts[hoverIdx].ele)}m</span>
                {' · '}{elevData.dists[hoverIdx].toFixed(1)}km
                <div style={{
                  position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                  borderTop: '5px solid #1A1D18',
                }} />
              </div>
            )}

            <svg
              viewBox="0 0 648 72"
              width="100%"
              style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6d745f" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#6d745f" stopOpacity="0.02" />
                </linearGradient>
                <clipPath id="elevClip">
                  <rect x="0" y="0" width="648" height="64" />
                </clipPath>
              </defs>

              {bandas.map((b, i) => (
                <rect
                  key={i}
                  x={b.x0} y={0} width={Math.max(1, b.x1 - b.x0)} height={64}
                  fill={b.cor} opacity={0.16} clipPath="url(#elevClip)"
                />
              ))}

              <path d={elevData.fill} fill="url(#elevFill)" clipPath="url(#elevClip)" />
              <line x1={0} x2={648} y1={21} y2={21} stroke="rgba(0,0,0,.04)" strokeWidth={0.5} />
              <line x1={0} x2={648} y1={42} y2={42} stroke="rgba(0,0,0,.04)" strokeWidth={0.5} />
              <path d={elevData.line} fill="none" stroke="#6d745f" strokeWidth={2} strokeLinejoin="round" clipPath="url(#elevClip)" />

              {hoverIdx != null && (
                <>
                  <line
                    x1={elevData.xs[hoverIdx]} x2={elevData.xs[hoverIdx]}
                    y1={0} y2={64}
                    stroke="rgba(109,116,95,.45)" strokeWidth={1} strokeDasharray="3 3"
                  />
                  <circle cx={elevData.xs[hoverIdx]} cy={elevData.ys[hoverIdx]} r={4.5} fill="#fff" stroke="#6d745f" strokeWidth={2} />
                </>
              )}

              <text x={0} y={82} textAnchor="start" fontFamily="var(--font-dm-mono)" fontSize={9} fill="#9AA093">0km</text>
              <text x={324} y={82} textAnchor="middle" fontFamily="var(--font-dm-mono)" fontSize={9} fill="#9AA093">{(elevData.totalDist / 2).toFixed(1)}km</text>
              <text x={648} y={82} textAnchor="end" fontFamily="var(--font-dm-mono)" fontSize={9} fill="#9AA093">{elevData.totalDist.toFixed(1)}km</text>

              <text x={-4} y={10} textAnchor="end" fontFamily="var(--font-dm-mono)" fontSize={9} fill="#9AA093">{Math.round(elevData.maxE)}m</text>
              <text x={-4} y={66} textAnchor="end" fontFamily="var(--font-dm-mono)" fontSize={9} fill="#9AA093">{Math.round(elevData.minE)}m</text>
            </svg>
          </div>

          {legendaTrechos.length > 0 && (
            <div style={{
              padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px 12px',
            }}>
              {legendaTrechos.map((t, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: t.cor, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#6B7280' }}>{t.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{
        padding: '9px 16px', borderTop: '1px solid rgba(0,0,0,.07)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff',
      }}>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#6d745f', textDecoration: 'none' }}>
          Ver no Google Maps ↗
        </a>
        {lat != null && lon != null && (
          <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#9AA093' }}>
            {lat.toFixed(4)}, {lon.toFixed(4)}
          </span>
        )}
      </div>

      {!elevData && hasStats && (
        <div style={{
          padding: '10px 16px', borderTop: '1px solid rgba(0,0,0,.07)',
          display: 'flex', gap: 16, justifyContent: 'center', background: '#FAFAF8',
        }}>
          <Stat label="Desnível" value={desnivel_m != null ? `${Math.round(desnivel_m)}m` : '—'} />
          <Stat label="Distância" value={extensao_km != null ? `${extensao_km}km` : '—'} />
          <Stat label="Alt. máx." value={altitude_m != null ? `${altitude_m}m` : '—'} />
        </div>
      )}
    </div>
  )
}
