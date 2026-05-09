'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('E-mail ou senha inválidos. Tente novamente.')
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
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
            Bem-vindo<br />de volta.
          </h1>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, maxWidth: 320 }}>
            Verifique as condições das suas trilhas favoritas antes de sair de casa.
          </p>
        </div>
        <p style={{ color: '#444', fontSize: 12 }}>MTB Forecast © 2025</p>
      </div>

      {/* Right: form panel */}
      <div style={{ background: '#fff', padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        {/* Mobile logo */}
        <Link href="/" className="font-wheat lg:hidden" style={{ color: '#111', fontSize: 18, letterSpacing: '1.5px', display: 'block', marginBottom: 40 }}>
          MTB FORECAST
        </Link>

        <div style={{ maxWidth: 400, width: '100%' }}>
          <h2 className="font-wheat" style={{ fontSize: 28, color: '#111', marginBottom: 32 }}>Entrar</h2>

          {error && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fca5a5',
              color: '#991b1b', borderRadius: 4,
              padding: '10px 14px', marginBottom: 20, fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="input-field"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input-field"
              />
              <div style={{ textAlign: 'right', marginTop: 8 }}>
                <span style={{ fontSize: 13, color: '#888', cursor: 'pointer' }}>Esqueci minha senha</span>
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
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
            <span style={{ fontSize: 13, color: '#888' }}>ou</span>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
          </div>

          <div style={{ textAlign: 'center' }}>
            <Link href="/cadastro" style={{ fontSize: 14, color: '#111', fontWeight: 500, borderBottom: '1px solid #111' }}>
              Criar conta grátis
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
