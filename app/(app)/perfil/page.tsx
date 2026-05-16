'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
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
  const [portalLoading, setPortalLoading] = useState(false)

  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [telefone, setTelefone] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(true)
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')

  const [receberEmail, setReceberEmail] = useState(false)
  const [emailFavoritas, setEmailFavoritas] = useState(true)
  const [emailStrava, setEmailStrava] = useState(true)
  const [emailSaveStatus, setEmailSaveStatus] = useState<'idle' | 'success'>('idle')

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
        setReceberEmail(profileData.receber_email ?? false)
        setEmailFavoritas(profileData.email_trilhas_favoritas ?? true)
        setEmailStrava(profileData.email_trilhas_strava ?? true)
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

  async function handleEmailToggle(field: 'receber_email' | 'email_trilhas_favoritas' | 'email_trilhas_strava', value: boolean) {
    if (!profile) return
    if (field === 'receber_email') setReceberEmail(value)
    else if (field === 'email_trilhas_favoritas') setEmailFavoritas(value)
    else if (field === 'email_trilhas_strava') setEmailStrava(value)
    await supabase.from('profiles').update({ [field]: value }).eq('id', profile.id)
    setEmailSaveStatus('success')
    setTimeout(() => setEmailSaveStatus('idle'), 2000)
  }

  const handleDesconectarStrava = async () => {
    const confirmar = window.confirm(
      'Desconectar o Strava irá remover todas as suas trilhas pessoais importadas e suas condições. Deseja continuar?'
    )
    if (!confirmar) return

    setLoading(true)
    try {
      await supabase
        .from('trilhas_pessoais')
        .delete()
        .eq('user_id', profile!.id)

      const { data: trilhasUser } = await supabase
        .from('strava_segmentos_config')
        .select('strava_segment_id')
        .eq('owner_user_id', profile!.id)

      if (trilhasUser) {
        for (const t of trilhasUser) {
          const { count } = await supabase
            .from('trilhas_pessoais')
            .select('id', { count: 'exact' })
            .eq('strava_segment_id', t.strava_segment_id)

          if (!count || count === 0) {
            await supabase
              .from('strava_segmentos_config')
              .delete()
              .eq('strava_segment_id', t.strava_segment_id)
              .eq('owner_user_id', profile!.id)
          }
        }
      }

      await fetch('/api/strava/disconnect', { method: 'POST' })

      setTrilhasPessoais([])
      alert('Strava desconectado com sucesso.')
    } catch (err) {
      console.error('Erro ao desconectar Strava:', err)
      alert('Erro ao desconectar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeletePessoal(id: string) {
    setDeletingId(id)
    await supabase.from('trilhas_pessoais').delete().eq('id', id)
    setTrilhasPessoais(prev => prev.filter(t => t.id !== id))
    setDeletingId(null)
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
                {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
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
              <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>
                Para receber notificações: busque @mtbforecaster_bot no Telegram, inicie com /start e informe seu @username acima.
              </p>
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

          {/* Toggle principal */}
          {[
            {
              field: 'receber_email' as const,
              label: 'Receber email diário com condições das trilhas',
              desc: 'Enviado todos os dias às 07:00 BRT com as condições das suas trilhas',
              checked: receberEmail,
              disabled: false,
              last: false,
            },
            {
              field: 'email_trilhas_favoritas' as const,
              label: 'Incluir minhas trilhas favoritas',
              desc: 'Condições das trilhas que você marcou como favoritas',
              checked: emailFavoritas,
              disabled: !receberEmail,
              last: false,
            },
            {
              field: 'email_trilhas_strava' as const,
              label: 'Incluir minhas trilhas do Strava',
              desc: 'Condições dos segmentos importados do Strava',
              checked: emailStrava,
              disabled: !receberEmail,
              last: true,
            },
          ].map(({ field, label, desc, checked, disabled, last }) => (
            <div
              key={field}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0',
                borderBottom: last ? 'none' : '0.5px solid #f0f0f0',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{label}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{desc}</span>
              </div>
              <button
                type="button"
                onClick={() => !disabled && handleEmailToggle(field, !checked)}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: checked && !disabled ? '#111' : checked ? '#555' : '#e5e5e5',
                  border: 'none',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  position: 'relative', flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2,
                  left: checked ? 22 : 2,
                  width: 20, height: 20,
                  background: '#fff', borderRadius: '50%',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}

          {/* Nota informativa */}
          <div style={{ background: '#f7f7f5', borderRadius: 6, padding: 12, marginTop: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <i className="ti ti-info-circle" style={{ fontSize: 16, color: '#888', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5, margin: 0 }}>
              O email é enviado diariamente às 07:00 BRT apenas se você tiver trilhas favoritas ou do Strava cadastradas. Você pode cancelar a qualquer momento.
            </p>
          </div>
        </div>

        {/* Minha assinatura */}
        {(() => {
          const planoId = (profile?.plano || 'gratuito') as keyof typeof PLANOS
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

        {/* Trilhas do Strava */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <SectionLabel>Trilhas do Strava</SectionLabel>
            <span style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>{slotsUsados} de {slotsLimite}</span>
          </div>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            Importe segmentos favoritos do Strava para receber previsões personalizadas.
          </p>

          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
            {trilhasPessoais.length > 0 && (
              <button
                onClick={handleDesconectarStrava}
                disabled={loading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'transparent', color: '#ef4444',
                  border: '1px solid #ef4444', borderRadius: 4,
                  padding: '8px 16px', fontSize: 13,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <i className="ti ti-brand-strava" style={{ fontSize: 16 }} />
                Desconectar Strava
              </button>
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
