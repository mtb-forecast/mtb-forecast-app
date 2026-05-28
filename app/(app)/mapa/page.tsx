'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Trilha, Condicao } from '@/lib/types'
import 'leaflet/dist/leaflet.css'

type TrilhaComCondicao = Trilha & {
  condicoes?: Condicao[]
  favoritos?: { id: string }[]
}

function getVeredictoColor(veredicto: string | undefined): string {
  if (!veredicto) return '#999'
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

export default function MapaPage() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: trilhasData, error } = await supabase
        .from('trilhas')
        .select('*, condicoes(*), favoritos(id)')
        .eq('aprovada', true)
        .order('name', { ascending: true })
        .order('gerado_em', { foreignTable: 'condicoes', ascending: false })

      if (error) { setErro('Erro ao carregar trilhas.'); setLoading(false); return }

      const trilhas: TrilhaComCondicao[] = (trilhasData || []).filter(
        (t: TrilhaComCondicao) => t.lat && t.lon
      )

      setLoading(false)
      buildMap(trilhas)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function buildMap(trilhas: TrilhaComCondicao[]) {
    if (!mapRef.current || leafletRef.current) return

    import('leaflet').then((L) => {
      if (!mapRef.current || leafletRef.current) return

      const defaultCenter: [number, number] = [-23.5505, -46.6333]
      const defaultZoom = 9

      const map = L.map(mapRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: true,
      })
      leafletRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
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
        const hasFavorito = (trilha.favoritos?.length ?? 0) > 0
        const inactive = !hasFavorito || !condicao
        const veredicto = inactive ? undefined : (condicao?.veredicto_12h || condicao?.veredicto)
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
                font-size:11px;font-weight:600;color:#1A1A1A;
                text-decoration:none;display:inline-flex;align-items:center;gap:4px;
              ">Ver trilha →</a>
            </div>
          `
          : `
            <div style="font-family:Inter,sans-serif;padding:4px 0;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111;line-height:1.3;">
                ${trilha.name}
              </p>
              <span style="
                display:inline-block;
                background:${cor}22;color:${cor};
                font-size:10px;font-weight:700;
                border-radius:4px;padding:2px 8px;
                margin-bottom:8px;
              ">${label}</span>
              <p style="margin:0 0 8px;font-size:11px;color:#666;">
                ${condicao!.acumulo_48h?.toFixed(1) ?? '—'}mm chuva 48h
                · últ. ${condicao!.ultima_chuva_h != null ? condicao!.ultima_chuva_h + 'h atrás' : '—'}
              </p>
              <a href="/trilhas/${trilha.id}" style="
                font-size:11px;font-weight:600;color:#1A1A1A;
                text-decoration:none;display:inline-flex;align-items:center;gap:4px;
              ">Ver detalhes →</a>
            </div>
          `

        const popup = L.popup({ maxWidth: 220, minWidth: 180 }).setContent(popupContent)

        L.marker([trilha.lat, trilha.lon], { icon: pinIcon })
          .addTo(map)
          .bindPopup(popup)
      })
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
          background: '#1A1A1A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36,
            border: '3px solid #2A2A2A',
            borderTop: '3px solid #FFE000',
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
          background: '#1A1A1A',
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
          { cor: '#16a34a', label: 'DROP LIBERADO' },
          { cor: '#d97706', label: 'ATENÇÃO' },
          { cor: '#dc2626', label: 'MELHOR ESPERAR' },
          { cor: '#999',    label: 'Sem atualização' },
        ].map(({ cor, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: cor, flexShrink: 0,
            }} />
            <span style={{ color: '#333', fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
