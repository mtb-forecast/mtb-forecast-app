'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { REGIOES } from '@/lib/types'

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

export default function CadastroPage() {
  const router = useRouter()
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

    setSuccess(true)
    setLoading(false)
    setTimeout(() => router.push('/login'), 3000)
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
                {REGIOES.map(r => <option key={r} value={r}>{r === 'outros' ? 'Outros' : r}</option>)}
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
