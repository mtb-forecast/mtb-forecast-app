'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'

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
  if (data.nome.trim().length < 3) errors.nome = 'Mínimo 3 caracteres'
  if (data.apelido.trim().length < 2) errors.apelido = 'Mínimo 2 caracteres'
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'E-mail inválido'
  if (data.password.length < 6) errors.password = 'Mínimo 6 caracteres'
  if (data.telefone.replace(/\D/g, '').length < 10) errors.telefone = 'Mínimo 10 dígitos'
  if (!data.regiao) errors.regiao = 'Selecione sua região'
  return errors
}

function isFormValid(data: FormData): boolean {
  return Object.keys(validate(data)).length === 0
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{msg}</p>
}

function RequiredStar() {
  return <span style={{ color: '#ef4444' }}> *</span>
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

export default function CadastroPage() {
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
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://mtb-forecast-app.vercel.app/auth/callback',
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
          telegram_username: form.telegram || null,
        },
      },
    })

    if (signUpError) {
      setServerError(signUpError.message)
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
      })
    }

    localStorage.setItem('show-pwa-prompt', 'true')
    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push(postSignupRedirect), 3000)
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 className="font-wheat" style={{ color: '#fff', fontSize: 28, marginBottom: 12 }}>Conta criada!</h2>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>
            Verifique seu e-mail para confirmar o cadastro. Redirecionando para o login...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" style={{ minHeight: '100vh' }}>

      {/* Left: black branding panel */}
      <div
        className="hidden lg:flex"
        style={{ background: '#111', padding: 48, flexDirection: 'column', justifyContent: 'space-between' }}
      >
        <Link href="/" className="font-wheat" style={{ color: '#fff', fontSize: 18, letterSpacing: '1.5px' }}>
          MTB FORECAST
        </Link>
        <div>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 36, lineHeight: 1.1, marginBottom: 16 }}>
            Junte-se<br />aos riders.
          </h1>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, maxWidth: 320 }}>
            Crie sua conta grátis e nunca mais vá pedalar numa trilha encharcada por falta de informação.
          </p>
        </div>
        <p style={{ color: '#444', fontSize: 12 }}>MTB Forecast © 2025</p>
      </div>

      {/* Right: form panel */}
      <div style={{ background: '#fff', padding: '48px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflowY: 'auto' }}>

        {/* Mobile logo */}
        <Link href="/" className="font-wheat lg:hidden" style={{ color: '#111', fontSize: 18, letterSpacing: '1.5px', display: 'block', marginBottom: 32 }}>
          MTB FORECAST
        </Link>

        <div style={{ maxWidth: 420, width: '100%' }}>
          <h2 className="font-wheat" style={{ fontSize: 28, color: '#111', marginBottom: 8 }}>Criar conta</h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 28 }}>
            Campos com <span style={{ color: '#ef4444' }}>*</span> são obrigatórios
          </p>

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%', background: '#fff', color: '#111',
              border: '1.5px solid #e5e5e5', borderRadius: 4,
              padding: '12px 20px', fontSize: 14, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: 'pointer', marginBottom: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#111')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e5e5')}
          >
            <GoogleIcon />
            Continuar com Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
            <span style={{ fontSize: 12, color: '#888' }}>ou cadastre-se com email</span>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
          </div>

          {serverError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>

            {/* Nome */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Nome completo<RequiredStar />
              </label>
              <input
                type="text"
                value={form.nome}
                onChange={e => set('nome', e.target.value)}
                placeholder="Seu nome completo"
                className="input-field"
                style={{ borderColor: submitted && errors.nome ? '#ef4444' : undefined }}
              />
              {submitted && <FieldError msg={errors.nome} />}
            </div>

            {/* Apelido */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Apelido<RequiredStar />
              </label>
              <input
                type="text"
                value={form.apelido}
                onChange={e => set('apelido', e.target.value)}
                placeholder="Como você é conhecido na trilha"
                className="input-field"
                style={{ borderColor: submitted && errors.apelido ? '#ef4444' : undefined }}
              />
              <p style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>Este nome será exibido no app</p>
              {submitted && <FieldError msg={errors.apelido} />}
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                E-mail<RequiredStar />
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="seu@email.com"
                className="input-field"
                style={{ borderColor: submitted && errors.email ? '#ef4444' : undefined }}
              />
              {submitted && <FieldError msg={errors.email} />}
            </div>

            {/* Senha */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Senha<RequiredStar />
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="input-field"
                style={{ borderColor: submitted && errors.password ? '#ef4444' : undefined }}
              />
              {submitted && <FieldError msg={errors.password} />}
            </div>

            {/* Telefone */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Telefone / WhatsApp<RequiredStar />
              </label>
              <input
                type="tel"
                value={form.telefone}
                onChange={e => set('telefone', formatPhone(e.target.value))}
                placeholder="+55 (11) 99999-9999"
                className="input-field"
                style={{ borderColor: submitted && errors.telefone ? '#ef4444' : undefined }}
              />
              {submitted && <FieldError msg={errors.telefone} />}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.telefone_whatsapp}
                  onChange={e => set('telefone_whatsapp', e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#111' }}
                />
                <span style={{ fontSize: 13, color: '#555' }}>Este número tem WhatsApp</span>
              </label>
            </div>

            {/* Região */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Região<RequiredStar />
              </label>
              <select
                value={form.regiao}
                onChange={e => set('regiao', e.target.value)}
                className="input-field"
                style={{ borderColor: submitted && errors.regiao ? '#ef4444' : undefined }}
              >
                <option value="" disabled>Selecione sua região</option>
                {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
              {submitted && <FieldError msg={errors.regiao} />}
            </div>

            {/* Telegram */}
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Telegram <span style={{ color: '#bbb' }}>(opcional)</span>
              </label>
              <input
                type="text"
                value={form.telegram}
                onChange={e => {
                  const v = e.target.value
                  set('telegram', v && !v.startsWith('@') ? '@' + v : v)
                }}
                placeholder="@seu_usuario"
                className="input-field"
              />
              <p style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>Para receber notificações de trilhas</p>
            </div>

            <button
              type="submit"
              disabled={loading || (submitted && !valid)}
              style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '11px 20px', fontSize: 14, fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: (!valid && submitted) || loading ? 0.5 : 1,
                width: '100%', marginTop: 8,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Criando conta...' : 'Criar conta grátis'}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <span style={{ fontSize: 14, color: '#888' }}>Já tem conta? </span>
            <Link href="/login" style={{ fontSize: 14, color: '#111', fontWeight: 500, borderBottom: '1px solid #111' }}>
              Entrar
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
