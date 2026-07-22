'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
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

function LoginFormInner() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
        window.location.href = '/dashboard'
      }
    })
    return () => subscription.unsubscribe()
  }, [])

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

    safetyTimerRef.current = setTimeout(() => {
      setLoading(false)
      setError('A conexão demorou muito. Verifique sua internet e tente novamente.')
    }, 30000)

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
        setError('E-mail ou senha inválidos. Tente novamente.')
        setLoading(false)
      }
    } catch {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
      setError('Erro inesperado. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div style={{
          background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.35)',
          color: '#FCA5A5', borderRadius: 10,
          padding: '10px 14px', marginBottom: 20, fontSize: 14,
          fontFamily: 'var(--font-dm-sans)',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={fieldLabelStyle()}>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="seu@email.com"
            style={inputBaseStyle}
            onFocus={ev => { ev.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
            onBlur={ev => { ev.currentTarget.style.borderColor = 'rgba(109,116,95,.28)' }}
          />
        </div>
        <div>
          <label style={fieldLabelStyle()}>Senha</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            style={inputBaseStyle}
            onFocus={ev => { ev.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
            onBlur={ev => { ev.currentTarget.style.borderColor = 'rgba(109,116,95,.28)' }}
          />
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <span
              onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false); setForgotError(null) }}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#9AA093', cursor: 'pointer',
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#F4F3EF' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#9AA093' }}
            >
              Esqueci minha senha
            </span>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            background: '#F4F3EF', color: '#0E0F0D',
            border: 'none', borderRadius: 999,
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: 18,
            padding: '14px 20px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.4 : 1,
            width: '100%', marginTop: 8,
            transition: 'transform .15s ease, opacity .15s ease',
          }}
          onMouseEnter={e => {
            if (!loading) {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.opacity = '0.92'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.opacity = loading ? '0.4' : '1'
          }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
        <div style={{ flex: 1, borderTop: '1px solid rgba(109,116,95,.28)' }} />
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093', letterSpacing: '.5px' }}>ou</span>
        <div style={{ flex: 1, borderTop: '1px solid rgba(109,116,95,.28)' }} />
      </div>

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

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <a href="/cadastro" style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#F4F3EF', fontWeight: 500,
          textDecoration: 'underline', textUnderlineOffset: 3,
        }}>
          Criar conta grátis
        </a>
      </div>

      {showForgot && (
        <div
          onClick={() => setShowForgot(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#171914', borderRadius: 16, border: '1px solid rgba(109,116,95,.28)',
              padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,.5)',
            }}
          >
            <h3 style={{
              fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 26,
              textTransform: 'uppercase', letterSpacing: '.5px', color: '#F4F3EF', marginBottom: 8,
            }}>
              Recuperar senha
            </h3>
            {forgotSent ? (
              <>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#22C55E', lineHeight: 1.6, marginBottom: 24 }}>
                  E-mail enviado! Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                </p>
                <button
                  onClick={() => setShowForgot(false)}
                  style={{
                    width: '100%', background: '#F4F3EF', color: '#0E0F0D', border: 'none', borderRadius: 999,
                    fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '1.5px', fontSize: 18, padding: '14px 20px', cursor: 'pointer',
                    transition: 'transform .15s ease, opacity .15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.opacity = '0.92' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1' }}
                >
                  Fechar
                </button>
              </>
            ) : (
              <>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#9AA093', marginBottom: 20, lineHeight: 1.6 }}>
                  Digite seu e-mail e enviaremos um link para redefinir sua senha.
                </p>
                {forgotError && (
                  <div style={{
                    background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.35)',
                    color: '#FCA5A5', borderRadius: 10, padding: '8px 12px', fontSize: 13, marginBottom: 16,
                    fontFamily: 'var(--font-dm-sans)',
                  }}>
                    {forgotError}
                  </div>
                )}
                <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={fieldLabelStyle()}>E-mail</label>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      required
                      placeholder="seu@email.com"
                      style={inputBaseStyle}
                      onFocus={ev => { ev.currentTarget.style.borderColor = 'rgba(244,243,239,.45)' }}
                      onBlur={ev => { ev.currentTarget.style.borderColor = 'rgba(109,116,95,.28)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      style={{
                        flex: 1, background: 'rgba(244,243,239,.06)', color: '#F4F3EF',
                        border: '1px solid rgba(109,116,95,.28)', borderRadius: 999,
                        padding: 11, fontSize: 15, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      style={{
                        flex: 2, background: '#F4F3EF', color: '#0E0F0D', border: 'none', borderRadius: 999,
                        fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, textTransform: 'uppercase',
                        letterSpacing: '1.5px', fontSize: 15, padding: '11px 20px',
                        cursor: forgotLoading ? 'not-allowed' : 'pointer',
                        opacity: forgotLoading ? 0.4 : 1,
                      }}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}

export default function LoginFormClient() {
  return (
    <Suspense>
      <LoginFormInner />
    </Suspense>
  )
}
