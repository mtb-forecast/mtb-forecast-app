'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import { Profile, Trilha, ESTADOS_BRASIL } from '@/lib/types'
import { PLANOS } from '@/lib/stripe-config'

type TrilhaPendenteSimples = {
  id: string
  name: string
  regiao: string
  status: string
  motivo_rejeicao?: string | null
  created_at: string
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [portalLoading, setPortalLoading] = useState(false)

  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [telefone, setTelefone] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(true)
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')

  const [receberEmail, setReceberEmail] = useState(false)
  const [emailSaveStatus, setEmailSaveStatus] = useState<'idle' | 'success'>('idle')

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

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
        setReceberEmail(profileData.receber_email ?? false)
        setAvatarUrl(profileData.avatar_url || null)
      }

      const [{ data: minhas }, { data: favIds }] = await Promise.all([
        supabase.from('trilhas_pendentes')
          .select('id, name, regiao, status, motivo_rejeicao, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
      ])

      if (minhas) setMinhasTrilhas(minhas)

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

  async function handleEmailToggle(value: boolean) {
    if (!profile) return
    setReceberEmail(value)
    await supabase.from('profiles').update({
      receber_email: value,
      email_trilhas_favoritas: value ? true : undefined,
    }).eq('id', profile.id)
    setEmailSaveStatus('success')
    setTimeout(() => setEmailSaveStatus('idle'), 2000)
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    setAvatarUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setAvatarError(data.error || 'Erro ao enviar foto.')
      } else {
        setAvatarUrl(data.avatar_url)
      }
    } catch {
      setAvatarError('Erro de conexão. Tente novamente.')
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const planoId = (profile?.plano || 'gratuito') as keyof typeof PLANOS

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#2a2a2a', border: '2px solid #333',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 28, color: '#555', fontWeight: 700 }}>
                  {(profile?.apelido || profile?.nome || profile?.email || '?')[0].toUpperCase()}
                </span>
              )}
              {avatarUploading && (
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: 20, height: 20, border: '2px solid #555', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              )}
            </div>
            <label style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 24, height: 24, borderRadius: '50%',
              background: '#FFE000', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, lineHeight: 1,
            }} title="Alterar foto">
              ✎
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleAvatarUpload}
                disabled={avatarUploading}
              />
            </label>
          </div>

          <div>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Perfil</h1>
            <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>
              {profile?.apelido || profile?.nome || profile?.email || 'Minha conta'}
            </p>
            {avatarError && (
              <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{avatarError}</p>
            )}
          </div>
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
                {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>

            {/* Telegram */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Telegram <span style={{ color: '#bbb' }}>(opcional)</span>
              </label>
              {planoId === 'gratuito' ? (
                <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>
                  Disponível a partir do Plano Básico.{' '}
                  <a href="/planos" style={{ color: '#888', textDecoration: 'underline' }}>Ver planos</a>
                </p>
              ) : (
                <>
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
                  <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>
                    Para receber notificações: busque @mtbforecaster_bot no Telegram, inicie com /start e informe seu @username acima.
                  </p>
                </>
              )}
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

        {/* Notificações por Email */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SectionLabel>Notificações por Email</SectionLabel>
            {emailSaveStatus === 'success' && (
              <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>Preferências salvas</span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>Receber report diário por email</span>
              <span style={{ fontSize: 12, color: '#888' }}>Seg–Dom às 06h · Sex–Dom também às 12h · Sex–Sáb também às 20h (BRT)</span>
            </div>
            <button
              type="button"
              onClick={() => handleEmailToggle(!receberEmail)}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: receberEmail ? '#111' : '#e5e5e5',
                border: 'none', cursor: 'pointer',
                position: 'relative', flexShrink: 0,
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2,
                left: receberEmail ? 22 : 2,
                width: 20, height: 20,
                background: '#fff', borderRadius: '50%',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>

          <div style={{ background: '#f7f7f5', borderRadius: 6, padding: 12, marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <i className="ti ti-info-circle" style={{ fontSize: 16, color: '#888', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5, margin: 0 }}>
              O report inclui aderência, veredicto, chuva e vento das suas trilhas favoritas + análise do dia. Você pode cancelar a qualquer momento.
            </p>
          </div>
        </div>

        {/* Minha assinatura */}
        {(() => {
          const plano = PLANOS[planoId] ?? PLANOS.gratuito
          const isPago = plano.preco > 0
          return (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 16 }}>
              <SectionLabel>Minha assinatura</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{plano.nome}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 500, borderRadius: 2, padding: '2px 8px',
                      background: isPago ? '#dcfce7' : '#f3f4f6',
                      color: isPago ? '#166534' : '#6b7280',
                    }}>
                      {isPago ? `R$${plano.preco}/mês` : 'Gratuito'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#888' }}>{plano.descricao}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isPago ? (
                    <button
                      onClick={handlePortal}
                      disabled={portalLoading}
                      style={{
                        background: '#fff', color: '#111',
                        border: '1.5px solid #111', borderRadius: 4,
                        padding: '8px 16px', fontSize: 13, fontWeight: 500,
                        cursor: portalLoading ? 'not-allowed' : 'pointer',
                        opacity: portalLoading ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      {portalLoading && (
                        <span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid #111', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      )}
                      Gerenciar assinatura
                    </button>
                  ) : (
                    <Link
                      href="/planos"
                      style={{
                        display: 'inline-block',
                        background: '#FFE000', color: '#111',
                        border: '1.5px solid #111', borderRadius: 4,
                        padding: '8px 16px', fontSize: 13, fontWeight: 500,
                        textDecoration: 'none',
                      }}
                    >
                      Ver planos →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

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

        {/* Menu de atalhos */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: '8px 0', marginBottom: 24 }}>
          <Link
            href="/perfil/minhas-trilhas"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 20px', textDecoration: 'none', color: '#111',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f7f7f5')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <i className="ti ti-map-pin" style={{ fontSize: 18, color: '#555', flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>Trilhas que cadastrei</span>
            {minhasTrilhas.length > 0 && (
              <span style={{ fontSize: 12, background: '#f3f4f6', borderRadius: 10, padding: '2px 8px', color: '#555', fontWeight: 500 }}>
                {minhasTrilhas.length}
              </span>
            )}
            <span style={{ fontSize: 14, color: '#bbb' }}>→</span>
          </Link>
        </div>

        {/* Admin */}
        {profile?.is_admin && (
          <div style={{ background: '#18181b', border: '0.5px solid #3f3f46', borderRadius: 8, padding: 24, marginBottom: 24 }}>
            <SectionLabel>Administração</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { href: '/admin', label: 'Painel admin', icon: 'ti-layout-dashboard' },
                { href: '/admin/tabelas', label: 'Tabelas', icon: 'ti-table' },
                { href: '/admin/importar-strava', label: 'Importar Strava', icon: 'ti-brand-strava' },
              ].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 4, textDecoration: 'none',
                    color: '#e4e4e7',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: '#FFE000' }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#71717a' }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        )}

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
