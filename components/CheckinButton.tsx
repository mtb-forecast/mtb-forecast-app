'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { IconClipboardCheck, IconX, IconChevronRight, IconMapPin } from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'
import { formatLocalidade } from '@/lib/geocoding'

const HIDDEN_ON = ['/', '/login', '/cadastro']

const CONDICOES: { value: string; label: string; bg: string; color: string }[] = [
  { value: 'seco',  label: 'Seco',            bg: '#e0f2fe', color: '#0369a1' },
  { value: 'grip',  label: 'Grip Perfeito',   bg: '#dcfce7', color: '#166534' },
  { value: 'boa',   label: 'Boa Aderência',   bg: '#d1fae5', color: '#065f46' },
  { value: 'baixa', label: 'Baixa Aderência', bg: '#fef9c3', color: '#854d0e' },
  { value: 'lama',  label: 'Lama / Barro',    bg: '#fee2e2', color: '#991b1b' },
]

type TrilhaFavorita = {
  id: string
  name: string
  regiao: string | null
  localidades: { cidade: string; estado: string; localidade: string | null } | null
}

type Step = 'lista' | 'form'

export default function CheckinButton() {
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('lista')
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [trilhas, setTrilhas] = useState<TrilhaFavorita[]>([])
  const [selecionada, setSelecionada] = useState<TrilhaFavorita | null>(null)
  const [condicao, setCondicao] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const carregarFavoritas = useCallback(async () => {
    const user = await getClientUser()
    if (!user) return
    setUserId(user.id)
    setLoading(true)

    const { data: favRows } = await supabase
      .from('favoritos')
      .select('trilha_id')
      .eq('user_id', user.id)
    const ids = (favRows ?? []).map((f: { trilha_id: string }) => f.trilha_id)

    if (ids.length === 0) {
      setTrilhas([])
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('trilhas')
      .select('id, name, regiao, localidades(cidade, estado, localidade)')
      .in('id', ids)
    setTrilhas((data as unknown as TrilhaFavorita[]) ?? [])
    setLoading(false)
  }, [])

  function abrir() {
    setOpen(true)
    setStep('lista')
    setSelecionada(null)
    setCondicao(null)
    setTexto('')
    setError(null)
    setSuccess(false)
    carregarFavoritas()
  }

  function fechar() {
    setOpen(false)
  }

  function selecionar(t: TrilhaFavorita) {
    setSelecionada(t)
    setStep('form')
  }

  async function publicar() {
    if (!userId || !selecionada || !condicao || !texto.trim() || texto.length > 150) return
    setPublishing(true)
    setError(null)
    const { error: err } = await supabase.from('observacoes_trilha').insert({
      trilha_id: selecionada.id,
      user_id: userId,
      condicao_encontrada: condicao,
      texto: texto.trim(),
      estrelas: 3,
    })
    setPublishing(false)
    if (err) {
      setError(err.message)
      return
    }
    setSuccess(true)
    setTimeout(fechar, 1400)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  if (!pathname) return null
  if (HIDDEN_ON.some(p => pathname === p || pathname.startsWith(p + '/'))) return null
  if (pathname.startsWith('/t/')) return null

  const canPublish = !!condicao && texto.trim().length > 0 && texto.length <= 150

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Check-in rápido"
        style={{
          position: 'fixed', bottom: 80, right: 16, zIndex: 1500,
          width: 52, height: 52, borderRadius: '50%',
          background: '#a8b899', color: '#1e2018',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)', cursor: 'pointer',
        }}
      >
        <IconClipboardCheck size={24} stroke={2} />
      </button>

      {open && (
        <>
          <style>{`@keyframes ckin-slide { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>

          <div
            onClick={fechar}
            style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
          />

          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 2001,
            background: '#fff', borderRadius: '20px 20px 0 0',
            maxHeight: '82vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -12px 60px rgba(0,0,0,0.18)',
            animation: 'ckin-slide 0.28s cubic-bezier(.32,.72,0,1)',
          }}>
            <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 999, background: '#D1D5DB' }} />
            </div>

            <div style={{ padding: '8px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>
                {step === 'lista' ? 'Check-in rápido' : selecionada?.name}
              </div>
              <button
                onClick={fechar}
                style={{
                  background: '#F3F4F6', border: 'none', borderRadius: '50%',
                  width: 34, height: 34, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#6B7280', flexShrink: 0,
                }}
              >
                <IconX size={16} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '0 20px 24px' }}>
              {step === 'lista' && (
                <>
                  {loading && (
                    <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>Carregando...</p>
                  )}
                  {!loading && trilhas.length === 0 && (
                    <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>
                      Você ainda não favoritou nenhuma trilha.
                    </p>
                  )}
                  {!loading && trilhas.map(t => (
                    <button
                      key={t.id}
                      onClick={() => selecionar(t)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 10, padding: '12px 14px', marginBottom: 8, borderRadius: 10,
                        background: '#F9FAFB', border: '1px solid #F0F0F0', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1D18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <IconMapPin size={10} />
                          {formatLocalidade(t.localidades, t.regiao ?? undefined)}
                        </div>
                      </div>
                      <IconChevronRight size={16} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                    </button>
                  ))}
                </>
              )}

              {step === 'form' && selecionada && (
                <>
                  {success ? (
                    <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '12px 14px', fontSize: 13, textAlign: 'center' }}>
                      Check-in publicado!
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '1.5px', color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>
                        Como está a trilha?
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {CONDICOES.map(c => (
                          <button
                            key={c.value}
                            onClick={() => setCondicao(condicao === c.value ? null : c.value)}
                            style={{
                              fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 10, cursor: 'pointer',
                              border: `1.5px solid ${condicao === c.value ? c.color : '#e5e5e5'}`,
                              background: condicao === c.value ? c.bg : '#fff',
                              color: condicao === c.value ? c.color : '#888',
                            }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        maxLength={150}
                        placeholder="Observação rápida (ex: rock garden ainda molhado na entrada)..."
                        style={{
                          width: '100%', border: '1px solid #e5e5e5', borderRadius: 8,
                          padding: '10px 12px', fontSize: 13, minHeight: 72,
                          resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', color: '#2a2e25',
                        }}
                      />
                      <div style={{ textAlign: 'right', fontSize: 11, color: texto.length > 130 ? '#ef4444' : '#888', marginTop: 2, marginBottom: 12 }}>
                        {texto.length}/150
                      </div>

                      {error && (
                        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12 }}>
                          Erro ao publicar: {error}
                        </div>
                      )}

                      <button
                        onClick={publicar}
                        disabled={!canPublish || publishing}
                        style={{
                          width: '100%', background: '#6d745f', color: '#fff',
                          border: 'none', borderRadius: 8, padding: '12px 18px', fontSize: 14, fontWeight: 600,
                          cursor: canPublish && !publishing ? 'pointer' : 'not-allowed',
                          opacity: canPublish && !publishing ? 1 : 0.5,
                        }}
                      >
                        {publishing ? 'Publicando...' : 'Publicar check-in'}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
