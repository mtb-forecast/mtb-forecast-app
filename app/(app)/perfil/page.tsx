'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import { Profile, Trilha, ESTADOS_BRASIL } from '@/lib/types'
import { PLANOS } from '@/lib/stripe-config'

type Tab = 'conta' | 'notificacoes' | 'assinatura' | 'trilhas'
type TrilhaPendente = { id: string; name: string; regiao: string; status: string; motivo_rejeicao?: string | null; created_at: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (!d) return ''
  if (d.length <= 2) return '+' + d
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
}

// ── Micro-components ───────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 12,
        background: checked ? '#FFE000' : '#e5e7eb',
        border: checked ? '1.5px solid #d4b800' : '1.5px solid #d1d5db',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', flexShrink: 0, transition: 'background 0.18s, border-color 0.18s',
        outline: 'none',
      }}>
      <span style={{
        position: 'absolute', top: 2, left: checked ? 19 : 2,
        width: 18, height: 18,
        background: checked ? '#111' : '#9ca3af', borderRadius: '50%',
        transition: 'left 0.18s, background 0.18s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }} />
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.02em' }}>{children}</label>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 20px', letterSpacing: '-0.01em' }}>{children}</h2>
}

function Divider() {
  return <div style={{ height: 1, background: '#f3f4f6', margin: '20px 0' }} />
}

function InlineAlert({ type, children }: { type: 'success' | 'error' | 'info'; children: React.ReactNode }) {
  const cfg = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: 'ti-circle-check' },
    error:   { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: 'ti-alert-circle' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: 'ti-info-circle' },
  }[type]
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8, color: cfg.color }}>
      <i className={`ti ${cfg.icon}`} style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }} />
      <span style={{ lineHeight: 1.5 }}>{children}</span>
    </div>
  )
}

function Spinner({ size = 14 }: { size?: number }) {
  return <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid rgba(0,0,0,0.12)`, borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.65s linear infinite', flexShrink: 0 }} />
}

// ── Nav item ────────────────────────────────────────────────────────────────

function NavItem({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="perfil-nav-item" style={{
      display: 'flex', alignItems: 'center', gap: 10,
      width: '100%', textAlign: 'left',
      padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: active ? 'rgba(255,224,0,0.12)' : 'transparent',
      color: active ? '#fff' : '#9ca3af',
      fontSize: 14, fontWeight: active ? 600 : 500,
      transition: 'background 0.12s, color 0.12s',
      whiteSpace: 'nowrap',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 16, flexShrink: 0, color: active ? '#FFE000' : '#6b7280' }} />
      <span className="perfil-nav-label">{label}</span>
      <i className={`ti ti-chevron-right perfil-nav-chevron`} style={{ fontSize: 12, marginLeft: 'auto', color: '#FFE000', opacity: active ? 0.7 : 0, transition: 'opacity 0.12s' }} />
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function PerfilPage() {
  const [tab, setTab] = useState<Tab>('conta')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [minhasTrilhas, setMinhasTrilhas] = useState<TrilhaPendente[]>([])
  const [trilhasFavoritas, setTrilhasFavoritas] = useState<Trilha[]>([])
  const [loading, setLoading] = useState(true)

  // Conta form state
  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [telefone, setTelefone] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(true)
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Notificações
  const [receberEmail, setReceberEmail] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Assinatura
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (p) {
        setProfile(p)
        setNome(p.nome || '')
        setApelido(p.apelido || '')
        setTelefone(p.telefone || '')
        setTelefoneWhatsapp(p.telefone_whatsapp ?? true)
        setRegiao(p.regiao || '')
        setTelegram(p.telegram_username || '')
        setReceberEmail(p.receber_email ?? false)
        setAvatarUrl(p.avatar_url || null)
      }

      const [{ data: minhas }, { data: favIds }] = await Promise.all([
        supabase.from('trilhas_pendentes').select('id,name,regiao,status,motivo_rejeicao,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
      ])
      if (minhas) setMinhasTrilhas(minhas)
      if (favIds?.length) {
        const ids = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const { data: favTrilhas } = await supabase.from('trilhas').select('*').in('id', ids).eq('aprovada', true)
        if (favTrilhas) setTrilhasFavoritas(favTrilhas)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true); setSaveStatus('idle')
    const { error } = await supabase.from('profiles').update({ nome, apelido, telefone, telefone_whatsapp: telefoneWhatsapp, regiao, telegram_username: telegram || null }).eq('id', profile.id)
    setSaving(false)
    setSaveStatus(error ? 'error' : 'success')
    if (!error) setTimeout(() => setSaveStatus('idle'), 3000)
  }

  async function handleEmailToggle(v: boolean) {
    if (!profile) return
    setReceberEmail(v); setEmailSaving(true)
    await supabase.from('profiles').update({ receber_email: v, ...(v ? { email_trilhas_favoritas: true } : {}) }).eq('id', profile.id)
    setEmailSaving(false); setEmailSaved(true)
    setTimeout(() => setEmailSaved(false), 2200)
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally { setPortalLoading(false) }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setAvatarError(null); setAvatarUploading(true)
    const form = new FormData(); form.append('file', file)
    try {
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) setAvatarError(data.error || 'Erro ao enviar foto.')
      else setAvatarUrl(data.avatar_url)
    } catch { setAvatarError('Erro de conexão.') }
    finally { setAvatarUploading(false); e.target.value = '' }
  }

  async function handleLogout() {
    await supabase.auth.signOut(); window.location.href = '/login'
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2.5px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Carregando perfil…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const planoId = (profile?.plano || 'gratuito') as keyof typeof PLANOS
  const plano = PLANOS[planoId] ?? PLANOS.gratuito
  const isPago = plano.preco > 0
  const displayName = profile?.apelido || profile?.nome || '–'
  const initials = displayName[0]?.toUpperCase() ?? '?'

  // ── Tabs content ────────────────────────────────────────────────────────

  const tabConta = (
    <form onSubmit={handleSave}>
      <SectionTitle>Dados pessoais</SectionTitle>

      {saveStatus === 'success' && <InlineAlert type="success">Alterações salvas com sucesso!</InlineAlert>}
      {saveStatus === 'error' && <InlineAlert type="error">Erro ao salvar. Tente novamente.</InlineAlert>}

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>E-mail</FieldLabel>
        <div style={{ position: 'relative' }}>
          <input className="input-field" type="email" value={profile?.email || ''} disabled style={{ paddingRight: 40, background: '#fafafa', color: '#9ca3af' }} />
          <i className="ti ti-lock" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#d1d5db' }} />
        </div>
      </div>

      <div className="perfil-nome-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <FieldLabel>Nome completo</FieldLabel>
          <input className="input-field" type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" />
        </div>
        <div>
          <FieldLabel>Apelido</FieldLabel>
          <input className="input-field" type="text" value={apelido} onChange={e => setApelido(e.target.value)} placeholder="Como te chamam" />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Região</FieldLabel>
        <select className="input-field" value={regiao} onChange={e => setRegiao(e.target.value)}>
          <option value="">Selecione seu estado</option>
          {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>Telefone</FieldLabel>
        <input className="input-field" type="tel" value={telefone} onChange={e => setTelefone(formatPhone(e.target.value))} placeholder="+55 (11) 99999-9999" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={telefoneWhatsapp} onChange={e => setTelefoneWhatsapp(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#111' }} />
          <span style={{ fontSize: 13, color: '#6b7280' }}>Este número tem WhatsApp</span>
        </label>
      </div>

      <Divider />

      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Telegram <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span></FieldLabel>
        {planoId === 'gratuito' ? (
          <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 6, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-brand-telegram" style={{ fontSize: 16, color: '#9ca3af' }} />
              <span style={{ fontSize: 13, color: '#9ca3af' }}>Disponível no Plano Básico</span>
            </div>
            <Link href="/planos" style={{ fontSize: 13, fontWeight: 600, color: '#111', textDecoration: 'underline' }}>Ver planos</Link>
          </div>
        ) : (
          <>
            <input className="input-field" type="text" value={telegram}
              onChange={e => { const v = e.target.value; setTelegram(v && !v.startsWith('@') ? '@' + v : v) }}
              placeholder="@seu_username" />
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, lineHeight: 1.5 }}>
              Abra o Telegram e inicie uma conversa com <strong>@mtbforecaster_bot</strong> enviando /start.
            </p>
          </>
        )}
      </div>

      <button type="submit" disabled={saving} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: saving ? '#f3f4f6' : '#111', color: saving ? '#9ca3af' : '#fff',
        border: 'none', borderRadius: 8, padding: '11px 24px',
        fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
      }}>
        {saving && <Spinner />}
        {saving ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </form>
  )

  const tabNotif = (
    <div>
      <SectionTitle>Notificações</SectionTitle>

      <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, overflow: 'hidden' }}>
        <div className="perfil-notif-row" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: receberEmail ? '#fefce8' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
            <i className="ti ti-mail" style={{ fontSize: 18, color: receberEmail ? '#b45309' : '#9ca3af' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>Report diário por e-mail</span>
              {emailSaving && <Spinner size={12} />}
              {emailSaved && !emailSaving && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Salvo</span>}
            </div>
            <span style={{ fontSize: 13, color: '#9ca3af' }}>Previsão das suas trilhas favoritas</span>
          </div>
          <Toggle checked={receberEmail} onChange={handleEmailToggle} disabled={emailSaving} />
        </div>

        {receberEmail && (
          <div style={{ borderTop: '1px solid #f3f4f6', padding: '14px 20px', background: '#fafafa' }}>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.7 }}>
              <strong style={{ color: '#111' }}>Horários de envio (BRT):</strong><br />
              Seg–Dom às <strong>06h</strong> · Sex–Dom também às <strong>12h</strong> · Sex–Sáb também às <strong>20h</strong>
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '10px 0 0', lineHeight: 1.7 }}>
              Você receberá aderência, veredicto e previsão detalhada das trilhas que você favoritou.
            </p>
          </div>
        )}
      </div>

      {!receberEmail && (
        <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 14, lineHeight: 1.6 }}>
          Ative para receber um report com a condição das suas trilhas favoritas em cada janela de envio.
        </p>
      )}
    </div>
  )

  const tabAssinatura = (
    <div>
      <SectionTitle>Assinatura</SectionTitle>

      <div style={{ background: isPago ? 'linear-gradient(135deg, #111 0%, #1a1a1a 100%)' : '#fff', border: isPago ? 'none' : '1px solid #f0f0f0', borderRadius: 14, padding: 24, marginBottom: 16 }}>
        <div className="perfil-assinatura-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: isPago ? '#FFE000' : '#111', letterSpacing: '-0.03em' }}>{plano.nome}</span>
              {isPago && <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(255,224,0,0.15)', color: '#FFE000', borderRadius: 4, padding: '3px 8px' }}>ATIVO</span>}
            </div>
            <p style={{ fontSize: 13, color: isPago ? '#9ca3af' : '#6b7280', margin: 0, lineHeight: 1.5 }}>{plano.descricao}</p>
          </div>
          {isPago && (
            <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', flexShrink: 0 }}>
              R${plano.preco}<span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280' }}>/mês</span>
            </span>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          {isPago ? (
            <button onClick={handlePortal} disabled={portalLoading} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.08)', color: '#e5e7eb',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: portalLoading ? 'not-allowed' : 'pointer',
            }}>
              {portalLoading ? <Spinner size={12} /> : <i className="ti ti-external-link" style={{ fontSize: 15 }} />}
              Gerenciar assinatura
            </button>
          ) : (
            <Link href="/planos" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#FFE000', color: '#111', border: '1.5px solid #111',
              borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700,
              textDecoration: 'none',
            }}>
              <i className="ti ti-rocket" style={{ fontSize: 15 }} /> Fazer upgrade
            </Link>
          )}
        </div>
      </div>

      {!isPago && (
        <div style={{ border: '1px dashed #e5e7eb', borderRadius: 12, padding: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: '0 0 8px' }}>O que você ganha com o upgrade:</p>
          {['Alertas Telegram em tempo real', 'Histórico de condições da trilha', 'Filtros avançados no mapa', 'Suporte prioritário'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 15, color: '#16a34a', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#374151' }}>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const tabTrilhas = (
    <div>
      <SectionTitle>Minhas trilhas</SectionTitle>

      <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
        <Link href="/trilhas" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, color: '#111', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-heart" style={{ fontSize: 18, color: '#ef4444' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 2 }}>Trilhas favoritas</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{trilhasFavoritas.length} trilha{trilhasFavoritas.length !== 1 ? 's' : ''} salva{trilhasFavoritas.length !== 1 ? 's' : ''}</div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#d1d5db' }} />
        </Link>

        <div style={{ height: 1, background: '#f3f4f6', margin: '0 18px' }} />

        <Link href="/perfil/minhas-trilhas" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, color: '#111', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-map-pin" style={{ fontSize: 18, color: '#3b82f6' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 2 }}>Trilhas que cadastrei</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{minhasTrilhas.length} trilha{minhasTrilhas.length !== 1 ? 's' : ''} submetida{minhasTrilhas.length !== 1 ? 's' : ''}</div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#d1d5db' }} />
        </Link>

        <div style={{ height: 1, background: '#f3f4f6', margin: '0 18px' }} />

        <Link href="/trilhas/cadastrar" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, color: '#111', textDecoration: 'none' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-plus" style={{ fontSize: 18, color: '#16a34a' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 2 }}>Cadastrar nova trilha</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Submeter para aprovação</div>
          </div>
          <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#d1d5db' }} />
        </Link>
      </div>
    </div>
  )

  const tabContent: Record<Tab, React.ReactNode> = { conta: tabConta, notificacoes: tabNotif, assinatura: tabAssinatura, trilhas: tabTrilhas }

  // Bloco reutilizável: links admin (usado no sidebar desktop e no footer mobile)
  const adminLinks = profile?.is_admin ? (
    <div style={{ marginBottom: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: '#52525b', textTransform: 'uppercase', marginBottom: 8, padding: '0 12px' }}>Admin</div>
      {[
        { href: '/admin', icon: 'ti-layout-dashboard', label: 'Painel' },
        { href: '/admin/tabelas', icon: 'ti-table', label: 'Tabelas' },
        { href: '/admin/importar-strava', icon: 'ti-brand-strava', label: 'Strava' },
      ].map(item => (
        <Link key={item.href} href={item.href} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8, color: '#9ca3af',
          fontSize: 13, fontWeight: 500, textDecoration: 'none',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
        >
          <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: '#FFE000', flexShrink: 0 }} />
          {item.label}
        </Link>
      ))}
    </div>
  ) : null

  const logoutBtn = (
    <button onClick={handleLogout} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      width: '100%', background: 'transparent', border: 'none',
      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
      color: '#6b7280', fontSize: 14, fontWeight: 500,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#f87171' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280' }}
    >
      <i className="ti ti-logout" style={{ fontSize: 16, flexShrink: 0 }} />
      Sair da conta
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', overflowX: 'hidden' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }

        /* ── Tablet: 769–1024px ─────────────────────────── */
        @media (max-width: 1024px) {
          .perfil-sidebar { width: 200px !important; padding: 28px 14px 20px !important; }
          .perfil-content { padding: 32px 24px 48px !important; }
        }

        /* ── Mobile: ≤768px ─────────────────────────────── */
        @media (max-width: 768px) {
          .perfil-layout { flex-direction: column !important; }

          /* Sidebar: só header + nav, sem altura mínima */
          .perfil-sidebar {
            width: 100% !important;
            min-height: 0 !important;
            padding: 16px 16px 0 !important;
          }
          .perfil-sidebar-inner { position: static !important; }

          /* Admin e logout somem do sidebar no mobile */
          .perfil-sidebar-extras { display: none !important; }

          /* Avatar section: row compacto */
          .perfil-avatar-section {
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
            margin-bottom: 14px !important;
            text-align: left !important;
          }
          /* Avatar menor no mobile */
          .perfil-avatar-circle { width: 52px !important; height: 52px !important; }
          .perfil-avatar-circle span { font-size: 20px !important; }
          .perfil-avatar-circle img { width: 52px !important; height: 52px !important; }
          .perfil-avatar-edit-btn { width: 20px !important; height: 20px !important; font-size: 10px !important; }

          /* Textos de identidade */
          .perfil-name { width: 0 !important; flex: 1 !important; min-width: 0 !important; text-align: left !important; }
          .perfil-name-text { font-size: 15px !important; }
          .perfil-email-text { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }

          /* Nav: scroll horizontal tipo chips */
          .perfil-nav {
            flex-direction: row !important;
            gap: 6px !important;
            overflow-x: auto !important;
            padding: 0 0 14px !important;
            scrollbar-width: none !important;
            -webkit-overflow-scrolling: touch !important;
            margin-bottom: 0 !important;
          }
          .perfil-nav::-webkit-scrollbar { display: none; }
          .perfil-nav-item {
            width: auto !important;
            flex-shrink: 0 !important;
            padding: 8px 14px !important;
            font-size: 13px !important;
            border-radius: 20px !important;
            border: 1px solid rgba(255,255,255,0.12) !important;
          }
          .perfil-nav-chevron { display: none !important; }

          /* Content */
          .perfil-content { padding: 22px 16px 32px !important; }

          /* Footer mobile: admin + logout aparecem aqui */
          .perfil-mobile-footer {
            display: block !important;
            margin-top: 32px;
            background: #111;
            border-radius: 14px;
            padding: 4px 4px 4px;
            overflow: hidden;
          }

          /* Form grid 1 coluna */
          .perfil-nome-grid { grid-template-columns: 1fr !important; }

          /* Notif row */
          .perfil-notif-row { padding: 14px 16px !important; gap: 12px !important; }

          /* Assinatura header empilha */
          .perfil-assinatura-header { flex-direction: column !important; gap: 8px !important; }
        }

        /* ── Mobile pequeno: ≤420px ─────────────────────── */
        @media (max-width: 420px) {
          .perfil-sidebar { padding: 14px 14px 0 !important; }
          .perfil-content { padding: 18px 14px 32px !important; }
          .perfil-nav-item { padding: 7px 11px !important; font-size: 12px !important; }
          .perfil-mobile-footer { border-radius: 10px !important; }
        }

        /* Esconder footer mobile no desktop */
        .perfil-mobile-footer { display: none; }
      `}</style>

      <div className="perfil-layout" style={{ display: 'flex', maxWidth: 960, margin: '0 auto', minHeight: '100vh', width: '100%' }}>

        {/* ── Sidebar ── */}
        <aside className="perfil-sidebar" style={{ width: 240, background: '#111', padding: '40px 20px 32px', flexShrink: 0, minHeight: '100vh' }}>
          <div className="perfil-sidebar-inner" style={{ position: 'sticky', top: 32 }}>

            {/* Identity */}
            <div className="perfil-avatar-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 28 }}>
              <div style={{ position: 'relative', marginBottom: 14, flexShrink: 0 }}>
                <div className="perfil-avatar-circle" style={{
                  width: 76, height: 76, borderRadius: '50%',
                  background: '#1a1a1a', border: '2px solid #2a2a2a',
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 28, fontWeight: 800, color: '#FFE000', lineHeight: 1 }}>{initials}</span>}
                  {avatarUploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Spinner size={18} />
                    </div>
                  )}
                </div>
                <label className="perfil-avatar-edit-btn" style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 24, height: 24, borderRadius: '50%',
                  background: '#FFE000', border: '2px solid #111',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#111',
                }} title="Alterar foto">
                  ✎
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={avatarUploading} />
                </label>
              </div>

              <div className="perfil-name" style={{ width: '100%', minWidth: 0 }}>
                <div className="perfil-name-text" style={{ fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </div>
                <div className="perfil-email-text" style={{ fontSize: 12, color: '#52525b', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile?.email}
                </div>
                <span style={{
                  display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase',
                  background: isPago ? 'rgba(255,224,0,0.15)' : 'rgba(255,255,255,0.06)',
                  color: isPago ? '#FFE000' : '#6b7280',
                  border: isPago ? '1px solid rgba(255,224,0,0.3)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  {isPago ? plano.nome : 'Gratuito'}
                </span>
              </div>
              {avatarError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 8, lineHeight: 1.4, textAlign: 'left', width: '100%' }}>{avatarError}</p>}
            </div>

            {/* Navigation */}
            <nav className="perfil-nav" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
              <NavItem icon="ti-user" label="Conta" active={tab === 'conta'} onClick={() => setTab('conta')} />
              <NavItem icon="ti-bell" label="Notificações" active={tab === 'notificacoes'} onClick={() => setTab('notificacoes')} />
              <NavItem icon="ti-credit-card" label="Assinatura" active={tab === 'assinatura'} onClick={() => setTab('assinatura')} />
              <NavItem icon="ti-mountain" label="Minhas trilhas" active={tab === 'trilhas'} onClick={() => setTab('trilhas')} />
            </nav>

            {/* Admin + Logout — visíveis só no desktop (sidebar) */}
            <div className="perfil-sidebar-extras">
              {adminLinks}
              {logoutBtn}
            </div>

          </div>
        </aside>

        {/* ── Content ── */}
        <main className="perfil-content" style={{ flex: 1, padding: '48px 40px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
          {tabContent[tab]}

          {/* Admin + Logout — visíveis só no mobile (rodapé do conteúdo) */}
          <div className="perfil-mobile-footer" style={{ display: 'none' }}>
            {adminLinks}
            {logoutBtn}
          </div>
        </main>

      </div>
    </div>
  )
}
