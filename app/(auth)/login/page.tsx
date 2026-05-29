'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    setForgotError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setForgotLoading(false)
    if (error) {
      setForgotError('Não foi possível enviar o e-mail. Tente novamente.')
    } else {
      setForgotSent(true)
    }
  }

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'auth_failed') setError('Autenticação com Google falhou. Tente novamente.')
    if (err === 'no_code') setError('Código de autorização ausente. Tente novamente.')
  }, [searchParams])

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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('E-mail ou senha inválidos. Tente novamente.')
        setLoading(false)
      } else {
        router.replace('/dashboard')
      }
    } catch {
      setError('Erro inesperado. Tente novamente.')
      setLoading(false)
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
          MTB FORECASTER
        </Link>
        <div>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 36, lineHeight: 1.1, marginBottom: 16 }}>
            Bem-vindo<br />de volta.
          </h1>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, maxWidth: 320 }}>
            Verifique as condições das suas trilhas favoritas antes de sair de casa.
          </p>
        </div>
        <p style={{ color: '#444', fontSize: 12 }}>MTB Forecaster © 2025</p>
      </div>

      {/* Right: form panel */}
      <div style={{ background: '#fff', padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        {/* Mobile logo */}
        <Link href="/" className="font-wheat lg:hidden" style={{ color: '#111', fontSize: 18, letterSpacing: '1.5px', display: 'block', marginBottom: 40 }}>
          MTB FORECASTER
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
                <span
                  onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false); setForgotError(null) }}
                  style={{ fontSize: 13, color: '#111', cursor: 'pointer', borderBottom: '1px solid #ccc' }}
                >
                  Esqueci minha senha
                </span>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
            <span style={{ fontSize: 12, color: '#888' }}>ou</span>
            <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%', background: '#fff', color: '#111',
              border: '1.5px solid #e5e5e5', borderRadius: 4,
              padding: '12px 20px', fontSize: 14, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#111')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e5e5')}
          >
            <GoogleIcon />
            Continuar com Google
          </button>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link href="/cadastro" style={{ fontSize: 14, color: '#111', fontWeight: 500, borderBottom: '1px solid #111' }}>
              Criar conta grátis
            </Link>
          </div>
        </div>
      </div>

      {/* Modal: Esqueci minha senha */}
      {showForgot && (
        <div
          onClick={() => setShowForgot(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 8, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Recuperar senha</h3>

            {forgotSent ? (
              <>
                <p style={{ fontSize: 14, color: '#22c55e', lineHeight: 1.6, marginBottom: 24 }}>
                  E-mail enviado! Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                </p>
                <button
                  onClick={() => setShowForgot(false)}
                  style={{ width: '100%', background: '#111', color: '#FFE000', border: 'none', borderRadius: 4, padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >
                  Fechar
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 1.6 }}>
                  Digite seu e-mail e enviaremos um link para redefinir sua senha.
                </p>
                {forgotError && (
                  <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 4, padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>
                    {forgotError}
                  </div>
                )}
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>E-mail</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      placeholder="seu@email.com"
                      className="input-field"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      style={{ flex: 1, background: '#fff', color: '#111', border: '1.5px solid #e5e5e5', borderRadius: 4, padding: '10px', fontSize: 14, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      style={{ flex: 2, background: '#FFE000', color: '#111', border: '1.5px solid #111', borderRadius: 4, padding: '10px', fontSize: 14, fontWeight: 500, cursor: forgotLoading ? 'not-allowed' : 'pointer', opacity: forgotLoading ? 0.7 : 1 }}
                    >
                      {forgotLoading ? 'Enviando...' : 'Enviar link'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
