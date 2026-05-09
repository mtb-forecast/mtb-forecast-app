'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { REGIOES } from '@/lib/types'

export default function CadastroPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome, regiao, telegram_username: telegram || null } },
    })

    if (signUpError) { setError(signUpError.message); setLoading(false); return }

    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id, email, nome, regiao,
        telegram_username: telegram || null, is_admin: false,
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
      <div style={{ background: '#fff', padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        {/* Mobile logo */}
        <Link href="/" className="font-wheat lg:hidden" style={{ color: '#111', fontSize: 18, letterSpacing: '1.5px', display: 'block', marginBottom: 32 }}>
          MTB FORECAST
        </Link>

        <div style={{ maxWidth: 400, width: '100%' }}>
          <h2 className="font-wheat" style={{ fontSize: 28, color: '#111', marginBottom: 32 }}>Criar conta</h2>

          {error && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fca5a5',
              color: '#991b1b', borderRadius: 4,
              padding: '10px 14px', marginBottom: 20, fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleCadastro} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Nome</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} required placeholder="Seu nome" className="input-field" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="seu@email.com" className="input-field" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" className="input-field" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Região</label>
              <select value={regiao} onChange={e => setRegiao(e.target.value)} required className="input-field">
                <option value="" disabled>Selecione seu estado</option>
                {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Telegram <span style={{ color: '#bbb' }}>(opcional)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#888', fontSize: 14 }}>@</span>
                <input
                  type="text"
                  value={telegram}
                  onChange={e => setTelegram(e.target.value)}
                  placeholder="seu_username"
                  className="input-field"
                  style={{ paddingLeft: 28 }}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '10px 20px', fontSize: 14, fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                width: '100%', marginTop: 8,
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
