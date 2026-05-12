'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Profile, Trilha, REGIOES } from '@/lib/types'

type TrilhaPendenteSimples = {
  id: string
  name: string
  regiao: string
  status: string
  motivo_rejeicao?: string | null
  created_at: string
}

type TrilhaPessoal = {
  id: string
  name: string
  regiao: string
  strava_url: string
  strava_segment_id: number
}

function StravaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 16 }}>
      {children}
    </p>
  )
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (!d) return ''
  if (d.length <= 2) return '+' + d
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
}

export default function PerfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [minhasTrilhas, setMinhasTrilhas] = useState<TrilhaPendenteSimples[]>([])
  const [trilhasFavoritas, setTrilhasFavoritas] = useState<Trilha[]>([])
  const [trilhasPessoais, setTrilhasPessoais] = useState<TrilhaPessoal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [telefone, setTelefone] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(true)
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()

      if (profileData) {
        setProfile(profileData)
        setNome(profileData.nome || '')
        setApelido(profileData.apelido || '')
        setTelefone(profileData.telefone || '')
        setTelefoneWhatsapp(profileData.telefone_whatsapp ?? true)
        setRegiao(profileData.regiao || '')
        setTelegram(profileData.telegram_username || '')
      }

      const [{ data: minhas }, { data: favIds }, { data: pessoais }] = await Promise.all([
        supabase.from('trilhas_pendentes')
          .select('id, name, regiao, status, motivo_rejeicao, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
        supabase.from('trilhas_pessoais')
          .select('id, name, regiao, strava_url, strava_segment_id')
          .eq('user_id', user.id)
          .order('name'),
      ])

      if (minhas) setMinhasTrilhas(minhas)
      if (pessoais) setTrilhasPessoais(pessoais)

      if (favIds && favIds.length > 0) {
        const ids = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const { data: favTrilhas } = await supabase
          .from('trilhas').select('*').in('id', ids).eq('aprovada', true)
        if (favTrilhas) setTrilhasFavoritas(favTrilhas)
      }

      setLoading(false)
    }
    load()
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setSaveStatus('idle')
    const { error } = await supabase.from('profiles')
      .update({
        nome,
        apelido,
        telefone,
        telefone_whatsapp: telefoneWhatsapp,
        regiao,
        telegram_username: telegram || null,
      })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      setSaveStatus('error')
    } else {
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  async function handleDeletePessoal(id: string) {
    setDeletingId(id)
    await supabase.from('trilhas_pessoais').delete().eq('id', id)
    setTrilhasPessoais(prev => prev.filter(t => t.id !== id))
    setDeletingId(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const slotsUsados = trilhasPessoais.length
  const slotsLimite = 3
  const stravaLleno = slotsUsados >= slotsLimite

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Perfil</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            {profile?.apelido || profile?.nome || profile?.email || 'Minha conta'}
          </p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto' }}>

        {/* Dados pessoais */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 16 }}>
          <SectionLabel>Dados pessoais</SectionLabel>

          {saveStatus === 'success' && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              Perfil atualizado!
            </div>
          )}
          {saveStatus === 'error' && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              Erro ao salvar. Tente novamente.
            </div>
          )}

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Email — read-only */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                E-mail
                <span style={{ marginLeft: 6, fontSize: 11 }}>🔒</span>
              </label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="input-field"
                style={{ background: '#f7f7f5', color: '#888', cursor: 'not-allowed' }}
              />
            </div>

            {/* Nome + Apelido — grid 2 col */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                  Nome completo
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="input-field"
                  style={{ fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                  Apelido
                </label>
                <input
                  type="text"
                  value={apelido}
                  onChange={e => setApelido(e.target.value)}
                  placeholder="Exibido no app"
                  className="input-field"
                  style={{ fontSize: 13 }}
                />
                <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>Exibido no app</p>
              </div>
            </div>

            {/* Telefone */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Telefone / WhatsApp
              </label>
              <input
                type="tel"
                value={telefone}
                onChange={e => setTelefone(formatPhone(e.target.value))}
                placeholder="+55 (11) 99999-9999"
                className="input-field"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={telefoneWhatsapp}
                  onChange={e => setTelefoneWhatsapp(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#111' }}
                />
                <span style={{ fontSize: 13, color: '#555' }}>Este número tem WhatsApp</span>
              </label>
            </div>

            {/* Região */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Região</label>
              <select value={regiao} onChange={e => setRegiao(e.target.value)} className="input-field">
                <option value="">Selecione</option>
                {REGIOES.map(r => <option key={r} value={r}>{r === 'outros' ? 'Outros' : r}</option>)}
              </select>
            </div>

            {/* Telegram */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Telegram <span style={{ color: '#bbb' }}>(opcional)</span>
              </label>
              <input
                type="text"
                value={telegram}
                onChange={e => {
                  const v = e.target.value
                  setTelegram(v && !v.startsWith('@') ? '@' + v : v)
                }}
                placeholder="@seu_username"
                className="input-field"
              />
            </div>

            {/* Salvar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: '#FFE000', color: '#111',
                  border: '1.5px solid #111', borderRadius: 4,
                  padding: '10px 24px', fontSize: 14, fontWeight: 500,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {saving && (
                  <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #111', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                )}
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>

        {/* Trilhas do Strava */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <SectionLabel>Trilhas do Strava</SectionLabel>
            <span style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>{slotsUsados} de {slotsLimite}</span>
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            Importe segmentos favoritos do Strava para receber previsões personalizadas.
          </p>

          <div style={{ marginBottom: 16 }}>
            {stravaLleno ? (
              <button
                disabled
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#FC4C02', color: '#fff',
                  borderRadius: 4, padding: '10px 20px',
                  fontSize: 13, fontWeight: 500, opacity: 0.5, cursor: 'not-allowed',
                  border: 'none',
                }}
              >
                <StravaIcon />
                Conectar com Strava (limite atingido)
              </button>
            ) : (
              <a
                href="/api/strava/auth"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#FC4C02', color: '#fff',
                  borderRadius: 4, padding: '10px 20px',
                  fontSize: 13, fontWeight: 500, textDecoration: 'none',
                }}
              >
                <StravaIcon />
                Conectar com Strava
              </a>
            )}
          </div>

          {trilhasPessoais.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>Nenhuma trilha do Strava conectada ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trilhasPessoais.map(t => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(252,76,2,0.05)', border: '0.5px solid rgba(252,76,2,0.2)',
                    borderLeft: '3px solid #FC4C02', borderRadius: 4, padding: '10px 14px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 2 }}>{t.name}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#888' }}>{t.regiao}</span>
                      <a href={t.strava_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#FC4C02' }}>Ver no Strava ↗</a>
                      <Link href={`/perfil/strava/sugestao/${t.strava_segment_id}`} style={{ fontSize: 12, color: '#888', textDecoration: 'underline' }}>
                        Sugerir alteração
                      </Link>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePessoal(t.id)}
                    disabled={deletingId === t.id}
                    style={{ fontSize: 12, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 12, flexShrink: 0 }}
                  >
                    {deletingId === t.id ? '...' : 'Excluir'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trilhas favoritas */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionLabel>Trilhas favoritas</SectionLabel>
            <span style={{ fontSize: 12, background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 6px', color: '#888' }}>
              {trilhasFavoritas.length}
            </span>
          </div>
          {trilhasFavoritas.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>Nenhuma trilha favoritada ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {trilhasFavoritas.map(t => (
                <Link
                  key={t.id}
                  href={`/trilhas/${t.id}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 4, textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f7f7f5')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: '#888' }}>{t.regiao}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Trilhas cadastradas */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionLabel>Trilhas que cadastrei</SectionLabel>
            {minhasTrilhas.length > 0 && (
              <span style={{ fontSize: 12, background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 6px', color: '#888' }}>
                {minhasTrilhas.length}
              </span>
            )}
          </div>
          {minhasTrilhas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Você ainda não cadastrou trilhas.</p>
              <Link href="/trilhas/cadastrar" style={{ fontSize: 13, color: '#111', fontWeight: 500, borderBottom: '1px solid #111' }}>
                Cadastrar trilha →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {minhasTrilhas.map(t => {
                const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
                  pendente:  { bg: '#fef9c3', color: '#854d0e', label: 'Pendente' },
                  aprovada:  { bg: '#dcfce7', color: '#166534', label: 'Aprovada' },
                  rejeitada: { bg: '#fee2e2', color: '#991b1b', label: 'Rejeitada' },
                }
                const cfg = statusConfig[t.status] ?? statusConfig.pendente
                return (
                  <div key={t.id} style={{ borderRadius: 4, padding: '10px 12px', background: '#f7f7f5' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{t.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 500, borderRadius: 2, padding: '2px 6px', background: cfg.bg, color: cfg.color, flexShrink: 0, marginLeft: 12 }}>
                        {cfg.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{t.regiao} · {new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                    {t.status === 'rejeitada' && t.motivo_rejeicao && (
                      <p style={{ fontSize: 12, color: '#991b1b', marginTop: 6, background: '#fee2e2', borderRadius: 3, padding: '6px 10px' }}>
                        Motivo: {t.motivo_rejeicao}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Logout */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleLogout}
            style={{ fontSize: 13, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
          >
            Sair da conta
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
