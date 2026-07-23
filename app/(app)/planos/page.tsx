'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconShieldCheck, IconCircleCheck } from '@tabler/icons-react'
import { PLANOS } from '@/lib/stripe-config'
import { supabase, getClientUser } from '@/lib/supabase'

const PLANO_ORDER = ['plano_a', 'plano_b', 'plano_c'] as const

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='900' height='400' viewBox='0 0 900 400'>
  <g fill='none' stroke='%236d745f' stroke-opacity='.15' stroke-width='1.3'>
    <path d='M700,60 C800,90 860,160 850,240 C840,320 770,360 690,350 C610,340 560,290 570,220 C580,150 630,80 700,60 Z'/>
    <path d='M700,20 C820,50 900,140 885,240 C870,340 780,395 690,382 C600,370 540,305 552,220 C565,135 620,-10 700,20 Z'/>
    <path d='M700,95 C770,115 815,165 808,225 C800,285 750,315 690,308 C630,300 592,262 599,215 C606,168 645,80 700,95 Z'/>
  </g>
</svg>
`.replace(/\s+/g, ' ').trim()

const TOPO_DATA_URI = `url("data:image/svg+xml,${encodeURIComponent(TOPO_SVG)}")`

const input: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#1A1D18', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}

export default function PlanosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)

  const [codigo, setCodigo] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoStatus, setPromoStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    async function loadProfile() {
      const user = await getClientUser()
      if (!user) { setProfileLoaded(true); return }
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      setIsAdmin(data?.is_admin ?? false)
      setProfileLoaded(true)
    }
    loadProfile()
  }, [])

  async function handleCheckout(planoId: string) {
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

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>

      {/* Header */}
      <div style={{ position: 'relative', overflow: 'hidden', background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '28px 32px' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: TOPO_DATA_URI, backgroundSize: 'cover', backgroundPosition: 'right center',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto' }}>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 38px)', textTransform: 'uppercase',
            color: '#F4F3EF', lineHeight: 0.95, margin: 0,
          }}>
            Planos
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8 }}>
            Escolha o plano ideal para sua forma de pedalar
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 32px 48px' }}>

        {/* Badge admin */}
        {profileLoaded && isAdmin && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(109,116,95,.12)', color: '#6d745f',
            border: '1px solid rgba(109,116,95,.3)', borderRadius: 10,
            padding: '12px 18px', marginBottom: 28,
          }}>
            <IconShieldCheck size={18} color="#6d745f" />
            <div>
              <p style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 14,
                textTransform: 'uppercase', color: '#1A1D18', margin: 0,
              }}>
                Acesso Admin — Full Access
              </p>
              <p style={{ fontSize: 12, color: '#6d745f', margin: '2px 0 0' }}>
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
                      background: '#FFFFFF',
                      border: planoId === 'plano_b' ? '2px solid #1A1D18' : '1px solid rgba(0,0,0,.07)',
                      borderRadius: 14,
                      padding: 24,
                      boxShadow: '0 2px 8px rgba(0,0,0,.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      opacity: emConstrucao ? 0.5 : 1,
                    }}
                  >
                    {emConstrucao && (
                      <div style={{
                        position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                        background: '#1A1D18', color: '#F4F3EF', borderRadius: 999,
                        padding: '2px 12px', fontFamily: 'var(--font-barlow-condensed)',
                        fontWeight: 700, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap',
                      }}>
                        EM CONSTRUÇÃO
                      </div>
                    )}
                    {!emConstrucao && planoId === 'plano_b' && (
                      <div style={{
                        position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                        background: '#1A1D18', color: '#F4F3EF', borderRadius: 999,
                        padding: '2px 12px', fontFamily: 'var(--font-barlow-condensed)',
                        fontWeight: 700, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap',
                      }}>
                        MAIS POPULAR
                      </div>
                    )}

                    <p style={{
                      fontFamily: 'var(--font-dm-mono)', fontSize: 10, letterSpacing: '1.5px',
                      color: '#9AA093', textTransform: 'uppercase', marginBottom: 8,
                    }}>
                      {plano.nome}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                      {isPago ? (
                        <>
                          <span style={{ fontFamily: 'var(--font-barlow-condensed)', fontSize: 28, fontWeight: 800, color: '#1A1D18' }}>R${plano.preco}</span>
                          <span style={{ fontSize: 13, color: '#9AA093' }}>/mês</span>
                        </>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-barlow-condensed)', fontSize: 28, fontWeight: 800, color: '#1A1D18' }}>Grátis</span>
                      )}
                    </div>

                    <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 20, lineHeight: 1.5 }}>
                      {plano.descricao}
                    </p>

                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                      {plano.features.map((f, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#6B7280' }}>
                          <IconCircleCheck size={14} color="#22C55E" style={{ flexShrink: 0, marginTop: 2 }} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {isPago && emConstrucao ? (
                      <button
                        disabled
                        style={{
                          background: 'rgba(0,0,0,.06)', color: '#9AA093', border: 'none',
                          borderRadius: 999, padding: '11px 18px',
                          fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 15,
                          textTransform: 'uppercase', letterSpacing: '.5px',
                          cursor: 'not-allowed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        Em Construção
                      </button>
                    ) : isPago && !isAdmin ? (
                      <button
                        onClick={() => handleCheckout(planoId)}
                        disabled={isLoading}
                        style={{
                          background: planoId === 'plano_b' ? '#1A1D18' : 'transparent',
                          color: planoId === 'plano_b' ? '#F4F3EF' : '#1A1D18',
                          border: planoId === 'plano_b' ? 'none' : '1.5px solid rgba(0,0,0,.2)',
                          borderRadius: 999, padding: '11px 18px',
                          fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 15,
                          textTransform: 'uppercase', letterSpacing: '.5px',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.7 : 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        {isLoading && (
                          <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        )}
                        {isLoading ? 'Aguarde...' : 'Assinar agora'}
                      </button>
                    ) : !isPago ? (
                      <div style={{
                        textAlign: 'center', fontSize: 13, color: '#9AA093',
                        padding: '11px 18px', border: '1px solid rgba(0,0,0,.08)', borderRadius: 999,
                      }}>
                        Plano atual
                      </div>
                    ) : (
                      <div style={{
                        textAlign: 'center', fontSize: 13, color: '#9AA093',
                        padding: '11px 18px', border: '1px solid rgba(0,0,0,.08)', borderRadius: 999,
                      }}>
                        Incluído
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {!isAdmin && (
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093', textAlign: 'center', marginTop: 28 }}>
                Pagamento seguro via Stripe. Cancele a qualquer momento.
              </p>
            )}
          </>
        )}

        {/* Seção de código promocional */}
        <div style={{
          background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)',
          borderRadius: 14, padding: 24, marginTop: 28,
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 10, letterSpacing: '1.5px',
            color: '#9AA093', textTransform: 'uppercase', marginBottom: 14,
          }}>
            Código promocional
          </p>

          <form onSubmit={handlePromo} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              placeholder="Digite seu código promocional"
              style={{ ...input, flex: 1, minWidth: 200, textTransform: 'uppercase' }}
            />
            <button
              type="submit"
              disabled={promoLoading || !codigo.trim()}
              style={{
                background: (promoLoading || !codigo.trim()) ? 'rgba(0,0,0,.08)' : '#1A1D18',
                color: (promoLoading || !codigo.trim()) ? '#9AA093' : '#F4F3EF',
                border: 'none', borderRadius: 999,
                padding: '10px 20px', fontFamily: 'var(--font-barlow-condensed)',
                fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '.5px',
                cursor: promoLoading || !codigo.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              }}
            >
              {promoLoading && (
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              )}
              {promoLoading ? 'Aguarde...' : 'Resgatar'}
            </button>
          </form>

          {promoStatus && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: promoStatus.type === 'success' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
              border: `1px solid ${promoStatus.type === 'success' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
              color: promoStatus.type === 'success' ? '#166534' : '#DC2626',
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
