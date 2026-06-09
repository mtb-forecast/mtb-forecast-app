'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase, getClientUser } from '@/lib/supabase'
import { geocodeLatLon } from '@/lib/geocoding'

const StravaMap = dynamic(() => import('@/components/StravaMap'), { ssr: false })

type StravaSegment = {
  strava_segment_id: number
  name: string
  distance_km: number
  desnivel_m: number
  lat: number | null
  lon: number | null
  city: string | null
  state: string | null
  polyline: string | null
}

type ImportStatus = 'idle' | 'loading' | 'success' | 'error'

async function getOrCreateLocalidade(lat: number | null, lon: number | null) {
  if (lat == null || lon == null) return { regiao: null, localidadeId: null }
  const geo = await geocodeLatLon(lat, lon)
  if (!geo) return { regiao: null, localidadeId: null }

  let query = supabase.from('localidades').select('id')
    .eq('estado', geo.estado)
    .eq('cidade', geo.cidade)
  if (geo.localidade) {
    query = query.eq('localidade', geo.localidade)
  } else {
    query = query.is('localidade', null)
  }
  const { data: existing } = await query.maybeSingle()
  if (existing) return { regiao: geo.estado, localidadeId: (existing as { id: string }).id }

  const { data: inserted } = await supabase
    .from('localidades')
    .insert({ pais: geo.pais, estado: geo.estado, cidade: geo.cidade, localidade: geo.localidade })
    .select('id')
    .single()
  return {
    regiao: geo.estado,
    localidadeId: inserted ? (inserted as { id: string }).id : null,
  }
}

function ImportarStravaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [segments, setSegments] = useState<StravaSegment[]>([])
  const [fetchError, setFetchError] = useState<'rate_limit' | 'generic' | null>(null)
  const [importStatus, setImportStatus] = useState<Record<number, ImportStatus>>({})
  const [importError, setImportError] = useState<Record<number, string>>({})
  // IDs cujo detalhe já foi tentado buscar (para exibir placeholder "sem mapa")
  const [enriched, setEnriched] = useState<Set<number>>(new Set())
  // IDs sendo reimportados (para mostrar "Atualizando..." vs "Importando...")
  const [reimportando, setReimportando] = useState<Set<number>>(new Set())

  const erroParam = searchParams.get('erro')

  const stravaAuthUrl =
    `https://www.strava.com/oauth/authorize` +
    `?client_id=${process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(
      (typeof window !== 'undefined' ? window.location.origin : '') +
      '/admin/importar-strava/callback'
    )}` +
    `&response_type=code&scope=read,activity:read_all`

  // Enriquece segments sem polyline buscando /segments/{id} sequencialmente
  async function enrichSegments(segs: StravaSegment[]) {
    const missing = segs.filter(s => !s.polyline)
    if (missing.length === 0) return
    console.log(`[Strava] ${missing.length} segmento(s) sem polyline — buscando detalhes...`)
    for (const seg of missing) {
      try {
        const res = await fetch(`/api/admin/strava-segment?id=${seg.strava_segment_id}`)
        if (res.ok) {
          const det = await res.json()
          if (det.polyline) {
            setSegments(prev => prev.map(s =>
              s.strava_segment_id === seg.strava_segment_id ? { ...s, polyline: det.polyline } : s
            ))
          } else {
            console.log(`[Strava] Sem polyline disponível: #${seg.strava_segment_id} "${seg.name}"`)
          }
        }
      } catch {
        // não bloqueia
      }
      setEnriched(prev => { const n = new Set(prev); n.add(seg.strava_segment_id); return n })
    }
  }

  useEffect(() => {
    async function init() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) { router.replace('/'); return }
      setIsAdmin(true)

      const res = await fetch('/api/admin/strava-routes')

      if (res.status === 401) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'no_token' || body.error === 'token_expired') {
          setHasToken(false)
          setLoading(false)
          return
        }
        window.location.href = '/login'
        return
      }

      if (res.status === 429) {
        setFetchError('rate_limit')
        setLoading(false)
        return
      }

      if (!res.ok) {
        setFetchError('generic')
        setLoading(false)
        return
      }

      const data: StravaSegment[] = await res.json()
      setHasToken(true)
      setSegments(data)

      // Verificar quais segmentos já foram importados (trilhas_pendentes)
      if (data.length > 0) {
        const { data: existentes } = await supabase
          .from('trilhas_pendentes')
          .select('strava_segment_id')
          .not('strava_segment_id', 'is', null)
          .in('strava_segment_id', data.map(s => s.strava_segment_id))

        if (existentes && existentes.length > 0) {
          const jaImportados: Record<number, ImportStatus> = {}
          for (const row of existentes) {
            if (row.strava_segment_id) jaImportados[row.strava_segment_id] = 'success'
          }
          setImportStatus(jaImportados)
        }
      }

      setLoading(false)
      enrichSegments(data) // busca polylines em background sem bloquear a UI
    }
    init()
  }, [router])

  async function importarSegmento(seg: StravaSegment) {
    if (!userId) return
    const isReimport = importStatus[seg.strava_segment_id] === 'success'
    if (isReimport) setReimportando(prev => { const n = new Set(prev); n.add(seg.strava_segment_id); return n })
    setImportStatus(s => ({ ...s, [seg.strava_segment_id]: 'loading' }))
    setImportError(e => ({ ...e, [seg.strava_segment_id]: '' }))

    // 1. Buscar polyline completa e altitude_m via detalhe do segmento
    let polyline = seg.polyline
    let altitude_m: number | null = null
    try {
      const detailRes = await fetch(`/api/admin/strava-segment?id=${seg.strava_segment_id}`)
      if (detailRes.ok) {
        const detail = await detailRes.json()
        if (detail.polyline) polyline = detail.polyline
        if (detail.altitude_m != null) altitude_m = detail.altitude_m
      } else {
        console.warn('Não foi possível buscar detalhe do segmento', seg.strava_segment_id)
      }
    } catch (err) {
      console.warn('Erro ao buscar detalhe do segmento:', err)
    }

    // 2. Geocoding reverso — estado + localidade_id via Nominatim
    const { regiao, localidadeId } = await getOrCreateLocalidade(seg.lat, seg.lon)

    // 3. UPDATE se já existe registro pendente, INSERT caso contrário
    const { data: existing } = await supabase
      .from('trilhas_pendentes')
      .select('id')
      .eq('strava_segment_id', seg.strava_segment_id)
      .eq('status', 'pendente')
      .maybeSingle()

    let dbError
    if (existing) {
      const { error } = await supabase.from('trilhas_pendentes').update({
        name: seg.name,
        lat: seg.lat,
        lon: seg.lon,
        polyline: polyline ?? null,
        extensao_km: seg.distance_km,
        desnivel_m: seg.desnivel_m,
        altitude_m,
        regiao,
        localidade_id: localidadeId,
      }).eq('id', (existing as { id: string }).id)
      dbError = error
    } else {
      const { error } = await supabase.from('trilhas_pendentes').insert({
        name: seg.name,
        lat: seg.lat,
        lon: seg.lon,
        polyline: polyline ?? null,
        extensao_km: seg.distance_km,
        desnivel_m: seg.desnivel_m,
        strava_segment_id: seg.strava_segment_id,
        user_id: userId,
        status: 'pendente',
        solo_type: null,
        exposicao: null,
        altitude_m,
        trail_type: null,
        regiao,
        bioma: null,
        localidade_id: localidadeId,
      })
      dbError = error
    }

    setReimportando(prev => { const n = new Set(prev); n.delete(seg.strava_segment_id); return n })

    if (dbError) {
      console.warn('Erro ao importar segmento:', dbError.message)
      setImportStatus(s => ({ ...s, [seg.strava_segment_id]: 'error' }))
      setImportError(e => ({ ...e, [seg.strava_segment_id]: dbError!.message }))
    } else {
      setImportStatus(s => ({ ...s, [seg.strava_segment_id]: 'success' }))
      // Atualizar polyline no estado local para exibir mapa imediatamente
      if (polyline) {
        setSegments(prev => prev.map(s =>
          s.strava_segment_id === seg.strava_segment_id ? { ...s, polyline } : s
        ))
      }
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link
            href="/perfil"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 20, textDecoration: 'none' }}
          >
            ← Voltar
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Importar via Strava</h1>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '1px',
              background: '#FC4C02', color: '#fff',
              borderRadius: 2, padding: '3px 8px',
            }}>
              ADMIN
            </span>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            {hasToken
              ? `${segments.length} segmento${segments.length !== 1 ? 's' : ''} favorito${segments.length !== 1 ? 's' : ''} no Strava`
              : 'Conecte seu Strava para importar segmentos favoritos como trilhas pendentes'}
          </p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ padding: '32px 32px 48px', maxWidth: 900, margin: '0 auto' }}>

        {/* Erro OAuth */}
        {erroParam && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
            {erroParam === 'acesso_negado'
              ? 'Acesso negado pelo Strava. Tente novamente.'
              : 'Erro ao obter token do Strava. Tente novamente.'}
          </div>
        )}

        {/* Rate limit 429 */}
        {fetchError === 'rate_limit' && (
          <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Limite de requisições atingido (429)</p>
            <p style={{ fontSize: 13, color: '#c2410c' }}>
              A API do Strava está com rate limit. Aguarde alguns minutos e recarregue a página.
            </p>
          </div>
        )}

        {/* Erro genérico */}
        {fetchError === 'generic' && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
            Erro ao buscar segmentos do Strava. Tente novamente ou reconecte sua conta.
          </div>
        )}

        {/* Sem token → botão de conexão */}
        {!hasToken && !fetchError && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 56, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#2a2e25', marginBottom: 8 }}>Conectar com Strava</h2>
            <p style={{ fontSize: 14, color: '#888', maxWidth: 420, margin: '0 auto 32px' }}>
              Conecte sua conta Strava para importar seus segmentos favoritos como trilhas pendentes de aprovação.
            </p>
            <a
              href={stravaAuthUrl}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: '#FC4C02', color: '#fff',
                border: 'none', borderRadius: 4,
                padding: '12px 28px', fontSize: 14, fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Conectar com Strava
            </a>
          </div>
        )}

        {/* Sem segmentos */}
        {hasToken && segments.length === 0 && !fetchError && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#888' }}>Nenhum segmento favorito encontrado na sua conta Strava.</p>
            <p style={{ fontSize: 12, color: '#bbb', marginTop: 8 }}>
              Marque segmentos como favoritos no Strava para importá-los aqui.
            </p>
          </div>
        )}

        {/* Lista de segmentos */}
        {hasToken && segments.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, color: '#2a2e25' }}>Segmentos favoritos no Strava</h2>
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: '#f4f5f0', color: '#888',
                border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 8px',
              }}>
                {segments.length} segmento{segments.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {segments.map(seg => {
                const status = importStatus[seg.strava_segment_id] ?? 'idle'
                const errMsg = importError[seg.strava_segment_id]
                const jaImportado = status === 'success'
                const isLoading = status === 'loading'
                const isReimport = reimportando.has(seg.strava_segment_id)
                const tentouPolyline = enriched.has(seg.strava_segment_id)

                return (
                  <div
                    key={seg.strava_segment_id}
                    style={{
                      background: '#fff',
                      border: jaImportado ? '1px solid #86efac' : '0.5px solid #e5e5e5',
                      borderRadius: 8, overflow: 'hidden',
                    }}
                  >
                    {/* Mapa ou placeholder */}
                    {seg.polyline ? (
                      <StravaMap polyline={seg.polyline} />
                    ) : tentouPolyline ? (
                      <div style={{
                        height: 110, background: '#f4f5f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderBottom: '0.5px solid #e5e5e5',
                      }}>
                        <p style={{ fontSize: 12, color: '#bbb' }}>Mapa não disponível</p>
                      </div>
                    ) : null}

                    <div style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: status === 'error' ? 12 : 0 }}>
                        <div>
                          <p style={{ fontSize: 15, fontWeight: 600, color: '#2a2e25' }}>{seg.name}</p>
                          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                            {seg.distance_km > 0 && (
                              <span style={{ fontSize: 12, color: '#888' }}>📏 {seg.distance_km} km</span>
                            )}
                            {seg.desnivel_m > 0 && (
                              <span style={{ fontSize: 12, color: '#888' }}>⛰ {seg.desnivel_m} m desnível</span>
                            )}
                            {(seg.city || seg.state) && (
                              <span style={{ fontSize: 12, color: '#bbb' }}>
                                📍 {[seg.city, seg.state].filter(Boolean).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => importarSegmento(seg)}
                          disabled={isLoading}
                          style={{
                            background: jaImportado ? '#dcfce7' : '#6d745f',
                            color: jaImportado ? '#166534' : '#fff',
                            border: jaImportado ? '1.5px solid #86efac' : 'none',
                            borderRadius: 4,
                            padding: '8px 20px', fontSize: 13, fontWeight: 500,
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.7 : 1,
                            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                          }}
                        >
                          {isLoading && (
                            <span style={{
                              display: 'inline-block', width: 10, height: 10,
                              border: `2px solid ${jaImportado ? '#86efac' : 'rgba(255,255,255,0.5)'}`,
                              borderTopColor: 'transparent',
                              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                            }} />
                          )}
                          {isLoading
                            ? isReimport ? 'Atualizando...' : 'Importando...'
                            : jaImportado ? '↺ Reimportar' : 'Importar'}
                        </button>
                      </div>

                      {status === 'error' && (
                        <div style={{
                          background: '#fee2e2', border: '1px solid #fca5a5',
                          color: '#991b1b', borderRadius: 4,
                          padding: '8px 12px', fontSize: 12, marginTop: 12,
                        }}>
                          Erro ao importar: {errMsg || 'Tente novamente.'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function ImportarStravaPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <ImportarStravaContent />
    </Suspense>
  )
}
