'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'
import { IconBolt, IconMap2, IconBellRinging, IconSun, IconCheck } from '@tabler/icons-react'

type FormData = {
  nome: string
  apelido: string
  email: string
  password: string
  telefone: string
  telefone_whatsapp: boolean
  regiao: string
  telegram: string
}

type Errors = Partial<Record<keyof FormData, string>>

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  if (!d) return ''
  if (d.length <= 2) return '+' + d
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
}

function validate(data: FormData): Errors {
  const errors: Errors = {}
  if (!data.nome.trim()) errors.nome = 'Campo obrigatório'
  else if (data.nome.trim().length < 3) errors.nome = 'Mínimo 3 caracteres'
  if (!data.apelido.trim()) errors.apelido = 'Campo obrigatório'
  else if (data.apelido.trim().length < 2) errors.apelido = 'Mínimo 2 caracteres'
  if (!data.email) errors.email = 'Campo obrigatório'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'E-mail inválido'
  if (data.password.length < 6) errors.password = 'Mínimo 6 caracteres'
  if (!data.telefone) errors.telefone = 'Campo obrigatório'
  else if (data.telefone.replace(/\D/g, '').length < 10) errors.telefone = 'Mínimo 10 dígitos'
  if (!data.regiao) errors.regiao = 'Selecione sua região'
  return errors
}

function isFormValid(data: FormData): boolean {
  return Object.keys(validate(data)).length === 0
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: '#EF4444', marginTop: 4 }}>{msg}</p>
}

function RequiredStar() {
  return <span style={{ color: '#EF4444' }}> *</span>
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='800' height='900' viewBox='0 0 800 900'>
  <g fill='none' stroke='%236d745f' stroke-opacity='0.18' stroke-width='1.4'>
    <path d='M400,140 C500,130 580,200 590,310 C600,420 555,510 460,565 C365,620 260,600 205,515 C150,430 160,320 235,240 C295,180 350,150 400,140 Z'/>
    <path d='M400,90 C530,75 630,160 645,310 C660,460 600,575 490,640 C380,705 250,680 175,585 C100,490 115,335 205,245 C275,175 340,105 400,90 Z'/>
    <path d='M400,40 C560,25 680,130 700,310 C720,490 645,630 505,705 C365,780 205,750 115,635 C25,520 45,335 155,220 C245,125 330,55 400,40 Z'/>
    <path d='M400,-10 C590,-30 730,100 755,310 C780,520 690,685 520,770 C355,855 155,820 55,685 C-45,550 -25,335 105,195 C215,75 320,10 400,-10 Z'/>
    <path d='M400,-60 C620,-85 780,70 810,310 C840,550 735,740 535,835 C345,930 105,890 -5,735 C-115,580 -95,335 55,170 C185,25 310,-25 400,-60 Z'/>
  </g>
</svg>
`.replace(/\s+/g, ' ').trim()

const TOPO_DATA_URI = `url("data:image/svg+xml,${TOPO_SVG}")`

const CHEVRON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1.5L6 6.5L11 1.5' stroke='%239AA093' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>`
const CHEVRON_DATA_URI = `url("data:image/svg+xml,${CHEVRON_SVG.replace(/\s+/g, ' ').trim()}")`

const FEATURES = [
  { icon: IconMap2, text: 'Trilhas MTB com <b>modelo de solo por meia-vida</b>' },
  { icon: IconSun, text: 'Pump Tracks com <b>previsão de chuva</b> e reviews' },
  { icon: IconBellRinging, text: '<b>Alertas Telegram</b> quando sua trilha liberar' },
  { icon: IconBolt, text: 'Veredicto <b>DROP LIBERADO / MELHOR ESPERAR</b>' },
]

function FeatureLine({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/g)
  return (
    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093' }}>
      {parts.map((part, i) => {
        const m = part.match(/^<b>(.*)<\/b>$/)
        if (m) {
          return <b key={i} style={{ color: '#F4F3EF', fontWeight: 500 }}>{m[1]}</b>
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(244,243,239,.05)',
  border: '1px solid rgba(109,116,95,.28)',
  borderRadius: 10,
  padding: '11px 15px',
  fontSize: 15,
  color: '#F4F3EF',
  fontFamily: 'var(--font-dm-sans)',
  outline: 'none',
}

function fieldLabelStyle(): React.CSSProperties {
  return {
    fontFamily: 'var(--font-dm-mono)',
    fontSize: 11,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: '#9AA093',
    display: 'block',
    marginBottom: 7,
  }
}

function CadastroContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refParam = searchParams.get('ref')
  const trilhaParam = searchParams.get('trilha')
  const postSignupRedirect = refParam === 'whatsapp' && trilhaParam
    ? `/login?redirect=/trilhas/${trilhaParam}`
    : '/login'

  const [form, setForm] = useState<FormData>({
    nome: '',
    apelido: '',
    email: '',
    password: '',
    telefone: '',
    telefone_whatsapp: true,
    regiao: '',
    telegram: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof FormData, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) console.error('Erro Google login:', error)
  }

  const valid = isFormValid(form)

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (submitted) {
      setErrors(validate({ ...form, [key]: value }))
    }
  }

  function touch(key: keyof FormData) {
    setTouched(prev => ({ ...prev, [key]: true }))
    setErrors(validate(form))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setLoading(true)
    setServerError(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          nome: form.nome,
          apelido: form.apelido,
          regiao: form.regiao,
          telefone: form.telefone,
          telefone_whatsapp: form.telefone_whatsapp,
          telegram_username: form.telegram || null,
        },
      },
    })

    if (signUpError) {
      const msg = signUpError.message.toLowerCase()
      if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit') || signUpError.status === 429) {
        setServerError('Muitas tentativas de cadastro em pouco tempo. Aguarde alguns minutos e tente novamente.')
      } else {
        setServerError(signUpError.message)
      }
      setLoading(false)
      return
    }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email: form.email,
        nome: form.nome,
        apelido: form.apelido,
        telefone: form.telefone,
        telefone_whatsapp: form.telefone_whatsapp,
        telegram_username: form.telegram || null,
        regiao: form.regiao,
        is_admin: false,
        plano: 'plano_a',
      })
    }

    localStorage.setItem('show-pwa-prompt', 'true')
    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push(postSignupRedirect), 3000)
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0E0F0D',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 20, textAlign: 'center', padding: 48,
      }}>
        <div style={{
          width: 64, height: 64, background: 'rgba(34,197,94,.12)',
          border: '2px solid rgba(34,197,94,.4)', borderRadius: '50%',
          display: 'grid', placeItems: 'center',
        }}>
          <IconCheck size={28} stroke={2.5} color="#22C55E" />
        </div>
        <h2 style={{
          fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 38,
          textTransform: 'uppercase', color: '#F4F3EF', margin: 0,
        }}>
          Conta criada!
        </h2>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: '#9AA093', maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
          Verifique seu e-mail para confirmar o cadastro. Redirecionando para o login...
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" style={{ minHeight: '100vh' }}>

      {/* Left: branding panel */}
      <div
        className="hidden lg:flex"
        style={{
          background: '#0E0F0D', borderRight: '1px solid rgba(109,116,95,.28)',
          flexDirection: 'column', justifyContent: 'space-between',
          padding: '44px 48px', position: 'relative', overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: TOPO_DATA_URI,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
          }}
        />

        <Link href="/" style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
        }}>
          <span style={{
            width: 28, height: 28, background: '#F4F3EF', borderRadius: 7,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <IconBolt size={16} stroke={2.4} color="#0E0F0D" />
          </span>
          <span style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 22, textTransform: 'uppercase', letterSpacing: '.5px', color: '#F4F3EF',
          }}>
            MTB Forecaster
          </span>
        </Link>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 0 32px' }}>
          <h2 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(38px, 4vw, 54px)', textTransform: 'uppercase',
            lineHeight: 0.95, color: '#F4F3EF', margin: '0 0 20px',
          }}>
            Junte-se<br />aos{' '}
            <span style={{ color: 'transparent', WebkitTextStroke: '2px #F4F3EF' }}>riders.</span>
          </h2>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: '#9AA093', maxWidth: 340, marginBottom: 36 }}>
            Nunca mais vá pedalar numa trilha encharcada por falta de informação. Grátis pra começar.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 34, height: 34, background: 'rgba(244,243,239,.07)',
                    border: '1px solid rgba(109,116,95,.28)', borderRadius: 9,
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <Icon size={16} stroke={2} color="#9AA093" />
                  </div>
                  <FeatureLine text={f.text} />
                </div>
              )
            })}
          </div>
        </div>

        <p style={{ position: 'relative', zIndex: 1, fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.45)', margin: 0 }}>
          MTB Forecaster © 2026
        </p>
      </div>

      {/* Right: form panel */}
      <div style={{
        background: '#171914', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '48px 56px', overflowY: 'auto',
      }}>

        {/* Mobile logo */}
        <Link href="/" className="lg:hidden" style={{
          display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 36,
        }}>
          <span style={{
            width: 24, height: 24, background: '#F4F3EF', borderRadius: 6,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <IconBolt size={14} stroke={2.4} color="#0E0F0D" />
          </span>
          <span style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 20, textTransform: 'uppercase', letterSpacing: '.5px', color: '#F4F3EF',
          }}>
            MTB Forecaster
          </span>
        </Link>

        <div style={{ maxWidth: 420, width: '100%' }}>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 36,
            textTransform: 'uppercase', letterSpacing: '.5px', color: '#F4F3EF', margin: '0 0 8px',
          }}>
            Criar conta
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', marginBottom: 28 }}>
            Campos com <span style={{ color: '#EF4444' }}>*</span> são obrigatórios
          </p>

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'rgba(244,243,239,.06)', border: '1px solid rgba(109,116,95,.28)',
              borderRadius: 10, padding: '12px 20px', fontSize: 15, color: '#F4F3EF',
              fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(244,243,239,.35)'
              e.currentTarget.style.background = 'rgba(244,243,239,.10)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)'
              e.currentTarget.style.background = 'rgba(244,243,239,.06)'
            }}
          >
            <GoogleIcon />
            Continuar com Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, borderTop: '1px solid rgba(109,116,95,.28)' }} />
            <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093', letterSpacing: '.5px' }}>
              ou cadastre-se com e-mail
            </span>
            <div style={{ flex: 1, borderTop: '1px solid rgba(109,116,95,.28)' }} />
          </div>

          {serverError && (
            <div style={{
              background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.35)',
              color: '#FCA5A5', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13,
              fontFamily: 'var(--font-dm-sans)',
            }}>
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>

            {/* Nome + Apelido */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={fieldLabelStyle()}>
                  Nome completo<RequiredStar />
                </label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => set('nome', e.target.value)}
                  onBlur={() => touch('nome')}
                  placeholder="Seu nome completo"
                  style={{
                    ...inputBaseStyle,
                    borderColor: (submitted || touched.nome) && errors.nome ? '#EF4444' : 'rgba(109,116,95,.28)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                  onBlurCapture={e => {
                    if (!((submitted || touched.nome) && errors.nome)) {
                      e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)'
                    }
                  }}
                />
                <FieldError msg={(submitted || touched.nome) ? errors.nome : undefined} />
              </div>

              <div>
                <label style={fieldLabelStyle()}>
                  Apelido<RequiredStar />
                </label>
                <input
                  type="text"
                  value={form.apelido}
                  onChange={e => set('apelido', e.target.value)}
                  onBlur={() => touch('apelido')}
                  placeholder="Como te chamam"
                  style={{
                    ...inputBaseStyle,
                    borderColor: (submitted || touched.apelido) && errors.apelido ? '#EF4444' : 'rgba(109,116,95,.28)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                  onBlurCapture={e => {
                    if (!((submitted || touched.apelido) && errors.apelido)) {
                      e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)'
                    }
                  }}
                />
                <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: 'rgba(154,160,147,.55)', marginTop: 5 }}>
                  Exibido no app
                </p>
                <FieldError msg={(submitted || touched.apelido) ? errors.apelido : undefined} />
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={fieldLabelStyle()}>
                E-mail<RequiredStar />
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                onBlur={() => touch('email')}
                placeholder="seu@email.com"
                style={{
                  ...inputBaseStyle,
                  borderColor: (submitted || touched.email) && errors.email ? '#EF4444' : 'rgba(109,116,95,.28)',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                onBlurCapture={e => {
                  if (!((submitted || touched.email) && errors.email)) {
                    e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)'
                  }
                }}
              />
              <FieldError msg={(submitted || touched.email) ? errors.email : undefined} />
            </div>

            {/* Senha */}
            <div>
              <label style={fieldLabelStyle()}>
                Senha<RequiredStar />
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                onBlur={() => touch('password')}
                placeholder="Mínimo 6 caracteres"
                style={{
                  ...inputBaseStyle,
                  borderColor: (submitted || touched.password) && errors.password ? '#EF4444' : 'rgba(109,116,95,.28)',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                onBlurCapture={e => {
                  if (!((submitted || touched.password) && errors.password)) {
                    e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)'
                  }
                }}
              />
              <FieldError msg={(submitted || touched.password) ? errors.password : undefined} />
            </div>

            {/* Telefone */}
            <div>
              <label style={fieldLabelStyle()}>
                Telefone / WhatsApp<RequiredStar />
              </label>
              <input
                type="tel"
                value={form.telefone}
                onChange={e => set('telefone', formatPhone(e.target.value))}
                onBlur={() => touch('telefone')}
                placeholder="+55 (11) 99999-9999"
                style={{
                  ...inputBaseStyle,
                  borderColor: (submitted || touched.telefone) && errors.telefone ? '#EF4444' : 'rgba(109,116,95,.28)',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                onBlurCapture={e => {
                  if (!((submitted || touched.telefone) && errors.telefone)) {
                    e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)'
                  }
                }}
              />
              <FieldError msg={(submitted || touched.telefone) ? errors.telefone : undefined} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.telefone_whatsapp}
                  onChange={e => set('telefone_whatsapp', e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#6d745f' }}
                />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#9AA093' }}>
                  Este número tem WhatsApp
                </span>
              </label>
            </div>

            {/* Região */}
            <div>
              <label style={fieldLabelStyle()}>
                Região<RequiredStar />
              </label>
              <select
                value={form.regiao}
                onChange={e => set('regiao', e.target.value)}
                onBlur={() => touch('regiao')}
                style={{
                  ...inputBaseStyle,
                  appearance: 'none',
                  backgroundImage: CHEVRON_DATA_URI,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: 36,
                  borderColor: (submitted || touched.regiao) && errors.regiao ? '#EF4444' : 'rgba(109,116,95,.28)',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                onBlurCapture={e => {
                  if (!((submitted || touched.regiao) && errors.regiao)) {
                    e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)'
                  }
                }}
              >
                <option value="" disabled style={{ background: '#171914', color: '#F4F3EF' }}>Selecione sua região</option>
                {ESTADOS_BRASIL.map(e => (
                  <option key={e.value} value={e.value} style={{ background: '#171914', color: '#F4F3EF' }}>
                    {e.label}
                  </option>
                ))}
              </select>
              <FieldError msg={(submitted || touched.regiao) ? errors.regiao : undefined} />
            </div>

            {/* Telegram */}
            <div>
              <label style={fieldLabelStyle()}>
                Telegram <span style={{ color: 'rgba(154,160,147,.5)', textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
              </label>
              <input
                type="text"
                value={form.telegram}
                onChange={e => {
                  const v = e.target.value
                  set('telegram', v && !v.startsWith('@') ? '@' + v : v)
                }}
                placeholder="@seu_usuario"
                style={inputBaseStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(109,116,95,.28)' }}
              />
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: 'rgba(154,160,147,.55)', marginTop: 5 }}>
                Para receber alertas de trilhas
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || (submitted && !valid)}
              style={{
                background: '#F4F3EF', color: '#0E0F0D',
                border: 'none', borderRadius: 999,
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: 18,
                padding: '14px 20px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: (!valid && submitted) || loading ? 0.4 : 1,
                width: '100%', marginTop: 8,
                transition: 'transform .15s ease, opacity .15s ease',
              }}
              onMouseEnter={e => {
                if (!(loading || (submitted && !valid))) {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.opacity = '0.92'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.opacity = (!valid && submitted) || loading ? '0.4' : '1'
              }}
            >
              {loading ? 'Criando conta...' : 'Criar conta grátis'}
            </button>
          </form>

          <div style={{ marginTop: 22, textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093' }}>Já tem conta? </span>
            <Link href="/login" style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#F4F3EF', fontWeight: 500,
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
              Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CadastroPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#0E0F0D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontFamily: 'var(--font-dm-sans)', color: '#9AA093', fontSize: 14 }}>Carregando...</div>
      </div>
    }>
      <CadastroContent />
    </Suspense>
  )
}
