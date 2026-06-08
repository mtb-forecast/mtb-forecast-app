'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PLANOS } from '@/lib/stripe-config'
import { supabase, getClientUser } from '@/lib/supabase'

const PLANO_ORDER = ['gratuito', 'plano_a', 'plano_b', 'plano_c'] as const

type PlanStat = { plano: string; total: number }

const PLANO_BAR_COLOR: Record<string, string> = {
  gratuito: '#d1d5db',
  plano_a:  '#60a5fa',
  plano_b:  '#2a2e25',
  plano_c:  '#a8b899',
}

export default function PlanosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)

  const [codigo, setCodigo] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoStatus, setPromoStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [stats, setStats] = useState<PlanStat[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      const user = await getClientUser()
      if (!user) { setProfileLoaded(true); return }
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      const admin = data?.is_admin ?? false
      setIsAdmin(admin)
      setProfileLoaded(true)

      if (admin) {
        setStatsLoading(true)
        const res = await fetch('/api/admin/planos-stats')
        if (res.ok) {
          const json = await res.json()
          setStats(json.stats ?? [])
        }
        setStatsLoading(false)
      }
    }
    loadProfile()
  }, [])

  async function handleCheckout(planoId: string) {
    if (planoId === 'gratuito') return
    setLoading(planoId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planoId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (res.status === 401) {
        router.push('/login')
      }
    } catch {
      // ignore
    } finally {
      setLoading(null)
    }
  }

  async function handlePromo(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) return
    setPromoLoading(true)
    setPromoStatus(null)
    try {
      const res = await fetch('/api/promo/resgatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPromoStatus({ type: 'error', msg: data.error || 'Erro ao resgatar.' })
      } else {
        const nomePlano = PLANOS[data.plano as keyof typeof PLANOS]?.nome ?? data.plano
        setPromoStatus({ type: 'success', msg: `Plano ${nomePlano} ativado com sucesso!` })
        setTimeout(() => window.location.reload(), 2000)
      }
    } catch {
      setPromoStatus({ type: 'error', msg: 'Erro de conexão. Tente novamente.' })
    } finally {
      setPromoLoading(false)
    }
  }

  const maxTotal = stats.length > 0 ? Math.max(...stats.map(s => s.total), 1) : 1

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Planos</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            Escolha o plano ideal para sua forma de pedalar
          </p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 32px' }}>

        {/* Badge admin */}
        {profileLoaded && isAdmin && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#2a2e25', color: '#a8b899',
            border: '1.5px solid #a8b899', borderRadius: 6,
            padding: '12px 20px', marginBottom: 32,
          }}>
            <span style={{ fontSize: 16 }}>★</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Acesso Admin — Full Access</p>
              <p style={{ fontSize: 12, color: '#aaa', margin: 0, marginTop: 2 }}>
                Sua conta tem acesso completo à plataforma.
              </p>
            </div>
          </div>
        )}

        {/* Cards de planos */}
        {profileLoaded && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
            }}>
              {PLANO_ORDER.map((planoId) => {
                const plano = PLANOS[planoId]
                const isPago = plano.preco > 0
                const isLoading = loading === planoId
                const emConstrucao = plano.em_construcao

                return (
                  <div
                    key={planoId}
                    style={{
                      background: '#fff',
                      border: planoId === 'plano_b' ? '2px solid #2a2e25' : '0.5px solid #e5e5e5',
                      borderRadius: 8,
                      padding: 24,
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      opacity: emConstrucao ? 0.5 : 1,
                    }}
                  >
                    {emConstrucao && (
                      <div style={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#6d745f',
                        border: 'none',
                        borderRadius: 20,
                        padding: '2px 12px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                      }}>
                        EM CONSTRUÇÃO
                      </div>
                    )}
                    {!emConstrucao && planoId === 'plano_b' && (
                      <div style={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#6d745f',
                        border: 'none',
                        borderRadius: 20,
                        padding: '2px 12px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                      }}>
                        MAIS POPULAR
                      </div>
                    )}

                    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>
                      {plano.nome}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                      {isPago ? (
                        <>
                          <span style={{ fontSize: 28, fontWeight: 700, color: '#2a2e25' }}>R${plano.preco}</span>
                          <span style={{ fontSize: 13, color: '#888' }}>/mês</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 28, fontWeight: 700, color: '#2a2e25' }}>Grátis</span>
                      )}
                    </div>

                    <p style={{ fontSize: 12, color: '#888', marginBottom: 20, lineHeight: 1.4 }}>
                      {plano.descricao}
                    </p>

                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                      {plano.features.map((f, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#555' }}>
                          <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>

                    {isPago && emConstrucao ? (
                      <button
                        disabled
                        style={{
                          background: '#e5e5e5',
                          color: '#999',
                          border: '1.5px solid #e5e5e5',
                          borderRadius: 4,
                          padding: '10px 16px',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        Em Construção
                      </button>
                    ) : isPago && !isAdmin ? (
                      <button
                        onClick={() => handleCheckout(planoId)}
                        disabled={isLoading}
                        style={{
                          background: planoId === 'plano_b' ? '#2a2e25' : '#fff',
                          color: planoId === 'plano_b' ? '#fff' : '#2a2e25',
                          border: '1.5px solid #2a2e25',
                          borderRadius: 4,
                          padding: '10px 16px',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        {isLoading && (
                          <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        )}
                        {isLoading ? 'Aguarde...' : 'Assinar agora'}
                      </button>
                    ) : !isPago ? (
                      <div style={{
                        textAlign: 'center',
                        fontSize: 13,
                        color: '#888',
                        padding: '10px 16px',
                        border: '0.5px solid #e5e5e5',
                        borderRadius: 4,
                      }}>
                        Plano atual
                      </div>
                    ) : (
                      <div style={{
                        textAlign: 'center',
                        fontSize: 13,
                        color: '#888',
                        padding: '10px 16px',
                        border: '0.5px solid #e5e5e5',
                        borderRadius: 4,
                      }}>
                        Incluído
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {!isAdmin && (
              <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 32 }}>
                Pagamento seguro via Stripe. Cancele a qualquer momento.
              </p>
            )}
          </>
        )}

        {/* Distribuição de usuários — admin only */}
        {profileLoaded && isAdmin && (
          <div style={{
            background: '#fff',
            border: '0.5px solid #e5e5e5',
            borderRadius: 8,
            padding: 24,
            marginTop: 32,
          }}>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 20 }}>
              Distribuição de Usuários
            </p>

            {statsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 13 }}>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Carregando...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {PLANO_ORDER.map((planoId) => {
                  const stat = stats.find(s => s.plano === planoId)
                  const total = stat?.total ?? 0
                  const pct = Math.round((total / maxTotal) * 100)
                  const color = PLANO_BAR_COLOR[planoId] ?? '#e5e5e5'
                  const labelColor = planoId === 'plano_c' ? '#2a2e25' : planoId === 'gratuito' ? '#555' : '#fff'

                  return (
                    <div key={planoId}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#555' }}>
                          {PLANOS[planoId].nome}
                        </span>
                        <span style={{ fontSize: 12, color: '#888' }}>
                          {total} {total === 1 ? 'usuário' : 'usuários'}
                        </span>
                      </div>
                      <div style={{ background: '#f3f4f6', borderRadius: 4, height: 28, overflow: 'hidden' }}>
                        <div style={{
                          width: total === 0 ? '2%' : `${Math.max(pct, 4)}%`,
                          height: '100%',
                          background: color,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: 10,
                          transition: 'width 0.4s ease',
                          minWidth: total === 0 ? 0 : 32,
                        }}>
                          {total > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: labelColor, whiteSpace: 'nowrap' }}>
                              {total}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                <p style={{ fontSize: 12, color: '#bbb', marginTop: 8 }}>
                  Total: {stats.reduce((s, r) => s + r.total, 0)} usuários cadastrados
                </p>
              </div>
            )}
          </div>
        )}

        {/* Seção de código promocional */}
        <div style={{
          background: '#fff',
          border: '0.5px solid #e5e5e5',
          borderRadius: 8,
          padding: 24,
          marginTop: 32,
        }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 16 }}>
            Código promocional
          </p>

          <form onSubmit={handlePromo} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              placeholder="Digite seu código promocional"
              className="input-field"
              style={{ flex: 1, minWidth: 200, fontSize: 13, textTransform: 'uppercase' }}
            />
            <button
              type="submit"
              disabled={promoLoading || !codigo.trim()}
              style={{
                background: '#2a2e25',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 500,
                cursor: promoLoading || !codigo.trim() ? 'not-allowed' : 'pointer',
                opacity: promoLoading || !codigo.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
              }}
            >
              {promoLoading && (
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              )}
              {promoLoading ? 'Aguarde...' : 'Resgatar'}
            </button>
          </form>

          {promoStatus && (
            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 4,
              fontSize: 13,
              background: promoStatus.type === 'success' ? '#dcfce7' : '#fee2e2',
              border: `1px solid ${promoStatus.type === 'success' ? '#86efac' : '#fca5a5'}`,
              color: promoStatus.type === 'success' ? '#166534' : '#991b1b',
            }}>
              {promoStatus.msg}
            </div>
          )}
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
