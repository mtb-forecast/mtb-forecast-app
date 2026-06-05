'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import { PumpTrack, CondicaoPumptrack } from '@/lib/types'
import { rainColor, windColor } from '@/lib/display'

const PumpTrackObservacoes = dynamic(() => import('@/components/PumpTrackObservacoes'), { ssr: false })

type FullPumpTrack = PumpTrack & {
  condicao?: CondicaoPumptrack
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
      <i className={`ti ${icon}`} style={{ fontSize: 14, color: '#7C3AED', flexShrink: 0 }} />
      <span style={{ color: '#9CA3AF', minWidth: 100 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

export default function PumpTrackDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [pt, setPt] = useState<FullPumpTrack | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)

      const { data } = await supabase
        .from('trilhas_pumptrack')
        .select(`
          id, nome, cidade, uf, endereco, latitude, longitude,
          tipo_superficie, comprimento_estimado, iluminacao, estacionamento,
          fonte, google_maps_url, instagram, status_validacao,
          condicoes_pumptrack(gerado_em, rain_mm, pico_3h, wind_kmh, temp_max, temp_min, pop_48h)
        `)
        .eq('id', id)
        .single()

      if (!data) { router.push('/trilhas'); return }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = data as any
      const arr = Array.isArray(row.condicoes_pumptrack) ? row.condicoes_pumptrack : []
      setPt({ ...row, condicao: arr[0] ?? undefined })
      setLoading(false)
    }
    load()
  }, [id, router])

  if (loading || !pt) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #E5E7EB', borderTopColor: '#7C3AED', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const c = pt.condicao
  const wazeUrl = `https://waze.com/ul?ll=${pt.latitude},${pt.longitude}&navigate=yes`
  const gmapsUrl = pt.google_maps_url || `https://maps.google.com/?q=${pt.latitude},${pt.longitude}`
  const isHomologado = pt.status_validacao?.includes('Homologado')
  const instagramHandle = pt.instagram && pt.instagram !== 'N/I' ? pt.instagram.replace('@', '') : null

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA' }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <Link href="/trilhas" style={{ fontSize: 12, color: '#555', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            ← Trilhas &amp; Pump Tracks
          </Link>

          {/* Badge + título */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ background: '#EDE9FE', color: '#7C3AED', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 10px', letterSpacing: '0.06em' }}>
                  PUMP TRACK
                </span>
                {isHomologado && (
                  <span style={{ background: '#2D1B69', color: '#A78BFA', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 10px' }}>
                    ✓ Homologado
                  </span>
                )}
                {pt.tipo_superficie && (
                  <span style={{ background: '#1F1F1F', color: '#9CA3AF', fontSize: 10, fontWeight: 500, borderRadius: 999, padding: '2px 10px' }}>
                    {pt.tipo_superficie}
                  </span>
                )}
                {pt.comprimento_estimado && (
                  <span style={{ background: '#1F1F1F', color: '#9CA3AF', fontSize: 10, fontWeight: 500, borderRadius: 999, padding: '2px 10px' }}>
                    {pt.comprimento_estimado}
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: '#fff', lineHeight: 1.1, margin: '0 0 6px' }}>
                {pt.nome}
              </h1>
              {pt.cidade && pt.uf && (
                <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
                  <i className="ti ti-map-pin" style={{ fontSize: 12, marginRight: 4 }} />
                  {pt.cidade}, {pt.uf}
                </p>
              )}
            </div>
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              background: '#05C8F7', color: '#fff',
              borderRadius: 8, padding: '10px 18px',
              fontSize: 13, fontWeight: 700, textDecoration: 'none',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.236 2.636 7.855 6.356 9.312-.08-.717-.148-1.863.027-2.645.158-.7 1.045-4.43 1.045-4.43s-.267-.533-.267-1.322c0-1.24.72-2.168 1.613-2.168.762 0 1.13.572 1.13 1.257 0 .766-.487 1.912-.74 2.977-.21.888.446 1.61 1.32 1.61 1.585 0 2.648-2.025 2.648-4.422 0-1.826-1.234-3.102-2.996-3.102-2.04 0-3.238 1.53-3.238 3.11 0 .614.236 1.272.53 1.632.059.07.067.133.05.205-.054.223-.174.712-.198.81-.032.13-.106.158-.244.095-1.124-.524-1.827-2.17-1.827-3.494 0-2.842 2.065-5.453 5.953-5.453 3.124 0 5.55 2.227 5.55 5.2 0 3.103-1.956 5.597-4.672 5.597-.912 0-1.77-.474-2.063-1.033l-.561 2.096c-.203.78-.75 1.758-1.118 2.353C10.642 21.97 11.314 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
              </svg>
              Como chegar (Waze)
            </a>
            <a href={gmapsUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.08)', color: '#fff',
              borderRadius: 8, padding: '10px 18px',
              fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)',
            }}>
              <i className="ti ti-map-2" style={{ fontSize: 14 }} />
              Google Maps
            </a>
            {instagramHandle && (
              <a href={`https://instagram.com/${instagramHandle}`} target="_blank" rel="noopener noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.08)', color: '#fff',
                borderRadius: 8, padding: '10px 18px',
                fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.12)',
              }}>
                <i className="ti ti-brand-instagram" style={{ fontSize: 14 }} />
                {pt.instagram}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Faixa roxa */}
      <div style={{ background: '#7C3AED', height: 3 }} />

      {/* ── Conteúdo ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Card previsão ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB', padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 14 }}>
            Previsão do tempo
          </p>
          {c ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {c.rain_mm != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '6px 14px' }}>
                    <i className="ti ti-droplet" style={{ fontSize: 14, color: rainColor(c.rain_mm) }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: rainColor(c.rain_mm) }}>{c.rain_mm.toFixed(1)}mm</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>chuva 48h</span>
                  </div>
                )}
                {c.pico_3h != null && c.pico_3h > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '6px 14px' }}>
                    <i className="ti ti-droplet-half" style={{ fontSize: 14, color: rainColor(c.pico_3h) }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: rainColor(c.pico_3h) }}>{c.pico_3h.toFixed(1)}mm</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>pico 3h</span>
                  </div>
                )}
                {c.wind_kmh != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '6px 14px' }}>
                    <i className="ti ti-wind" style={{ fontSize: 14, color: windColor(c.wind_kmh) }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: windColor(c.wind_kmh) }}>{c.wind_kmh.toFixed(0)} km/h</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>vento</span>
                  </div>
                )}
                {c.temp_max != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '0.5px solid #E5E7EB', borderRadius: 20, padding: '6px 14px' }}>
                    <i className="ti ti-temperature" style={{ fontSize: 14, color: '#F59E0B' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{Math.round(c.temp_max)}°C</span>
                    {c.temp_min != null && <span style={{ fontSize: 11, color: '#9CA3AF' }}>/ {Math.round(c.temp_min)}°C</span>}
                  </div>
                )}
              </div>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                Atualizado às {new Date(c.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
              </p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>
              Previsão ainda não disponível para este pump track.
            </p>
          )}
        </div>

        {/* ── Detalhes do local ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB', padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 14 }}>
            Detalhes do local
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pt.endereco && <InfoRow icon="ti-map-pin" label="Endereço" value={pt.endereco} />}
            {pt.tipo_superficie && <InfoRow icon="ti-road" label="Superfície" value={pt.tipo_superficie} />}
            {pt.comprimento_estimado && <InfoRow icon="ti-ruler" label="Comprimento" value={pt.comprimento_estimado} />}
            {pt.iluminacao && <InfoRow icon="ti-bulb" label="Iluminação" value={pt.iluminacao} />}
            {pt.estacionamento && <InfoRow icon="ti-parking" label="Estacionamento" value={pt.estacionamento} />}
            {pt.fonte && <InfoRow icon="ti-building" label="Fonte" value={pt.fonte} />}
          </div>
        </div>

        {/* ── Mapa mini ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB', overflow: 'hidden' }}>
          <iframe
            title={`Mapa ${pt.nome}`}
            width="100%"
            height="220"
            style={{ border: 0, display: 'block' }}
            src={`https://maps.google.com/maps?q=${pt.latitude},${pt.longitude}&z=15&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        {/* ── Avaliações + Fotos ── */}
        <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB', padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>
            Comunidade
          </p>
          <PumpTrackObservacoes pumptracks_id={pt.id} userId={userId} />
        </div>

      </div>
    </div>
  )
}
