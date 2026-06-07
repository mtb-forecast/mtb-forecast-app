'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'

type TrilhaPendente = {
  id: string
  name: string
  regiao: string
  status: string
  motivo_rejeicao?: string | null
  created_at: string
}

const STATUS_CFG: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  pendente:  { bg: 'rgba(251,191,36,0.12)', color: '#f59e0b', dot: '#f59e0b', label: 'Aguardando revisão' },
  aprovada:  { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', dot: '#4ade80', label: 'Aprovada' },
  rejeitada: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', dot: '#f87171', label: 'Rejeitada' },
}

const T = {
  bg: '#0b0b0b', card: '#141414', card2: '#1c1c1c',
  border: '#252525', primary: '#f4c542', text: '#ffffff', muted: '#8b8b8b',
}

export default function MinhasTrilhasPage() {
  const [trilhas, setTrilhas] = useState<TrilhaPendente[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      const { data } = await supabase
        .from('trilhas_pendentes')
        .select('id, name, regiao, status, motivo_rejeicao, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (data) setTrilhas(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ padding: '20px 16px 0', maxWidth: 640, margin: '0 auto' }}>
        <Link href="/perfil" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.muted, fontSize: 13, textDecoration: 'none', marginBottom: 20 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />
          Perfil
        </Link>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: T.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
            Minhas trilhas
          </h1>
          <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
            {trilhas.length} trilha{trilhas.length !== 1 ? 's' : ''} submetida{trilhas.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 16px 80px', maxWidth: 640, margin: '0 auto' }}>
        {trilhas.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-map-pin" style={{ fontSize: 24, color: T.muted }} />
            </div>
            <p style={{ fontSize: 15, color: T.text, fontWeight: 600, margin: '0 0 8px' }}>Nenhuma trilha cadastrada</p>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 24px' }}>Compartilhe suas trilhas favoritas com a comunidade MTB.</p>
            <Link href="/trilhas/cadastrar" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: T.primary, color: '#000', borderRadius: 14,
              padding: '12px 24px', fontSize: 14, fontWeight: 800, textDecoration: 'none',
            }}>
              <i className="ti ti-plus" style={{ fontSize: 16 }} />
              Cadastrar trilha
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {trilhas.map(t => {
              const cfg = STATUS_CFG[t.status] ?? STATUS_CFG.pendente
              const canEdit = t.status !== 'aprovada'

              return (
                <div key={t.id} style={{
                  background: T.card, border: `1px solid ${T.border}`,
                  borderRadius: 20, overflow: 'hidden',
                }}>
                  <div style={{ padding: '16px 20px' }}>
                    {/* Top row: name + status badge */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{t.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: cfg.bg, borderRadius: 20, padding: '4px 10px' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                      </div>
                    </div>

                    {/* Meta */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: canEdit ? 14 : 0 }}>
                      <span style={{ fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className="ti ti-map-pin" style={{ fontSize: 12 }} />
                        {t.regiao}
                      </span>
                      <span style={{ fontSize: 12, color: T.muted }}>
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    {/* Rejection reason */}
                    {t.status === 'rejeitada' && t.motivo_rejeicao && (
                      <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: canEdit ? 14 : 0 }}>
                        <p style={{ fontSize: 12, color: '#f87171', margin: 0, lineHeight: 1.6 }}>
                          <strong>Motivo:</strong> {t.motivo_rejeicao}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {canEdit && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/trilhas/editar/${t.id}`} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: '#232323', color: T.text,
                          borderRadius: 10, padding: '8px 16px',
                          fontSize: 13, fontWeight: 600, textDecoration: 'none',
                          border: `1px solid ${T.border}`,
                          transition: 'background 0.15s',
                        }}>
                          <i className="ti ti-pencil" style={{ fontSize: 14, color: T.primary }} />
                          Editar
                        </Link>
                      </div>
                    )}

                    {t.status === 'aprovada' && (
                      <p style={{ fontSize: 11, color: T.muted, margin: '10px 0 0', fontStyle: 'italic' }}>
                        Trilhas aprovadas não podem ser editadas. Entre em contato com o suporte se necessário.
                      </p>
                    )}
                  </div>
                </div>
              )
            })}

            {/* CTA */}
            <Link href="/trilhas/cadastrar" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'transparent', border: `1px dashed ${T.border}`, borderRadius: 16,
              padding: '16px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
              color: T.muted, marginTop: 4, transition: 'border-color 0.15s, color 0.15s',
            }}>
              <i className="ti ti-plus" style={{ fontSize: 16 }} />
              Cadastrar nova trilha
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
