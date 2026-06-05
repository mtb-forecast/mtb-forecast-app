'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  pendente:  { bg: '#fef9c3', color: '#854d0e', label: 'Pendente' },
  aprovada:  { bg: '#dcfce7', color: '#166534', label: 'Aprovada' },
  rejeitada: { bg: '#fee2e2', color: '#991b1b', label: 'Rejeitada' },
}

export default function MinhasTrilhasPage() {
  const router = useRouter()
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
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Link href="/perfil" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#888', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}>
            ← Voltar ao perfil
          </Link>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Trilhas que cadastrei</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>{trilhas.length} trilha{trilhas.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>
        {trilhas.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>Você ainda não cadastrou nenhuma trilha.</p>
            <Link
              href="/trilhas/cadastrar"
              style={{
                display: 'inline-block', background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '10px 20px', fontSize: 14, fontWeight: 500, textDecoration: 'none',
              }}
            >
              Cadastrar trilha →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trilhas.map(t => {
              const cfg = STATUS[t.status] ?? STATUS.pendente
              return (
                <div key={t.id} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{t.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, borderRadius: 2, padding: '3px 8px', background: cfg.bg, color: cfg.color, flexShrink: 0 }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {t.regiao} · {new Date(t.created_at).toLocaleDateString('pt-BR')}
                  </p>
                  {t.status === 'rejeitada' && t.motivo_rejeicao && (
                    <p style={{ fontSize: 12, color: '#991b1b', marginTop: 8, background: '#fee2e2', borderRadius: 4, padding: '8px 12px' }}>
                      Motivo: {t.motivo_rejeicao}
                    </p>
                  )}
                </div>
              )
            })}

            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Link
                href="/trilhas/cadastrar"
                style={{ fontSize: 13, color: '#111', fontWeight: 500, borderBottom: '1px solid #111', textDecoration: 'none' }}
              >
                + Cadastrar nova trilha
              </Link>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
