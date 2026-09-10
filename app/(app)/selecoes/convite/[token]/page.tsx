'use client'

import { useEffect, useState, use as usePromise } from 'react'
import Link from 'next/link'
import { IconCalendarEvent } from '@tabler/icons-react'
import { getClientUser } from '@/lib/supabase'

const T = {
  bg: '#F5F6F2', card: '#FFFFFF', border: 'rgba(0,0,0,.08)',
  primary: '#6d745f', text: '#1A1D18', muted: '#6d745f',
}

type Preview = { selecao_id: string; nome: string; data: string }

export default function ConviteSelecaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params)
  const [logado, setLogado] = useState<boolean | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aceitando, setAceitando] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getClientUser()
      setLogado(!!user)

      const res = await fetch(`/api/selecoes/convite/${token}`)
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Convite inválido'); return }
      setPreview(json)
    }
    init()
  }, [token])

  async function aceitar() {
    setAceitando(true)
    const res = await fetch(`/api/selecoes/convite/${token}/aceitar`, { method: 'POST' })
    const json = await res.json()
    setAceitando(false)
    if (!res.ok) { setErro(json.error || 'Erro ao aceitar convite'); return }
    window.location.href = `/selecoes/${json.selecao_id}`
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 32, maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: '#F8F9F5',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <IconCalendarEvent size={24} style={{ color: T.primary }} />
        </div>

        {erro ? (
          <p style={{ fontSize: 14, color: '#EF4444' }}>{erro}</p>
        ) : !preview ? (
          <p style={{ fontSize: 13, color: T.muted }}>Carregando convite…</p>
        ) : (
          <>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 6px' }}>Você foi convidado(a) pra</p>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: '0 0 6px' }}>{preview.nome}</h1>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 24px' }}>
              {new Date(preview.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
            </p>

            {logado === null ? null : logado ? (
              <button onClick={aceitar} disabled={aceitando} style={{
                width: '100%', background: T.primary, color: '#fff', border: 'none', borderRadius: 14,
                padding: 14, fontSize: 15, fontWeight: 700, cursor: aceitando ? 'not-allowed' : 'pointer',
              }}>
                {aceitando ? 'Entrando…' : 'Entrar na seleção'}
              </button>
            ) : (
              <>
                <p style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
                  Entre ou crie sua conta e volte a abrir este link pra confirmar.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/login?next=/selecoes/convite/${token}`} style={{
                    flex: 1, background: T.primary, color: '#fff', borderRadius: 12,
                    padding: '12px 16px', fontSize: 14, fontWeight: 700, textDecoration: 'none',
                  }}>
                    Entrar
                  </Link>
                  <Link href={`/cadastro?next=/selecoes/convite/${token}`} style={{
                    flex: 1, background: '#F8F9F5', color: T.text, border: `1px solid ${T.border}`,
                    borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 700, textDecoration: 'none',
                  }}>
                    Criar conta
                  </Link>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
