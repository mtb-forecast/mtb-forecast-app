'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import { Profile, Trilha, ESTADOS_BRASIL } from '@/lib/types'
import { PLANOS } from '@/lib/stripe-config'

type Tab = 'conta' | 'alertas' | 'plano' | 'integracoes'
type SheetField = 'nome' | 'telefone' | 'regiao' | 'telegram' | 'instagram' | null
type TrilhaPendente = {
  id: string; name: string; regiao: string
  status: string; motivo_rejeicao?: string | null; created_at: string
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#0b0b0b',
  card:     '#141414',
  card2:    '#1c1c1c',
  border:   '#252525',
  primary:  '#f4c542',
  text:     '#ffffff',
  muted:    '#8b8b8b',
  dim:      '#3a3a3a',
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
      border: '2px solid rgba(255,255,255,0.12)',
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
        background: checked ? T.primary : '#2a2a2a',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s', outline: 'none',
      }}>
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 22, height: 22, background: checked ? '#000' : '#555',
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
        width: 40, height: 40, borderRadius: 12, background: '#232323',
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
      {locked && <i className="ti ti-lock" style={{ fontSize: 14, color: T.dim, flexShrink: 0 }} />}
      {!locked && onTap && <i className="ti ti-chevron-right" style={{ fontSize: 14, color: T.dim, flexShrink: 0 }} />}
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
  background: '#1a1a1a', border: `1.5px solid ${T.border}`,
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
        background: loading ? '#2a2a2a' : T.primary,
        color: loading ? T.muted : '#000',
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
  const [adminOpen, setAdminOpen] = useState(false)

  // Form state
  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [telefone, setTelefone] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(true)
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')
  const [instagram, setInstagram] = useState('')

  // Counters
  const [minhasTrilhas, setMinhasTrilhas] = useState<TrilhaPendente[]>([])
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
        setTelefone(p.telefone || '')
        setTelefoneWhatsapp(p.telefone_whatsapp ?? true)
        setRegiao(p.regiao || '')
        setTelegram(p.telegram_username || '')
        setInstagram(p.instagram || '')
        setReceberEmail((p as Record<string,unknown>).receber_email as boolean ?? false)
        setAvatarUrl(p.avatar_url || null)
      }
      const [{ data: minhas }, { data: favIds }] = await Promise.all([
        supabase.from('trilhas_pendentes').select('id,name,regiao,status,motivo_rejeicao,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
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
  const planoId = (profile?.plano || 'gratuito') as keyof typeof PLANOS
  const plano = PLANOS[planoId] ?? PLANOS.gratuito
  const isPago = plano.preco > 0
  const displayName = profile?.apelido || profile?.nome || '–'
  const initials = displayName[0]?.toUpperCase() ?? '?'
  const isDirty = !!(profile && (
    nome !== (profile.nome || '') ||
    apelido !== (profile.apelido || '') ||
    telefone !== (profile.telefone || '') ||
    telefoneWhatsapp !== (profile.telefone_whatsapp ?? true) ||
    regiao !== (profile.regiao || '') ||
    telegram !== (profile.telegram_username || '') ||
    instagram !== (profile.instagram || '')
  ))

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      nome, apelido, telefone, telefone_whatsapp: telefoneWhatsapp,
      regiao, telegram_username: telegram || null,
      instagram: instagram || null,
    }).eq('id', profile.id)
    setSaving(false)
    if (!error) {
      setProfile(prev => prev ? { ...prev, nome, apelido, telefone, telefone_whatsapp: telefoneWhatsapp, regiao, telegram_username: telegram || undefined, instagram: instagram || undefined } : prev)
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
        <div style={{ width: 36, height: 36, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 13, color: T.muted }}>Carregando…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB: CONTA
  // ─────────────────────────────────────────────────────────────────────────────
  const tabConta = (
    <div>
      {/* Perfil */}
      <ProfileSection title="Perfil">
        <InfoRow
          icon="ti-user" label="Nome completo"
          value={nome || profile?.nome || ''}
          onTap={() => setSheetField('nome')}
        />
        <Divider />
        <InfoRow
          icon="ti-at" label="Apelido"
          value={apelido ? `@${apelido}` : ''}
          onTap={() => setSheetField('nome')}
        />
      </ProfileSection>

      {/* Região */}
      <div style={{
        background: `linear-gradient(135deg, #1c1800 0%, #141414 100%)`,
        borderRadius: 20, border: `1px solid rgba(244,197,66,0.15)`,
        padding: '18px 20px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
      }}
        onClick={() => setSheetField('regiao')}
      >
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(244,197,66,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-map-pin" style={{ fontSize: 20, color: T.primary }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'rgba(244,197,66,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 4 }}>
            Região principal
          </div>
          <div style={{ fontSize: 16, color: regiao ? T.text : T.muted, fontWeight: 700 }}>
            {regiao ? estadoLabel(regiao) : 'Não definida'}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Impacta diretamente as suas previsões</div>
        </div>
        <i className="ti ti-chevron-right" style={{ fontSize: 14, color: T.dim, flexShrink: 0 }} />
      </div>

      {/* Contato */}
      <ProfileSection title="Contato">
        <InfoRow icon="ti-mail" label="E-mail" value={profile?.email || ''} locked />
        <Divider />
        <InfoRow
          icon="ti-device-mobile" label="Celular"
          value={telefone}
          sub={telefone && telefoneWhatsapp ? '✓ WhatsApp' : undefined}
          onTap={() => setSheetField('telefone')}
        />
        <Divider />
        <InfoRow
          icon="ti-brand-instagram" label="Instagram"
          value={instagram ? (instagram.startsWith('@') ? instagram : `@${instagram}`) : ''}
          onTap={() => setSheetField('instagram')}
        />
      </ProfileSection>

      {/* Comunicação */}
      <ProfileSection title="Comunicação">
        {/* WhatsApp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#232323', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="ti ti-brand-whatsapp" style={{ fontSize: 20, color: '#25D366' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>WhatsApp</div>
            <div style={{ fontSize: 12, color: T.muted }}>Usar o telefone para notificações</div>
          </div>
          <Toggle checked={telefoneWhatsapp} onChange={v => setTelefoneWhatsapp(v)} />
        </div>

        <Divider />

        {/* Telegram */}
        {planoId === 'gratuito' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#232323', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.5 }}>
              <i className="ti ti-brand-telegram" style={{ fontSize: 20, color: '#26A5E4' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: T.muted, fontWeight: 600 }}>Telegram</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(244,197,66,0.15)', color: T.primary, borderRadius: 20, padding: '2px 8px', letterSpacing: '0.5px' }}>PREMIUM</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>Disponível no plano Básico</div>
            </div>
            <Link href="/planos" style={{ fontSize: 12, fontWeight: 700, color: T.primary, textDecoration: 'none', flexShrink: 0 }}>Upgrade</Link>
          </div>
        ) : (
          <InfoRow
            icon="ti-brand-telegram" label="Telegram"
            value={telegram || ''}
            sub={telegram ? 'Ativo' : 'Clique para configurar'}
            onTap={() => setSheetField('telegram')}
          />
        )}
      </ProfileSection>

      {/* Minhas trilhas */}
      <ProfileSection title="Trilhas">
        <Link href="/trilhas" style={{ textDecoration: 'none', color: 'inherit' }}>
          <InfoRow
            icon="ti-heart" label="Favoritas"
            value={`${trilhasFavoritas.length} trilha${trilhasFavoritas.length !== 1 ? 's' : ''}`}
          />
        </Link>
        <Divider />
        <Link href="/perfil/minhas-trilhas" style={{ textDecoration: 'none', color: 'inherit' }}>
          <InfoRow
            icon="ti-map-pin" label="Que cadastrei"
            value={`${minhasTrilhas.length} trilha${minhasTrilhas.length !== 1 ? 's' : ''}`}
          />
        </Link>
        <Divider />
        <Link href="/trilhas/cadastrar" style={{ textDecoration: 'none', color: 'inherit' }}>
          <InfoRow icon="ti-plus" label="Cadastrar nova trilha" value="Publicar no catálogo" />
        </Link>
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
            background: receberEmail ? 'rgba(244,197,66,0.1)' : '#232323',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background 0.2s',
          }}>
            <i className="ti ti-mail" style={{ fontSize: 18, color: receberEmail ? T.primary : T.muted }} />
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
          <div style={{ background: '#111', borderRadius: 12, padding: '14px 16px', marginBottom: 16, border: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.7 }}>
              <span style={{ color: T.text, fontWeight: 600 }}>Horários (BRT):</span><br />
              Seg–Dom às <strong style={{ color: T.text }}>06h</strong> · Sex–Dom às <strong style={{ color: T.text }}>12h</strong> · Sex–Sáb às <strong style={{ color: T.text }}>20h</strong>
            </p>
          </div>
        )}
      </ProfileSection>

      {!receberEmail && (
        <p style={{ fontSize: 13, color: T.muted, padding: '0 4px', lineHeight: 1.7 }}>
          Ative para receber um report com as condições das suas trilhas favoritas em cada janela de envio.
        </p>
      )}
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
          ? `linear-gradient(135deg, #1c1800 0%, #141414 60%, #0b0b0b 100%)`
          : T.card,
        borderRadius: 24,
        border: isPago ? `1px solid rgba(244,197,66,0.25)` : `1px solid ${T.border}`,
        padding: '28px 24px', marginBottom: 12, position: 'relative', overflow: 'hidden',
      }}>
        {isPago && (
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,197,66,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
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
              <i className="ti ti-circle-check" style={{ fontSize: 16, color: isPago ? T.primary : '#4ade80', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: isPago ? '#e5e5e5' : T.muted, lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>

        {isPago ? (
          <button onClick={handlePortal} disabled={portalLoading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.08)', color: '#ccc',
              border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 12,
              padding: '11px 20px', fontSize: 13, fontWeight: 600,
              cursor: portalLoading ? 'not-allowed' : 'pointer',
            }}>
            {portalLoading ? <Spinner size={13} /> : <i className="ti ti-external-link" style={{ fontSize: 15 }} />}
            Gerenciar assinatura
          </button>
        ) : (
          <Link href="/planos" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: T.primary, color: '#000',
            borderRadius: 14, padding: '13px 24px',
            fontSize: 14, fontWeight: 800, textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(244,197,66,0.25)',
          }}>
            <i className="ti ti-rocket" style={{ fontSize: 16 }} />
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
              <i className="ti ti-circle-check" style={{ fontSize: 15, color: T.primary, flexShrink: 0 }} />
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
  const tabIntegracoes = (
    <div>
      <ProfileSection title="Strava">
        <Link href="/perfil/strava" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 0' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(252,76,2,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-brand-strava" style={{ fontSize: 20, color: '#FC4C02' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 3 }}>Strava</div>
              <div style={{ fontSize: 12, color: T.muted }}>Conectar conta e importar segmentos</div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize: 14, color: T.dim }} />
          </div>
        </Link>
      </ProfileSection>

      <p style={{ fontSize: 12, color: T.muted, padding: '0 4px', lineHeight: 1.7 }}>
        A integração com o Strava permite importar seus segmentos favoritos e receber alertas de condições personalizados.
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

    if (sheetField === 'nome') return (
      <EditSheet open title="Nome e apelido" onClose={() => setSheetField(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Nome completo</label>
            <input style={inp} type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome completo" autoFocus />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Apelido</label>
            <input style={inp} type="text" value={apelido} onChange={e => setApelido(e.target.value)} placeholder="Como te chamam" />
          </div>
          <SheetSaveBtn onClick={() => setSheetField(null)} />
        </div>
      </EditSheet>
    )

    if (sheetField === 'telefone') return (
      <EditSheet open title="Telefone" onClose={() => setSheetField(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Número</label>
            <input style={inp} type="tel" value={telefone} onChange={e => setTelefone(formatPhone(e.target.value))} placeholder="+55 (11) 99999-9999" autoFocus />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
            <Toggle checked={telefoneWhatsapp} onChange={v => setTelefoneWhatsapp(v)} />
            <span style={{ fontSize: 14, color: T.text }}>Este número tem WhatsApp</span>
          </div>
          <SheetSaveBtn onClick={() => setSheetField(null)} />
        </div>
      </EditSheet>
    )

    if (sheetField === 'regiao') return (
      <EditSheet open title="Região principal" onClose={() => setSheetField(null)}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Estado</label>
          <select style={sel} value={regiao} onChange={e => setRegiao(e.target.value)}>
            <option value="">Selecione seu estado</option>
            {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.6 }}>
            A região define quais dados meteorológicos são usados nas previsões do seu dashboard.
          </p>
          <SheetSaveBtn onClick={() => setSheetField(null)} />
        </div>
      </EditSheet>
    )

    if (sheetField === 'telegram') return (
      <EditSheet open title="Telegram" onClose={() => setSheetField(null)}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Username</label>
          <input style={inp} type="text" value={telegram}
            onChange={e => { const v = e.target.value; setTelegram(v && !v.startsWith('@') ? '@' + v : v) }}
            placeholder="@seu_username" autoFocus />
          <div style={{ background: '#111', borderRadius: 12, padding: '14px', marginTop: 12, border: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 12, color: T.muted, margin: 0, lineHeight: 1.7 }}>
              Abra o Telegram e inicie uma conversa com <strong style={{ color: T.text }}>@mtbforecaster_bot</strong> enviando <strong style={{ color: T.text }}>/start</strong> para ativar as notificações.
            </p>
          </div>
          <SheetSaveBtn onClick={() => setSheetField(null)} />
        </div>
      </EditSheet>
    )

    if (sheetField === 'instagram') return (
      <EditSheet open title="Instagram" onClose={() => setSheetField(null)}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Perfil do Instagram</label>
          <input style={inp} type="text" value={instagram}
            onChange={e => { const v = e.target.value; setInstagram(v && !v.startsWith('@') ? '@' + v : v) }}
            placeholder="@seu_perfil" autoFocus />
          <p style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.6 }}>
            Seu handle aparece no card de perfil e ajuda outros riders a te encontrar.
          </p>
          <SheetSaveBtn onClick={() => setSheetField(null)} />
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
            background: `linear-gradient(160deg, #1e1e1e 0%, ${T.card} 60%, #0e0e0e 100%)`,
            borderRadius: 24, border: `1px solid ${T.border}`,
            padding: '24px 20px 20px', position: 'relative', overflow: 'hidden',
          }}>
            {/* Glow */}
            <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,197,66,0.07) 0%, transparent 65%)', pointerEvents: 'none' }} />

            {/* Avatar + identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#232323', border: `2.5px solid ${T.border}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  fontSize: 13, fontWeight: 700, color: '#000',
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
                  <i className="ti ti-user" style={{ fontSize: 14, color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
                </div>
              )}
              {regiao && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-map-pin" style={{ fontSize: 14, color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text }}>{regiao} — {estadoLabel(regiao)}</span>
                </div>
              )}
              {telefone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-device-mobile" style={{ fontSize: 14, color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text }}>{telefone}</span>
                  {telefoneWhatsapp && <span style={{ fontSize: 10, background: 'rgba(37,211,102,0.12)', color: '#25D366', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>WhatsApp</span>}
                </div>
              )}
              {instagram && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-brand-instagram" style={{ fontSize: 14, color: T.muted, width: 16, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text }}>{instagram.startsWith('@') ? instagram : `@${instagram}`}</span>
                </div>
              )}
            </div>

            {/* Plan row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isPago ? 'rgba(244,197,66,0.08)' : '#1a1a1a', borderRadius: 12, padding: '10px 14px', border: isPago ? '1px solid rgba(244,197,66,0.2)' : `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>{isPago ? '⭐' : '🎯'}</span>
                <div>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Plano atual</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: isPago ? T.primary : T.text, letterSpacing: '-0.02em' }}>{plano.nome}</div>
                </div>
              </div>
              {!isPago && (
                <Link href="/planos" style={{ fontSize: 12, fontWeight: 700, color: T.primary, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Upgrade <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                </Link>
              )}
              {isPago && <span style={{ fontSize: 11, background: 'rgba(244,197,66,0.15)', color: T.primary, borderRadius: 20, padding: '4px 10px', fontWeight: 700 }}>ATIVO</span>}
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
              { label: 'Alertas ativos', value: receberEmail ? 1 : 0, href: undefined },
              { label: 'Segmentos',    value: 0,                       href: undefined },
            ].map(s => {
              const inner = (
                <div style={{
                  background: T.card2, borderRadius: 16, padding: '16px 18px',
                  border: `1px solid ${s.href ? 'rgba(244,197,66,0.18)' : T.border}`,
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: s.value > 0 ? T.text : T.dim, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>
                    {s.value > 0 ? s.value : '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{s.label}</span>
                    {s.href && <i className="ti ti-arrow-right" style={{ fontSize: 10, color: T.dim }} />}
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

          {/* ── ADMIN ACCORDION ── */}
          {profile?.is_admin && (
            <div style={{ background: T.card, borderRadius: 20, border: `1px solid ${T.border}`, overflow: 'hidden', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setAdminOpen(o => !o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 20px', background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#1a1a00', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="ti ti-shield" style={{ fontSize: 18, color: T.primary }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Ferramentas administrativas</div>
                </div>
                <i className={`ti ti-chevron-${adminOpen ? 'up' : 'down'}`} style={{ fontSize: 14, color: T.muted, transition: 'transform 0.2s' }} />
              </button>

              {adminOpen && (
                <div style={{ borderTop: `1px solid ${T.border}`, padding: '8px 20px 16px', animation: 'slideUp 0.18s ease' }}>
                  {[
                    { href: '/admin', icon: 'ti-layout-dashboard', label: 'Painel' },
                    { href: '/admin/tabelas', icon: 'ti-table', label: 'Tabelas' },
                    { href: '/admin/importar-strava', icon: 'ti-brand-strava', label: 'Strava' },
                  ].map((item, i) => (
                    <Link key={item.href} href={item.href} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 0', textDecoration: 'none', color: T.text,
                      borderBottom: i < 2 ? `1px solid ${T.border}` : 'none',
                    }}>
                      <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: T.primary, width: 20, textAlign: 'center' }} />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                      <i className="ti ti-chevron-right" style={{ fontSize: 13, color: T.dim, marginLeft: 'auto' }} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

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
            <i className="ti ti-logout" style={{ fontSize: 18 }} />
            Sair da conta
          </button>
        </div>

      </div>

      {/* ── STICKY SAVE BUTTON ── */}
      <div style={{
        position: 'fixed', bottom: 80, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        padding: '0 16px', zIndex: 30, pointerEvents: isDirty ? 'auto' : 'none',
        opacity: isDirty ? 1 : 0,
        transform: isDirty ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.25s, transform 0.25s',
      }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            maxWidth: 480, width: '100%',
            background: saving ? '#2a2a2a' : T.primary,
            color: saving ? T.muted : '#000',
            border: 'none', borderRadius: 16, padding: '15px 24px',
            fontSize: 15, fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: `0 8px 32px rgba(244,197,66,0.35)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            transition: 'background 0.15s',
          }}
        >
          {saving ? <Spinner size={16} /> : <i className="ti ti-device-floppy" style={{ fontSize: 18 }} />}
          {saving ? 'Salvando…' : saveOk ? '✓ Alterações salvas' : 'Salvar alterações'}
        </button>
      </div>

      {/* ── EDIT SHEETS ── */}
      {renderSheet()}
    </div>
  )
}
