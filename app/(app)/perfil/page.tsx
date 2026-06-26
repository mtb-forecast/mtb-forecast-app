'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  IconLock, IconChevronRight, IconAlertTriangle, IconExternalLink,
  IconBrandInstagram, IconBrandTelegram, IconSettings, IconBrandFacebook,
  IconBrandStrava, IconMail, IconCircleCheck, IconRocket, IconUser,
  IconMapPin, IconDeviceMobile, IconArrowRight, IconLogout, IconDeviceFloppy,
} from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'
import { Profile, Trilha, ESTADOS_BRASIL } from '@/lib/types'
import { PLANOS } from '@/lib/stripe-config'
import { REPORT_SCHEDULE } from '@/lib/schedule'

type Tab = 'conta' | 'alertas' | 'plano' | 'integracoes'
type SheetField = 'telegram' | null
type TrilhaCadastrada = {
  id: string; name: string; regiao: string; created_at: string
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#f4f5f0',
  card:     '#ffffff',
  card2:    '#eaece4',
  border:   '#d0d4c6',
  primary:  '#6d745f',
  text:     '#2a2e25',
  muted:    '#6d745f',
  dim:      '#8a9280',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (!d) return ''
  if (d.length <= 2) return '+' + d
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
}
function estadoLabel(v: string) {
  return ESTADOS_BRASIL.find(e => e.value === v)?.label ?? v
}

// ── Micro-components ──────────────────────────────────────────────────────────
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '2px solid rgba(0,0,0,0.1)',
      borderTopColor: T.primary, borderRadius: '50%',
      animation: 'spin 0.65s linear infinite', flexShrink: 0,
    }} />
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 48, height: 28, borderRadius: 14,
        background: checked ? T.primary : '#d0d4c6',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s', outline: 'none',
      }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 22, height: 22, background: checked ? '#fff' : '#8a9280',
        borderRadius: '50%', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }} />
    </button>
  )
}

function Divider() {
  return <div style={{ height: 1, background: T.border, margin: '0 0 0 54px' }} />
}

// ── InfoRow — tap to edit ─────────────────────────────────────────────────────
function InfoRow({
  icon, label, value, sub, locked, onTap,
}: {
  icon: string; label: string; value: string; sub?: string
  locked?: boolean; onTap?: () => void
}) {
  return (
    <button type="button" onClick={onTap} disabled={locked || !onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', background: 'transparent', border: 'none',
        padding: '14px 0', cursor: (locked || !onTap) ? 'default' : 'pointer',
        textAlign: 'left', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: '#eaece4',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18, color: T.primary }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, color: value ? T.text : T.dim, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || 'Não informado'}
        </div>
        {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      {locked && <IconLock size={14} style={{ color: T.dim, flexShrink: 0 }} />}
      {!locked && onTap && <IconChevronRight size={14} style={{ color: T.dim, flexShrink: 0 }} />}
    </button>
  )
}

// ── ProfileSection card ───────────────────────────────────────────────────────
function ProfileSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: T.card, borderRadius: 20, border: `1px solid ${T.border}`,
      overflow: 'hidden', marginBottom: 12,
    }}>
      {title && (
        <div style={{ padding: '14px 20px 0', fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          {title}
        </div>
      )}
      <div style={{ padding: '0 20px' }}>{children}</div>
    </div>
  )
}

// ── Bottom Sheet (edit drawer) ────────────────────────────────────────────────
function EditSheet({
  open, title, onClose, children,
}: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          zIndex: 98, transition: 'opacity 0.22s',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 640,
        margin: '0 auto', zIndex: 99,
        background: T.card, border: `1px solid ${T.border}`, borderBottom: 'none',
        borderRadius: '24px 24px 0 0', padding: '0 20px 40px',
        maxHeight: '88vh', overflowY: 'auto',
        transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
        transform: open ? 'translateY(0)' : 'translateY(110%)',
      }}>
        <div style={{ width: 36, height: 4, background: T.border, borderRadius: 2, margin: '12px auto 20px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 20 }}>{title}</div>
        {children}
      </div>
    </>
  )
}

// ── Input style (dark) ────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#f4f5f0', border: `1.5px solid ${T.border}`,
  borderRadius: 12, padding: '13px 16px',
  fontSize: 15, color: T.text,
  outline: 'none', transition: 'border-color 0.15s',
}
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }

// ── Save button inside sheet ──────────────────────────────────────────────────
function SheetSaveBtn({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      style={{
        width: '100%', marginTop: 20,
        background: loading ? '#d0d4c6' : T.primary,
        color: loading ? T.muted : '#fff',
        border: 'none', borderRadius: 14, padding: '15px',
        fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
      {loading && <Spinner size={14} />}
      {loading ? 'Salvando…' : 'Salvar'}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PerfilPage() {
  const [tab, setTab] = useState<Tab>('conta')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [sheetField, setSheetField] = useState<SheetField>(null)
  // Form state
  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [cidade, setCidade] = useState('')
  const [telefone, setTelefone] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(true)
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [stravaId, setStravaId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Counters
  const [minhasTrilhas, setMinhasTrilhas] = useState<TrilhaCadastrada[]>([])
  const [trilhasFavoritas, setTrilhasFavoritas] = useState<Trilha[]>([])

  // Notification
  const [receberEmail, setReceberEmail] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  // Portal
  const [portalLoading, setPortalLoading] = useState(false)

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (p) {
        setProfile(p)
        setNome(p.nome || '')
        setApelido(p.apelido || '')
        setDataNascimento(p.data_nascimento || '')
        setCidade(p.cidade || '')
        setTelefone(p.telefone || '')
        setTelefoneWhatsapp(p.telefone_whatsapp ?? true)
        setRegiao(p.regiao || '')
        setTelegram(p.telegram_username || '')
        setInstagram(p.instagram || '')
        setFacebook(p.facebook || '')
        setStravaId(p.strava_id || '')
        setReceberEmail(p.receber_email ?? false)
        setAvatarUrl(p.avatar_url || null)
      }
      const [{ data: minhas }, { data: favIds }] = await Promise.all([
        supabase.from('trilhas').select('id,name,regiao,created_at').eq('created_by', user.id).order('created_at', { ascending: false }),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
      ])
      if (minhas) setMinhasTrilhas(minhas)
      if (favIds?.length) {
        const ids = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const { data: favs } = await supabase.from('trilhas').select('*').in('id', ids).eq('aprovada', true)
        if (favs) setTrilhasFavoritas(favs)
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Computed ────────────────────────────────────────────────────────────────
  const planoId = (profile?.plano || 'plano_a') as keyof typeof PLANOS
  const plano = PLANOS[planoId] ?? PLANOS.plano_a
  const isPago = plano.preco > 0
  const displayName = profile?.apelido || profile?.nome || '–'
  const initials = displayName[0]?.toUpperCase() ?? '?'
  const isDirty = !!(profile && (
    nome !== (profile.nome || '') ||
    apelido !== (profile.apelido || '') ||
    dataNascimento !== (profile.data_nascimento || '') ||
    cidade !== (profile.cidade || '') ||
    telefone !== (profile.telefone || '') ||
    telefoneWhatsapp !== (profile.telefone_whatsapp ?? true) ||
    regiao !== (profile.regiao || '') ||
    telegram !== (profile.telegram_username || '') ||
    instagram !== (profile.instagram || '') ||
    facebook !== (profile.facebook || '') ||
    stravaId !== (profile.strava_id || '')
  ))

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!profile) return
    setFormError(null)
    const missing: string[] = []
    if (!nome.trim())         missing.push('Nome completo')
    if (!apelido.trim())      missing.push('Apelido')
    if (!dataNascimento)      missing.push('Data de nascimento')
    if (!regiao)              missing.push('Estado')
    if (!cidade.trim())       missing.push('Cidade')
    if (!telefone.trim())     missing.push('Telefone')
    if (missing.length) { setFormError(`Preencha os campos obrigatórios: ${missing.join(', ')}.`); return }

    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      nome, apelido, data_nascimento: dataNascimento || null, cidade,
      telefone, telefone_whatsapp: telefoneWhatsapp,
      regiao, telegram_username: telegram ? telegram.toLowerCase() : null,
      instagram: instagram || null, facebook: facebook || null, strava_id: stravaId || null,
    }).eq('id', profile.id)
    setSaving(false)
    if (!error) {
      setProfile(prev => prev ? {
        ...prev, nome, apelido, data_nascimento: dataNascimento || null, cidade,
        telefone, telefone_whatsapp: telefoneWhatsapp, regiao,
        telegram_username: telegram ? telegram.toLowerCase() : undefined, instagram: instagram || undefined,
        facebook: facebook || undefined, strava_id: stravaId || undefined,
      } : prev)
      setSaveOk(true); setTimeout(() => setSaveOk(false), 3000)
    }
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

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '2px solid rgba(0,0,0,0.08)', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 13, color: T.muted }}>Carregando…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── Field label helper ────────────────────────────────────────────────────────
  const isIncomplete = !profile?.nome || !profile?.data_nascimento || !profile?.cidade || !profile?.regiao || !profile?.telefone || !profile?.apelido

  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }
  const req = <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
  const inpForm: React.CSSProperties = { ...inp, fontSize: 14 }
  const selForm: React.CSSProperties = { ...sel, fontSize: 14 }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB: CONTA
  // ─────────────────────────────────────────────────────────────────────────────
  const tabConta = (
    <div>

      {/* Banner perfil incompleto */}
      {isIncomplete && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <IconAlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.5 }}>
            Complete seu perfil — alguns dados obrigatórios estão faltando.
          </p>
        </div>
      )}

      {/* ── Formulário de dados pessoais ── */}
      <div style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.border}`, padding: '20px', marginBottom: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 18px' }}>Dados pessoais</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Nome completo */}
          <div>
            <label style={lbl}>Nome completo{req}</label>
            <input style={inpForm} type="text" value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Seu nome completo" />
          </div>

          {/* Apelido + Data nascimento */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Apelido{req}</label>
              <input style={inpForm} type="text" value={apelido}
                onChange={e => setApelido(e.target.value)}
                placeholder="Como te chamam" />
            </div>
            <div>
              <label style={lbl}>Data de nascimento{req}</label>
              <input style={inpForm} type="date" value={dataNascimento}
                onChange={e => setDataNascimento(e.target.value)} />
            </div>
          </div>

          {/* Estado + Cidade */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Estado{req}</label>
              <select style={selForm} value={regiao} onChange={e => setRegiao(e.target.value)}>
                <option value="">Selecione</option>
                {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Cidade{req}</label>
              <input style={inpForm} type="text" value={cidade}
                onChange={e => setCidade(e.target.value)}
                placeholder="Sua cidade" />
            </div>
          </div>

          {/* E-mail (bloqueado) */}
          <div>
            <label style={lbl}>
              E-mail
              <IconLock size={11} style={{ marginLeft: 5, color: T.dim }} />
            </label>
            <input style={{ ...inpForm, color: T.dim, cursor: 'not-allowed' }}
              type="email" value={profile?.email || ''} disabled />
          </div>

          {/* Telefone + WhatsApp */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={lbl}>Telefone / WhatsApp{req}</label>
              <input style={inpForm} type="tel" value={telefone}
                onChange={e => setTelefone(formatPhone(e.target.value))}
                placeholder="+55 (11) 99999-9999" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 13 }}>
              <Toggle checked={telefoneWhatsapp} onChange={v => setTelefoneWhatsapp(v)} />
              <span style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>WhatsApp</span>
            </div>
          </div>

        </div>
      </div>

      {/* ── Redes sociais e integrações (opcional) ── */}
      <div style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.border}`, padding: '20px', marginBottom: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 18px' }}>
          Redes sociais <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— todos opcionais</span>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Instagram */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={lbl}>
                <IconBrandInstagram size={14} style={{ marginRight: 5, color: '#E1306C' }} />Instagram
              </label>
              <input style={inpForm} type="text" value={instagram}
                onChange={e => { const v = e.target.value; setInstagram(v && !v.startsWith('@') ? '@' + v : v) }}
                placeholder="@seu_perfil" />
            </div>
            {instagram && (
              <a href={`https://instagram.com/${instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: '#eaece4', borderRadius: 12, color: '#E1306C', textDecoration: 'none', flexShrink: 0 }}>
                <IconExternalLink size={16} />
              </a>
            )}
          </div>

          {/* Telegram */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={lbl}>
                <IconBrandTelegram size={14} style={{ marginRight: 5, color: '#26A5E4' }} />Telegram
              </label>
              <input style={inpForm} type="text" value={telegram}
                onChange={e => { const v = e.target.value; setTelegram(v && !v.startsWith('@') ? '@' + v : v) }}
                placeholder="@seu_username" />
            </div>
            {telegram ? (
              <a href={`https://t.me/${telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: '#eaece4', borderRadius: 12, color: '#26A5E4', textDecoration: 'none', flexShrink: 0 }}>
                <IconExternalLink size={16} />
              </a>
            ) : (
              <button type="button" onClick={() => setSheetField('telegram')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: '#eaece4', borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                <IconSettings size={16} style={{ color: T.muted }} />
              </button>
            )}
          </div>

          {/* Facebook */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={lbl}>
                <IconBrandFacebook size={14} style={{ marginRight: 5, color: '#1877F2' }} />Facebook
              </label>
              <input style={inpForm} type="text" value={facebook}
                onChange={e => setFacebook(e.target.value)}
                placeholder="facebook.com/seuperfil ou @handle" />
            </div>
            {facebook && (
              <a href={facebook.startsWith('http') ? facebook : `https://facebook.com/${facebook}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: '#eaece4', borderRadius: 12, color: '#1877F2', textDecoration: 'none', flexShrink: 0 }}>
                <IconExternalLink size={16} />
              </a>
            )}
          </div>

          {/* Strava ID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={lbl}>
                <IconBrandStrava size={14} style={{ marginRight: 5, color: '#FC4C02' }} />Strava ID
              </label>
              <input style={inpForm} type="text" value={stravaId}
                onChange={e => setStravaId(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex: 12345678" />
              <p style={{ fontSize: 11, color: T.dim, margin: '4px 0 0', lineHeight: 1.4 }}>
                Encontre em strava.com/athletes/SEU_ID
              </p>
            </div>
            {stravaId && (
              <a href={`https://www.strava.com/athletes/${stravaId}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: '#eaece4', borderRadius: 12, color: '#FC4C02', textDecoration: 'none', flexShrink: 0, alignSelf: 'start', marginTop: 22 }}>
                <IconExternalLink size={16} />
              </a>
            )}
          </div>

        </div>

        {/* Erro de validação */}
        {formError && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginTop: 16 }}>
            {formError}
          </div>
        )}

        {/* Botão salvar */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 20, width: '100%',
            background: saveOk ? '#16a34a' : saving ? T.border : T.primary,
            color: saving ? T.muted : '#fff',
            border: 'none', borderRadius: 14, padding: '14px',
            fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {saving && <Spinner size={14} />}
          {saveOk ? '✓ Salvo!' : saving ? 'Salvando…' : 'Salvar dados'}
        </button>
      </div>

      {/* ── Trilhas ── */}
      <ProfileSection title="Trilhas">
        <InfoRow
          icon="ti-heart" label="Favoritas"
          value={`${trilhasFavoritas.length} trilha${trilhasFavoritas.length !== 1 ? 's' : ''}`}
          onTap={() => { window.location.href = '/dashboard' }}
        />
        <Divider />
        <InfoRow
          icon="ti-map-pin" label="Que cadastrei"
          value={`${minhasTrilhas.length} trilha${minhasTrilhas.length !== 1 ? 's' : ''}`}
          onTap={() => { window.location.href = '/perfil/minhas-trilhas' }}
        />
        <Divider />
        <InfoRow
          icon="ti-plus" label="Cadastrar nova trilha" value="Publicar no catálogo"
          onTap={() => { window.location.href = '/trilhas/cadastrar' }}
        />
        {profile?.is_admin && (
          <>
            <Divider />
            <InfoRow
              icon="ti-brand-strava" label="Importar Strava" value="Segmentos e rotas"
              onTap={() => { window.location.href = '/admin/importar-strava' }}
            />
            <Divider />
            <InfoRow
              icon="ti-checklist" label="Administrar Trilhas" value="Catálogo e importações"
              onTap={() => { window.location.href = '/admin' }}
            />
          </>
        )}
      </ProfileSection>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB: ALERTAS
  // ─────────────────────────────────────────────────────────────────────────────
  const tabAlertas = (
    <div>
      <ProfileSection title="Notificações">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: receberEmail ? 'rgba(109,116,95,0.1)' : '#eaece4',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background 0.2s',
          }}>
            <IconMail size={18} style={{ color: receberEmail ? T.primary : T.muted }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Report diário por e-mail</span>
              {emailSaving && <Spinner size={12} />}
              {emailSaved && !emailSaving && <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>✓ Salvo</span>}
            </div>
            <span style={{ fontSize: 12, color: T.muted }}>Previsão das suas trilhas favoritas</span>
          </div>
          <Toggle checked={receberEmail} onChange={handleEmailToggle} disabled={emailSaving} />
        </div>

        {receberEmail && (
          <div style={{ background: '#eaece4', borderRadius: 12, padding: '14px 16px', marginBottom: 16, border: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.7 }}>
              <span style={{ color: T.text, fontWeight: 600 }}>Horários (BRT):</span><br />
              {REPORT_SCHEDULE.map((s, i) => (
                <span key={s.hora}>
                  {s.dias} às <strong style={{ color: T.text }}>{s.hora}</strong>
                  {i < REPORT_SCHEDULE.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </p>
          </div>
        )}
      </ProfileSection>

      {!receberEmail && (
        <p style={{ fontSize: 13, color: T.muted, padding: '0 4px', lineHeight: 1.7 }}>
          Ative para receber um report com as condições das suas trilhas favoritas em cada janela de envio.
        </p>
      )}

      {/* ── Telegram ── */}
      {(() => {
        const hasUsername = !!telegram
        const isLinked    = !!profile?.telegram_chat_id
        const isAtivo     = !!profile?.telegram_ativo

        return (
          <ProfileSection title="Telegram">
            <div style={{ padding: '16px 0' }}>

              {/* Status header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: isAtivo ? 'rgba(38,165,228,0.12)' : !hasUsername ? '#eaece4' : 'rgba(251,191,36,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.2s',
                }}>
                  <IconBrandTelegram size={18} style={{ color: isAtivo ? '#26A5E4' : !hasUsername ? T.muted : '#f59e0b' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Notificações via Telegram</span>
                    {isAtivo && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(74,222,128,0.15)', color: '#16a34a', borderRadius: 20, padding: '2px 8px' }}>ATIVO</span>
                    )}
                    {hasUsername && !isLinked && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(251,191,36,0.15)', color: '#d97706', borderRadius: 20, padding: '2px 8px' }}>PENDENTE</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: T.muted }}>
                    {isAtivo
                      ? `${telegram} — recebendo alertas nos horários do report`
                      : hasUsername
                        ? `${telegram} salvo — bot ainda não iniciado`
                        : 'Receba alertas das suas trilhas direto no Telegram'}
                  </span>
                </div>
              </div>

              {/* State: not configured */}
              {!hasUsername && (
                <div style={{ background: '#eaece4', borderRadius: 12, padding: '16px', border: `1px solid ${T.border}` }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: '0 0 8px' }}>Como configurar</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { step: '1', done: false, text: 'Salve seu @username do Telegram no perfil' },
                      { step: '2', done: false, text: 'Abra o bot @mtbforecaster_bot e envie /start' },
                    ].map(s => (
                      <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.primary, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.step}</span>
                        <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheetField('telegram')}
                    style={{
                      marginTop: 14, width: '100%', background: T.primary, color: '#fff',
                      border: 'none', borderRadius: 12, padding: '12px', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                    <IconBrandTelegram size={16} />
                    Adicionar meu @username
                  </button>
                </div>
              )}

              {/* State: username saved, bot not started */}
              {hasUsername && !isLinked && (
                <div style={{ background: 'rgba(251,191,36,0.08)', borderRadius: 12, padding: '16px', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: '0 0 10px' }}>Falta só um passo!</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 13, color: T.muted }}><strong style={{ color: T.text }}>{telegram}</strong> salvo no perfil</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>2</span>
                      <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                        Abra o Telegram e envie <strong style={{ color: T.text }}>/start</strong> para <strong style={{ color: T.text }}>@mtbforecaster_bot</strong>
                      </span>
                    </div>
                  </div>
                  <a
                    href="https://t.me/mtbforecaster_bot?start=activate"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      background: '#26A5E4', color: '#fff', borderRadius: 12,
                      padding: '12px', fontSize: 13, fontWeight: 700,
                      textDecoration: 'none', width: '100%', boxSizing: 'border-box',
                    }}>
                    <IconBrandTelegram size={16} />
                    Abrir @mtbforecaster_bot no Telegram
                  </a>
                </div>
              )}

              {/* State: active */}
              {isAtivo && (
                <div style={{ background: 'rgba(74,222,128,0.08)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(74,222,128,0.25)' }}>
                  <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.7 }}>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Tudo certo!</span> Você vai receber notificações nos horários do report:<br />
                    {REPORT_SCHEDULE.map((s, i) => (
                      <span key={s.hora}>
                        {s.dias} às <strong style={{ color: T.text }}>{s.hora}</strong>
                        {i < REPORT_SCHEDULE.length - 1 ? ' · ' : ''}
                      </span>
                    ))}
                  </p>
                </div>
              )}

            </div>
          </ProfileSection>
        )
      })()}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB: PLANO
  // ─────────────────────────────────────────────────────────────────────────────
  const tabPlano = (
    <div>
      {/* Plan card */}
      <div style={{
        background: isPago
          ? `linear-gradient(135deg, #eaece4 0%, #f4f5f0 60%, #e2e5da 100%)`
          : T.card,
        borderRadius: 24,
        border: isPago ? `1px solid rgba(109,116,95,0.3)` : `1px solid ${T.border}`,
        padding: '28px 24px', marginBottom: 12, position: 'relative', overflow: 'hidden',
      }}>
        {isPago && (
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(109,116,95,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: isPago ? T.primary : T.muted, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 6 }}>
              {isPago ? '⭐ Plano atual' : 'Plano atual'}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: T.text, letterSpacing: '-0.04em' }}>{plano.nome.toUpperCase()}</div>
          </div>
          {isPago && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: T.primary, letterSpacing: '-0.03em' }}>R${plano.preco}</div>
              <div style={{ fontSize: 12, color: T.muted }}>/mês</div>
            </div>
          )}
        </div>

        <p style={{ fontSize: 13, color: T.muted, margin: '0 0 20px', lineHeight: 1.6 }}>{plano.descricao}</p>

        <div style={{ marginBottom: 24 }}>
          {plano.features.map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0' }}>
              <IconCircleCheck size={16} style={{ color: isPago ? T.primary : '#4ade80', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>

        {isPago ? (
          <button onClick={handlePortal} disabled={portalLoading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#eaece4', color: T.text,
              border: `1px solid ${T.border}`, borderRadius: 12,
              padding: '11px 20px', fontSize: 13, fontWeight: 600,
              cursor: portalLoading ? 'not-allowed' : 'pointer',
            }}>
            {portalLoading ? <Spinner size={13} /> : <IconExternalLink size={15} />}
            Gerenciar assinatura
          </button>
        ) : (
          <Link href="/planos" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: T.primary, color: '#fff',
            borderRadius: 14, padding: '13px 24px',
            fontSize: 14, fontWeight: 800, textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(109,116,95,0.25)',
          }}>
            <IconRocket size={16} />
            Fazer upgrade
          </Link>
        )}
      </div>

      {/* Other plans teaser */}
      {!isPago && (
        <div style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.border}`, padding: '20px 24px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: '0 0 14px' }}>Com o upgrade você ganha:</p>
          {['Alertas Telegram em tempo real', 'Escolha o horário do report', 'Integração com Strava', 'Histórico de condições'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <IconCircleCheck size={15} style={{ color: T.primary, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T.muted }}>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB: INTEGRAÇÕES
  // ─────────────────────────────────────────────────────────────────────────────
  const INTEGRACOES = [
    {
      nome: 'Strava',
      sub: 'Segmentos favoritos e histórico de atividades',
      icon: <IconBrandStrava size={22} style={{ color: '#FC4C02' }} />,
      bg: 'rgba(252,76,2,0.10)',
      border: 'rgba(252,76,2,0.20)',
      color: '#FC4C02',
    },
    {
      nome: 'Garmin Connect',
      sub: 'Sincronizar treinos e dados de performance',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#006BBD"/>
          <path d="M8 12a4 4 0 1 1 8 0 4 4 0 0 1-8 0z" fill="#fff"/>
          <path d="M12 8v4l3 2" stroke="#006BBD" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      bg: 'rgba(0,107,189,0.10)',
      border: 'rgba(0,107,189,0.20)',
      color: '#006BBD',
    },
    {
      nome: 'Zepp / Amazfit',
      sub: 'Monitoramento de saúde e métricas de treino',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="2" width="20" height="20" rx="6" fill="#00BCD4"/>
          <path d="M7 17L12 7l5 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 13h6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ),
      bg: 'rgba(0,188,212,0.10)',
      border: 'rgba(0,188,212,0.20)',
      color: '#00BCD4',
    },
  ]

  const tabIntegracoes = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {INTEGRACOES.map(integ => (
        <div
          key={integ.nome}
          style={{
            background: '#f9f9f7',
            borderRadius: 20,
            border: `1px solid ${T.border}`,
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            opacity: 0.55,
            cursor: 'not-allowed',
            filter: 'grayscale(0.4)',
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: '#eaece4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {integ.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 3 }}>{integ.nome}</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{integ.sub}</div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.8px',
            background: '#e5e7e0',
            color: '#8a9280',
            borderRadius: 20, padding: '4px 10px',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            EM BREVE
          </span>
        </div>
      ))}

      <p style={{ fontSize: 12, color: T.muted, padding: '4px 4px 0', lineHeight: 1.7 }}>
        As integrações vão permitir importar atividades, segmentos e métricas de performance diretamente para o MTB Forecaster.
      </p>
    </div>
  )

  const tabContent: Record<Tab, React.ReactNode> = {
    conta: tabConta, alertas: tabAlertas, plano: tabPlano, integracoes: tabIntegracoes,
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'conta',        label: 'Conta',        icon: 'ti-user' },
    { id: 'alertas',      label: 'Alertas',      icon: 'ti-bell' },
    { id: 'plano',        label: 'Plano',        icon: 'ti-credit-card' },
    { id: 'integracoes',  label: 'Integrações',  icon: 'ti-plug' },
  ]

  // ─────────────────────────────────────────────────────────────────────────────
  // SHEET CONTENT
  // ─────────────────────────────────────────────────────────────────────────────

  function renderSheet() {
    if (!sheetField) return null

    if (sheetField === 'telegram') return (
      <EditSheet open title="Configurar Telegram" onClose={() => setSheetField(null)}>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Passo 1 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: telegram ? '#16a34a' : T.primary, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {telegram ? '✓' : '1'}
                </span>
                <label style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Seu @username do Telegram</label>
              </div>
              <input style={inp} type="text" value={telegram}
                onChange={e => { const v = e.target.value; setTelegram(v && !v.startsWith('@') ? '@' + v : v) }}
                placeholder="@seu_username" autoFocus />
              <p style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
                Encontre em Configurações → Nome de usuário no app do Telegram.
              </p>
            </div>

            {/* Passo 2 */}
            <div style={{ background: '#eaece4', borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: profile?.telegram_chat_id ? '#16a34a' : '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {profile?.telegram_chat_id ? '✓' : '2'}
                </span>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                  {profile?.telegram_chat_id ? 'Bot vinculado!' : 'Inicie o bot no Telegram'}
                </span>
              </div>
              {profile?.telegram_chat_id ? (
                <p style={{ fontSize: 12, color: '#16a34a', margin: 0, fontWeight: 600 }}>
                  ✓ Tudo configurado — você já recebe notificações pelo Telegram.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: T.muted, margin: '0 0 10px', lineHeight: 1.6 }}>
                    Após salvar seu username, abra o Telegram e envie <strong style={{ color: T.text }}>/start</strong> para <strong style={{ color: T.text }}>@mtbforecaster_bot</strong>.
                  </p>
                  <a
                    href="https://t.me/mtbforecaster_bot?start=activate"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      background: '#26A5E4', color: '#fff', borderRadius: 10,
                      padding: '10px 14px', fontSize: 13, fontWeight: 600,
                      textDecoration: 'none',
                    }}>
                    <IconBrandTelegram size={15} />
                    Abrir @mtbforecaster_bot
                  </a>
                </>
              )}
            </div>
          </div>

          <SheetSaveBtn onClick={async () => { await handleSave(); setSheetField(null) }} loading={saving} />
        </div>
      </EditSheet>
    )

    return null
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg, overflowX: 'hidden' }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(60px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

        .perfil-tab-bar::-webkit-scrollbar { display: none; }

        /* Nav select hover */
        .perfil-tab-btn:active { opacity: 0.75; }
      `}</style>

      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* ── HERO ── */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            background: `linear-gradient(160deg, #eaece4 0%, ${T.card} 60%, #f4f5f0 100%)`,
            borderRadius: 24, border: `1px solid ${T.border}`,
            padding: '24px 20px 20px', position: 'relative', overflow: 'hidden',
          }}>
            {/* Glow */}
            <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(109,116,95,0.07) 0%, transparent 65%)', pointerEvents: 'none' }} />

            {/* Avatar + identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#eaece4', border: `2.5px solid ${T.border}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {avatarUploading
                    ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}><Spinner size={24} /></div>
                    : avatarUrl
                      ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 32, fontWeight: 900, color: T.primary }}>{initials}</span>}
                </div>
                <label style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 28, height: 28, borderRadius: '50%',
                  background: T.primary, border: `2.5px solid ${T.card}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#fff',
                }} title="Trocar foto">
                  ✎
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={avatarUploading} />
                </label>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: T.text, margin: '0 0 2px', letterSpacing: '-0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </h1>
                {profile?.apelido && (
                  <p style={{ fontSize: 13, color: T.muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{profile.apelido}
                  </p>
                )}
              </div>
            </div>

            {/* Info grid */}
            <div style={{ height: 1, background: T.border, marginBottom: 16 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {nome && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IconUser size={14} style={{ color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
                </div>
              )}
              {regiao && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IconMapPin size={14} style={{ color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text }}>{estadoLabel(regiao)}</span>
                </div>
              )}
              {telefone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IconDeviceMobile size={14} style={{ color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text }}>{telefone}</span>
                  {telefoneWhatsapp && <span style={{ fontSize: 10, background: 'rgba(37,211,102,0.12)', color: '#25D366', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>WhatsApp</span>}
                </div>
              )}
              {instagram && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <IconBrandInstagram size={14} style={{ color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text }}>{instagram.startsWith('@') ? instagram : `@${instagram}`}</span>
                </div>
              )}
            </div>

            {avatarError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 10, margin: 0 }}>{avatarError}</p>}
          </div>
        </div>

        {/* ── STATS ── */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Favoritas',    value: trilhasFavoritas.length, href: '/trilhas' },
              { label: 'Cadastradas',  value: minhasTrilhas.length,    href: '/perfil/minhas-trilhas' },
              { label: 'Alertas ativos', value: (receberEmail ? 1 : 0) + (profile?.telegram_ativo ? 1 : 0), href: undefined },
              { label: 'Segmentos',    value: 0,                       href: undefined },
            ].map(s => {
              const inner = (
                <div style={{
                  background: T.card2, borderRadius: 16, padding: '16px 18px',
                  border: `1px solid ${s.href ? 'rgba(109,116,95,0.25)' : T.border}`,
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: s.value > 0 ? T.text : T.dim, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>
                    {s.value > 0 ? s.value : '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{s.label}</span>
                    {s.href && <IconArrowRight size={10} style={{ color: T.dim }} />}
                  </div>
                </div>
              )
              return s.href
                ? <Link key={s.label} href={s.href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link>
                : <div key={s.label}>{inner}</div>
            })}
          </div>
        </div>

        {/* ── SEGMENTED CONTROL ── */}
        <div className="perfil-tab-bar" style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: T.bg,
          display: 'flex', gap: 8,
          overflowX: 'auto', scrollbarWidth: 'none',
          padding: '12px 16px',
          borderBottom: `1px solid ${T.border}`,
          WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className="perfil-tab-btn"
              onClick={() => setTab(t.id)}
              style={{
                flexShrink: 0, whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 20,
                background: tab === t.id ? T.primary : 'transparent',
                color: tab === t.id ? '#000' : T.muted,
                border: tab === t.id ? 'none' : `1px solid ${T.border}`,
                fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.18s',
                outline: 'none',
              }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div style={{ padding: '16px 16px 120px' }}>
          {tabContent[tab]}

          {/* ── LOGOUT ── */}
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', background: 'transparent', border: 'none',
              padding: '16px 20px', borderRadius: 16, cursor: 'pointer',
              color: '#ef4444', fontSize: 14, fontWeight: 600, marginTop: 8,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <IconLogout size={18} />
            Sair da conta
          </button>
        </div>

      </div>

      {/* ── STICKY SAVE BUTTON ── */}
      <div style={{
        position: 'fixed', bottom: 80, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        padding: '0 16px', zIndex: 30, pointerEvents: (isDirty && !sheetField) ? 'auto' : 'none',
        opacity: (isDirty && !sheetField) ? 1 : 0,
        transform: (isDirty && !sheetField) ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.25s, transform 0.25s',
      }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            maxWidth: 480, width: '100%',
            background: saving ? '#d0d4c6' : T.primary,
            color: saving ? T.muted : '#fff',
            border: 'none', borderRadius: 16, padding: '15px 24px',
            fontSize: 15, fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: `0 8px 32px rgba(109,116,95,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'background 0.15s',
          }}
        >
          {saving ? <Spinner size={16} /> : <IconDeviceFloppy size={18} />}
          {saving ? 'Salvando…' : saveOk ? '✓ Alterações salvas' : 'Salvar alterações'}
        </button>
      </div>

      {/* ── EDIT SHEETS ── */}
      {renderSheet()}
    </div>
  )
}
