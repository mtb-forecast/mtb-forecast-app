'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PLANOS } from '@/lib/stripe-config'

const PLANO_ORDER = ['gratuito', 'plano_a', 'plano_b', 'plano_c'] as const

export default function PlanosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

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

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* Header */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Planos</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            Escolha o plano ideal para sua forma de pedalar
          </p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* Cards */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
        }}>
          {PLANO_ORDER.map((planoId) => {
            const plano = PLANOS[planoId]
            const isPago = plano.preco > 0
            const isLoading = loading === planoId

            return (
              <div
                key={planoId}
                style={{
                  background: '#fff',
                  border: planoId === 'plano_b' ? '2px solid #111' : '0.5px solid #e5e5e5',
                  borderRadius: 8,
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {planoId === 'plano_b' && (
                  <div style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#FFE000',
                    border: '1.5px solid #111',
                    borderRadius: 20,
                    padding: '2px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#111',
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
                      <span style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>R${plano.preco}</span>
                      <span style={{ fontSize: 13, color: '#888' }}>/mês</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 28, fontWeight: 700, color: '#111' }}>Grátis</span>
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

                {isPago ? (
                  <button
                    onClick={() => handleCheckout(planoId)}
                    disabled={isLoading}
                    style={{
                      background: planoId === 'plano_b' ? '#111' : '#fff',
                      color: planoId === 'plano_b' ? '#fff' : '#111',
                      border: '1.5px solid #111',
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
                ) : (
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
                )}
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 32 }}>
          Pagamento seguro via Stripe. Cancele a qualquer momento.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
