'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const StravaMap = dynamic(() => import('@/components/StravaMap'), { ssr: false })

type StravaRoute = {
  id: number
  name: string
  distance_km: number
  desnivel_m: number
  lat: number | null
  lon: number | null
  polyline: string | null
}

type ImportStatus = 'idle' | 'loading' | 'success' | 'error'

function ImportarStravaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [routes, setRoutes] = useState<StravaRoute[]>([])
  const [fetchError, setFetchError] = useState<'rate_limit' | 'generic' | null>(null)
  const [importStatus, setImportStatus] = useState<Record<number, ImportStatus>>({})
  const [importError, setImportError] = useState<Record<number, string>>({})

  const erroParam = searchParams.get('erro')

  const stravaAuthUrl =
    `https://www.strava.com/oauth/authorize` +
    `?client_id=${process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_STRAVA_REDIRECT_URI ?? '')}` +
    `&response_type=code&scope=read,activity:read_all`

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
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
        router.replace('/login')
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

      const data: StravaRoute[] = await res.json()
      setHasToken(true)
      setRoutes(data)
      setLoading(false)
    }
    init()
  }, [router])

  async function importarRota(rota: StravaRoute) {
    if (!userId) return
    setImportStatus(s => ({ ...s, [rota.id]: 'loading' }))
    setImportError(e => ({ ...e, [rota.id]: '' }))

    const { error } = await supabase.from('trilhas_pendentes').insert({
      name: rota.name,
      lat: rota.lat,
      lon: rota.lon,
      polyline: rota.polyline,
      extensao_km: rota.distance_km,
      desnivel_m: rota.desnivel_m,
      user_id: userId,
      status: 'pendente',
      // Campos obrigatórios preenchidos pelo admin na aprovação
      solo_type: null,
      exposicao: null,
      altitude_m: null,
      trail_type: null,
      regiao: null,
    })

    if (error) {
      setImportStatus(s => ({ ...s, [rota.id]: 'error' }))
      setImportError(e => ({ ...e, [rota.id]: error.message }))
    } else {
      setImportStatus(s => ({ ...s, [rota.id]: 'success' }))
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* Header */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link
            href="/admin"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 20, textDecoration: 'none' }}
          >
            ← Painel Admin
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
              ? `${routes.length} rota${routes.length !== 1 ? 's' : ''} encontrada${routes.length !== 1 ? 's' : ''} no Strava`
              : 'Conecte seu Strava para importar rotas como trilhas pendentes'}
          </p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

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
            Erro ao buscar rotas do Strava. Tente novamente ou reconecte sua conta.
          </div>
        )}

        {/* Sem token → botão de conexão */}
        {!hasToken && !fetchError && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 56, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111', marginBottom: 8 }}>Conectar com Strava</h2>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 32, maxWidth: 420, margin: '0 auto 32px' }}>
              Conecte sua conta Strava para importar suas rotas como trilhas pendentes de aprovação no MTB Forecaster.
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

        {/* Sem rotas */}
        {hasToken && routes.length === 0 && !fetchError && (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#888' }}>Nenhuma rota encontrada na sua conta Strava.</p>
            <p style={{ fontSize: 12, color: '#bbb', marginTop: 8 }}>
              Crie rotas no Strava para importá-las aqui.
            </p>
          </div>
        )}

        {/* Lista de rotas */}
        {hasToken && routes.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Suas rotas no Strava</h2>
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: '#f7f7f5', color: '#888',
                border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 8px',
              }}>
                {routes.length} rota{routes.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {routes.map(rota => {
                const status = importStatus[rota.id] ?? 'idle'
                const errMsg = importError[rota.id]

                return (
                  <div
                    key={rota.id}
                    style={{
                      background: '#fff',
                      border: status === 'success' ? '1px solid #86efac' : '0.5px solid #e5e5e5',
                      borderRadius: 8, overflow: 'hidden',
                    }}
                  >
                    {/* Preview do mapa */}
                    {rota.polyline && (
                      <StravaMap polyline={rota.polyline} />
                    )}

                    <div style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: status === 'error' ? 12 : 0 }}>
                        <div>
                          <p style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{rota.name}</p>
                          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                            {rota.distance_km > 0 && (
                              <span style={{ fontSize: 12, color: '#888' }}>📏 {rota.distance_km} km</span>
                            )}
                            {rota.desnivel_m > 0 && (
                              <span style={{ fontSize: 12, color: '#888' }}>⛰ {rota.desnivel_m} m desnível</span>
                            )}
                            {!rota.polyline && (
                              <span style={{ fontSize: 12, color: '#bbb' }}>sem polyline</span>
                            )}
                          </div>
                        </div>

                        {status === 'success' ? (
                          <span style={{
                            fontSize: 12, fontWeight: 500,
                            background: '#dcfce7', color: '#166534',
                            borderRadius: 4, padding: '6px 14px', flexShrink: 0,
                          }}>
                            ✓ Importada
                          </span>
                        ) : (
                          <button
                            onClick={() => importarRota(rota)}
                            disabled={status === 'loading'}
                            style={{
                              background: '#FFE000', color: '#111',
                              border: '1.5px solid #111', borderRadius: 4,
                              padding: '8px 20px', fontSize: 13, fontWeight: 500,
                              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                              opacity: status === 'loading' ? 0.7 : 1,
                              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                            }}
                          >
                            {status === 'loading' && (
                              <span style={{
                                display: 'inline-block', width: 10, height: 10,
                                border: '2px solid #111', borderTopColor: 'transparent',
                                borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                              }} />
                            )}
                            {status === 'loading' ? 'Importando...' : 'Importar'}
                          </button>
                        )}
                      </div>

                      {status === 'error' && (
                        <div style={{
                          background: '#fee2e2', border: '1px solid #fca5a5',
                          color: '#991b1b', borderRadius: 4,
                          padding: '8px 12px', fontSize: 12,
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
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <ImportarStravaContent />
    </Suspense>
  )
}
