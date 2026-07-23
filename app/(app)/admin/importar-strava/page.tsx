'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase, getClientUser } from '@/lib/supabase'
import { geocodeLatLon } from '@/lib/geocoding'

const TrailMap = dynamic(() => import('@/components/TrailMap'), { ssr: false })

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

      // Filtrar segmentos já importados: verifica trilhas
      let disponiveis = data
      if (data.length > 0) {
        const ids = data.map(s => s.strava_segment_id)
        const { data: existentes } = await supabase
          .from('trilhas')
          .select('strava_segment_id')
          .not('strava_segment_id', 'is', null)
          .in('strava_segment_id', ids)

        const usados = new Set((existentes ?? []).map((r: { strava_segment_id: number }) => r.strava_segment_id))
        if (usados.size > 0) disponiveis = data.filter(s => !usados.has(s.strava_segment_id))
      }

      setSegments(disponiveis)
      setLoading(false)
      enrichSegments(disponiveis) // busca polylines em background sem bloquear a UI
    }
    init()
  }, [router])

  async function importarSegmento(seg: StravaSegment) {
    if (!userId) return
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

    // 3. Inserir diretamente em trilhas com placeholders para campos obrigatórios
    const { error: dbError } = await supabase.from('trilhas').insert({
      name: seg.name,
      lat: seg.lat,
      lon: seg.lon,
      polyline: polyline ?? null,
      extensao_km: seg.distance_km,
      desnivel_m: seg.desnivel_m,
      strava_segment_id: seg.strava_segment_id,
      created_by: userId,
      solo_type: 'terra',
      exposicao: 'semi-aberta',
      altitude_m,
      trail_type: 'natural',
      regiao,
      bioma: null,
      localidade_id: localidadeId,
      aprovada: true,
      observacoes: '⚠️ AJUSTE NECESSÁRIO — importado via Strava',
    })

    if (dbError) {
      console.warn('Erro ao importar segmento:', dbError.message)
      setImportStatus(s => ({ ...s, [seg.strava_segment_id]: 'error' }))
      setImportError(e => ({ ...e, [seg.strava_segment_id]: dbError!.message }))
    } else {
      // Remove o card da lista após importar com sucesso
      setSegments(prev => prev.filter(s => s.strava_segment_id !== seg.strava_segment_id))
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.08)', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* Header */}
      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '28px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/admin" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: 'rgba(154,160,147,.7)',
            marginBottom: 16, textDecoration: 'none',
          }}>
            ← Admin
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 38px)', textTransform: 'uppercase',
            color: '#F4F3EF', lineHeight: 0.95, margin: 0,
          }}>
            Importar Strava
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8 }}>
            {hasToken
              ? `${segments.length} segmento${segments.length !== 1 ? 's' : ''} ainda não importado${segments.length !== 1 ? 's' : ''}`
              : 'Segmentos favoritos → trilhas'}
          </p>
        </div>
      </div>

      <div style={{ padding: '24px 32px 48px', maxWidth: 900, margin: '0 auto' }}>

        {/* Erro OAuth */}
        {erroParam && (
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: '#DC2626', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 20 }}>
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
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: '#DC2626', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 20 }}>
            Erro ao buscar segmentos do Strava. Tente novamente ou reconecte sua conta.
          </div>
        )}

        {/* Sem token → botão de conexão */}
        {!hasToken && !fetchError && (
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: 56, textAlign: 'center' }}>
            <h2 style={{
              fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 20,
              textTransform: 'uppercase', color: '#1A1D18', marginBottom: 8,
            }}>
              Conectar com Strava
            </h2>
            <p style={{ fontSize: 14, color: '#6B7280', maxWidth: 420, margin: '0 auto 32px', lineHeight: 1.5 }}>
              Conecte sua conta Strava para importar seus segmentos favoritos como trilhas pendentes de aprovação.
            </p>
            <a
              href={stravaAuthUrl}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: '#FC4C02', color: '#fff', borderRadius: 999,
                padding: '12px 28px', fontFamily: 'var(--font-barlow-condensed)',
                fontWeight: 700, fontSize: 15, textTransform: 'uppercase', letterSpacing: '.5px',
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
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#9AA093' }}>Todos os segmentos favoritos já foram importados.</p>
            <p style={{ fontSize: 12, color: '#9AA093', marginTop: 8 }}>
              Marque novos segmentos como favoritos no Strava para importá-los aqui.
            </p>
          </div>
        )}

        {/* Lista de segmentos */}
        {hasToken && segments.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{
                fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase',
                letterSpacing: '1.5px', color: '#9AA093',
              }}>
                Segmentos não importados
              </span>
              <span style={{
                fontFamily: 'var(--font-dm-mono)', fontSize: 10,
                background: '#FFFFFF', color: '#9AA093',
                border: '1px solid rgba(0,0,0,.1)', borderRadius: 999, padding: '2px 8px',
              }}>
                {segments.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {segments.map(seg => {
                const status = importStatus[seg.strava_segment_id] ?? 'idle'
                const errMsg = importError[seg.strava_segment_id]
                const isLoading = status === 'loading'
                const tentouPolyline = enriched.has(seg.strava_segment_id)

                return (
                  <div
                    key={seg.strava_segment_id}
                    style={{
                      background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)',
                      borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)',
                    }}
                  >
                    {/* Mapa ou placeholder */}
                    {seg.polyline ? (
                      <TrailMap polyline={seg.polyline} />
                    ) : tentouPolyline ? (
                      <div style={{
                        height: 110, background: '#F8F9F5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderBottom: '1px solid rgba(0,0,0,.07)',
                      }}>
                        <p style={{ fontSize: 12, color: '#9AA093' }}>Mapa não disponível</p>
                      </div>
                    ) : null}

                    <div style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <p style={{
                            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 17,
                            textTransform: 'uppercase', color: '#1A1D18',
                          }}>
                            {seg.name}
                          </p>
                          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093' }}>
                            {seg.distance_km > 0 && <span>{seg.distance_km} km</span>}
                            {seg.desnivel_m > 0 && <span>{seg.desnivel_m} m desnível</span>}
                            {(seg.city || seg.state) && (
                              <span>{[seg.city, seg.state].filter(Boolean).join(', ')}</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => importarSegmento(seg)}
                          disabled={isLoading}
                          style={{
                            background: isLoading ? 'rgba(0,0,0,.08)' : '#FC4C02',
                            color: isLoading ? '#9AA093' : '#fff',
                            border: 'none', borderRadius: 999,
                            padding: '9px 20px', fontFamily: 'var(--font-barlow-condensed)',
                            fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.5px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                          }}
                        >
                          {isLoading && (
                            <span style={{
                              display: 'inline-block', width: 10, height: 10,
                              border: '2px solid rgba(255,255,255,0.5)',
                              borderTopColor: 'transparent',
                              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                            }} />
                          )}
                          {isLoading ? 'Importando...' : 'Importar'}
                        </button>
                      </div>

                      {status === 'error' && (
                        <div style={{
                          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
                          color: '#DC2626', borderRadius: 8,
                          padding: '10px 14px', fontSize: 12, marginTop: 12,
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
      <div style={{ minHeight: '100vh', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.08)', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <ImportarStravaContent />
    </Suspense>
  )
}
