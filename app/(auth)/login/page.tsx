import Link from 'next/link'
import LoginFormClient from './LoginFormClient'

export default function LoginPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" style={{ minHeight: '100vh' }}>

      {/* Left: branding panel — server-rendered, never shipped as JS */}
      <div
        className="hidden lg:flex"
        style={{ background: '#2a2e25', padding: 48, flexDirection: 'column', justifyContent: 'space-between' }}
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

        {/* Mobile logo — server-rendered, this is the LCP element on mobile */}
        <Link href="/" className="font-wheat lg:hidden" style={{ color: '#111', fontSize: 18, letterSpacing: '1.5px', display: 'block', marginBottom: 40 }}>
          MTB FORECASTER
        </Link>

        <div style={{ maxWidth: 400, width: '100%' }}>
          {/* Heading server-rendered — LCP paints before JS loads */}
          <h2 className="font-wheat" style={{ fontSize: 28, color: '#111', marginBottom: 32 }}>Entrar</h2>

          <LoginFormClient />
        </div>
      </div>
    </div>
  )
}
