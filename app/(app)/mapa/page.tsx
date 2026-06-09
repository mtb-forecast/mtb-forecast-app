'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'
import type { Condicao } from '@/lib/types'
import 'leaflet/dist/leaflet.css'

type TrilhaMapData = {
  id: string
  name: string
  lat: number
  lon: number
  polyline?: string | null
  condicoes?: Pick<Condicao, 'veredicto' | 'veredicto_12h' | 'acumulo_48h' | 'ultima_chuva_h'>[]
}

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    coords.push([lat / 1e5, lng / 1e5])
  }
  return coords
}

type PumpTrackMapData = {
  id: string
  nome: string
  latitude: number
  longitude: number
  cidade: string | null
  uf: string | null
  tipo_superficie: string | null
  comprimento_estimado: string | null
  condicoes_pumptrack?: { rain_mm: number | null; wind_kmh: number | null; gerado_em: string }[]
}

function getVeredictoColor(veredicto: string | undefined): string {
  if (!veredicto || veredicto.includes('Favorite esta trilha')) return '#999'
  if (veredicto.includes('DROP LIBERADO') && !veredicto.includes('alerta')) return '#16a34a'
  if (veredicto.includes('ATENÇÃO') || veredicto.includes('alerta')) return '#d97706'
  return '#dc2626'
}

function getVeredictoLabel(veredicto: string | undefined): string {
  if (!veredicto) return 'Sem atualização'
  if (veredicto.includes('DROP LIBERADO') && !veredicto.includes('alerta')) return 'DROP LIBERADO'
  if (veredicto.includes('ATENÇÃO') || veredicto.includes('alerta')) return 'ATENÇÃO'
  return 'MELHOR ESPERAR'
}

function rainEmoji(mm: number | null | undefined): string {
  const v = mm ?? 0
  if (v === 0)    return '☀️'
  if (v < 2)     return '🌤'
  if (v < 8)     return '🌦'
  if (v < 20)    return '🌧'
  if (v < 40)    return '🌩'
  return '⛈'
}

function windEmoji(kmh: number | null | undefined): string {
  const v = kmh ?? 0
  if (v > 50) return ' 🌪'
  if (v > 25) return ' 💨'
  return ''
}

function ultimaChuvaEmoji(h: number | null | undefined): string {
  if (h == null) return '🕐 —'
  if (h < 6)    return `🌧 ${Math.round(h)}h atrás`
  if (h < 24)   return `💧 ${Math.round(h)}h atrás`
  if (h < 72)   return `🌤 ${Math.floor(h / 24)}d atrás`
  return `☀️ +${Math.floor(h / 24)}d atrás`
}

export default function MapaPage() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activePolylineRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const user = await getClientUser()
        if (!user) { window.location.href = '/login'; return }

        const [{ data: trilhasData, error }, , { data: ptData }, L] = await Promise.all([
          supabase
            .from('trilhas')
            .select(`
              id, name, lat, lon, polyline,
              condicoes(veredicto, veredicto_12h, acumulo_48h, ultima_chuva_h)
            `)
            .eq('aprovada', true)
            .not('lat', 'is', null)
            .not('lon', 'is', null)
            .order('name', { ascending: true })
            .order('gerado_em', { foreignTable: 'condicoes', ascending: false }),
          Promise.resolve({ data: [] }),
          supabase
            .from('trilhas_pumptrack')
            .select(`
              id, nome, latitude, longitude, cidade, uf,
              tipo_superficie, comprimento_estimado,
              condicoes_pumptrack(rain_mm, wind_kmh, gerado_em)
            `)
            .order('nome'),
          import('leaflet'),
        ])

        if (error) { setErro('Erro ao carregar trilhas.'); setLoading(false); return }

        const trilhas: TrilhaMapData[] = trilhasData || []
        const pumptracks: PumpTrackMapData[] = ptData || []

        setLoading(false)
        buildMap(trilhas, pumptracks, L)
      } catch {
        setErro('Erro ao carregar o mapa. Tente recarregar a página.')
        setLoading(false)
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildMap(trilhas: TrilhaMapData[], pumptracks: PumpTrackMapData[], L: any) {
    if (!mapRef.current || leafletRef.current) return

    const defaultCenter: [number, number] = [-23.5505, -46.6333]
    const defaultZoom = 9

    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
    })
    leafletRef.current = map

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    })
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 19 }
    )
    osmLayer.addTo(map)

    L.control.layers({ 'Mapa': osmLayer, 'Satélite': satelliteLayer }, {}, { position: 'topright' }).addTo(map)

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!leafletRef.current) return
          const { latitude, longitude } = pos.coords
          map.setView([latitude, longitude], 10)

          const userIcon = L.divIcon({
            html: `<div style="
              width:14px;height:14px;background:#3b82f6;
              border-radius:50%;border:3px solid #fff;
              box-shadow:0 0 0 4px rgba(59,130,246,0.25);
            "></div>`,
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })
          L.marker([latitude, longitude], { icon: userIcon })
            .addTo(map)
            .bindPopup('<strong>Você está aqui</strong>')
        },
        () => {}
      )
    }

    trilhas.forEach((trilha) => {
      const condicao = trilha.condicoes?.[0]
      const veredicto = condicao?.veredicto_12h || condicao?.veredicto
      const inactive = !veredicto || veredicto.includes('Favorite esta trilha')
      const cor = getVeredictoColor(veredicto)
      const label = getVeredictoLabel(veredicto)

      const pinIcon = L.divIcon({
        html: `<div style="
          width:28px;height:28px;
          background:${cor};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:2.5px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.3);
          opacity:${inactive ? '0.55' : '1'};
        "></div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -30],
      })

      const popupContent = inactive
        ? `
          <div style="font-family:Inter,sans-serif;padding:4px 0;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111;line-height:1.3;">
              ${trilha.name}
            </p>
            <span style="
              display:inline-block;
              background:#f3f4f6;color:#6b7280;
              font-size:10px;font-weight:700;
              border-radius:4px;padding:2px 8px;
              margin-bottom:8px;
            ">SEM ATUALIZAÇÃO</span>
            <p style="margin:0 0 10px;font-size:11px;color:#6b7280;line-height:1.5;">
              ⭐ Favoritar esta trilha para receber atualizações diárias.
            </p>
            <a href="/trilhas/${trilha.id}" style="
              font-size:11px;font-weight:600;color:#2a2e25;
              text-decoration:none;display:inline-flex;align-items:center;gap:4px;
            ">Ver trilha →</a>
          </div>
        `
        : `
          <div style="font-family:Inter,sans-serif;padding:4px 0;">
            <span style="
              display:inline-block;
              background:${cor}22;color:${cor};
              font-size:10px;font-weight:700;
              border-radius:4px;padding:2px 8px;
              margin-bottom:7px;
            ">${label}</span>
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#111;line-height:1.3;">
              ${trilha.name}
            </p>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:28px;line-height:1;">${rainEmoji(condicao!.acumulo_48h)}${windEmoji(null)}</span>
              <span style="font-size:11px;color:#555;line-height:1.5;">
                ${ultimaChuvaEmoji(condicao!.ultima_chuva_h)}
              </span>
            </div>
            <a href="/trilhas/${trilha.id}" style="
              font-size:11px;font-weight:600;color:#2a2e25;
              text-decoration:none;display:inline-flex;align-items:center;gap:4px;
            ">Ver detalhes →</a>
          </div>
        `

      const popup = L.popup({ maxWidth: 220, minWidth: 180 }).setContent(popupContent)

      const marker = L.marker([trilha.lat, trilha.lon], { icon: pinIcon })
        .addTo(map)
        .bindPopup(popup)

      if (trilha.polyline) {
        marker.on('popupopen', () => {
          if (activePolylineRef.current) map.removeLayer(activePolylineRef.current)
          const coords = decodePolyline(trilha.polyline!)
          activePolylineRef.current = L.polyline(coords, {
            color: cor,
            weight: 4,
            opacity: 0.85,
            smoothFactor: 1,
          }).addTo(map)
        })
      }
    })

    // Remove polyline quando popup fecha sem abrir outro
    map.on('popupclose', () => {
      setTimeout(() => {
        if (!map.isPopupOpen() && activePolylineRef.current) {
          map.removeLayer(activePolylineRef.current)
          activePolylineRef.current = null
        }
      }, 0)
    })

    // ── Pump Tracks ────────────────────────────────────────────────────
    pumptracks.forEach((pt) => {
      const cond = pt.condicoes_pumptrack?.[0]
      const wazeUrl = `https://waze.com/ul?ll=${pt.latitude},${pt.longitude}&navigate=yes`

      const ptIcon = L.divIcon({
        html: `<div style="
          width:26px;height:26px;
          background:#7C3AED;
          border-radius:50%;
          border:2.5px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.35);
          display:flex;align-items:center;justify-content:center;
          font-size:9px;font-weight:800;color:#fff;font-family:Inter,sans-serif;
          letter-spacing:0;
        ">P</div>`,
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -16],
      })

      const ptRainMm = cond?.rain_mm ?? null
      const ptWindKmh = cond?.wind_kmh ?? null
      const hasForecast = ptRainMm != null || ptWindKmh != null

      const popupContent = `
        <div style="font-family:Inter,sans-serif;padding:4px 0;min-width:160px;">
          <div style="
            display:inline-flex;align-items:center;gap:5px;
            background:#EDE9FE;color:#7C3AED;
            font-size:9px;font-weight:700;border-radius:4px;
            padding:2px 7px;margin-bottom:7px;letter-spacing:0.04em;
          ">● PUMP TRACK</div>
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111;line-height:1.3;">
            ${pt.nome}
          </p>
          ${pt.cidade && pt.uf ? `<p style="margin:0 0 6px;font-size:11px;color:#6b7280;">${pt.cidade}, ${pt.uf}</p>` : ''}
          ${pt.tipo_superficie ? `<p style="margin:0 0 8px;font-size:11px;color:#6b7280;">🛣 ${pt.tipo_superficie}${pt.comprimento_estimado ? ' · ' + pt.comprimento_estimado : ''}</p>` : ''}
          ${hasForecast
            ? `<div style="margin-bottom:10px;">
                <span style="font-size:32px;line-height:1;">${rainEmoji(ptRainMm)}${windEmoji(ptWindKmh)}</span>
              </div>`
            : `<p style="margin:0 0 10px;font-size:11px;color:#9ca3af;font-style:italic;">Previsão em breve</p>`
          }
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <a href="${wazeUrl}" target="_blank" rel="noopener noreferrer" style="
              display:inline-flex;align-items:center;gap:5px;
              background:#05C8F7;color:#fff;
              border-radius:12px;padding:4px 10px;
              font-size:11px;font-weight:600;text-decoration:none;
            ">🗺 Como chegar</a>
            <a href="/pump-track/${pt.id}" style="
              display:inline-flex;align-items:center;gap:4px;
              font-size:11px;font-weight:600;color:#7C3AED;text-decoration:none;
              padding:4px 2px;
            ">Ver detalhes →</a>
          </div>
        </div>
      `

      L.marker([pt.latitude, pt.longitude], { icon: ptIcon })
        .addTo(map)
        .bindPopup(L.popup({ maxWidth: 220, minWidth: 180 }).setContent(popupContent))
    })
  }

  useEffect(() => {
    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
      }
    }
  }, [])

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 56px - 64px)', overflow: 'hidden' }}>

      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: '#f4f5f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36,
            border: '3px solid #d0d4c6',
            borderTop: '3px solid #6d745f',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#888', fontSize: 13 }}>Carregando trilhas...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {erro && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: '#f4f5f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{ color: '#ef4444', fontSize: 14 }}>{erro}</p>
        </div>
      )}

      <div
        ref={mapRef}
        style={{ width: '100%', height: '100%', zIndex: 0 }}
      />

      {/* Legenda */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 400,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 10, padding: '10px 14px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        fontSize: 11,
      }}>
        {[
          { cor: '#16a34a', label: 'DROP LIBERADO',  shape: 'pin' },
          { cor: '#d97706', label: 'ATENÇÃO',         shape: 'pin' },
          { cor: '#dc2626', label: 'MELHOR ESPERAR', shape: 'pin' },
          { cor: '#999',    label: 'Sem condições',    shape: 'pin' },
        ].map(({ cor, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: cor, flexShrink: 0,
            }} />
            <span style={{ color: '#333', fontWeight: 500 }}>{label}</span>
          </div>
        ))}
        {/* Divisor */}
        <div style={{ borderTop: '1px solid #E5E7EB', margin: '6px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            background: '#7C3AED', border: '2px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 800, color: '#fff',
          }}>P</div>
          <span style={{ color: '#7C3AED', fontWeight: 600 }}>Pump Track</span>
        </div>
      </div>
    </div>
  )
}
