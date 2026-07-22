import Link from 'next/link'
import { IconBolt, IconMap2, IconBellRinging, IconSun } from '@tabler/icons-react'
import LoginFormClient from './LoginFormClient'

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

const FEATURES = [
  { icon: IconMap2, text: (<><b style={{ color: '#F4F3EF', fontWeight: 500 }}>Trilhas</b> com veredicto de condição em tempo real</>) },
  { icon: IconSun, text: (<><b style={{ color: '#F4F3EF', fontWeight: 500 }}>Pump Tracks</b> com previsão de chuva</>) },
  { icon: IconBellRinging, text: (<><b style={{ color: '#F4F3EF', fontWeight: 500 }}>Alertas Telegram</b> no momento que a trilha liberar</>) },
  { icon: IconBolt, text: (<>Veredicto <b style={{ color: '#F4F3EF', fontWeight: 500 }}>DROP LIBERADO</b> ou <b style={{ color: '#F4F3EF', fontWeight: 500 }}>MELHOR ESPERAR</b></>) },
]

export default function LoginPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" style={{ minHeight: '100vh', background: '#0E0F0D' }}>

      {/* Left: branding panel — server-rendered, never shipped as JS */}
      <div
        className="hidden lg:flex"
        style={{
          background: '#0E0F0D', borderRight: '1px solid rgba(109,116,95,.28)',
          padding: '44px 48px', flexDirection: 'column', justifyContent: 'space-between',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
            backgroundImage: TOPO_DATA_URI,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            opacity: 0.85,
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
            <IconBolt size={16} strokeWidth={2.4} color="#0E0F0D" />
          </span>
          <span style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 22, textTransform: 'uppercase', letterSpacing: '.5px', color: '#F4F3EF',
          }}>
            MTB Forecaster
          </span>
        </Link>

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 0 32px' }}>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(38px, 4vw, 54px)', textTransform: 'uppercase',
            lineHeight: 0.95, color: '#F4F3EF', margin: 0,
          }}>
            Bem-vindo<br />de{' '}
            <span style={{ color: 'transparent', WebkitTextStroke: '2px #F4F3EF' }}>volta.</span>
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: '#9AA093', maxWidth: 340, lineHeight: 1.6, marginTop: 16 }}>
            Verifique as condições das suas trilhas favoritas antes de sair de casa.
          </p>
          <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 34, height: 34, background: 'rgba(244,243,239,.07)',
                    border: '1px solid rgba(109,116,95,.28)', borderRadius: 9,
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <Icon size={16} strokeWidth={2} color="#9AA093" />
                  </div>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093' }}>
                    {f.text}
                  </span>
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
      <div style={{ background: '#171914', padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        {/* Mobile logo — server-rendered, this is the LCP element on mobile */}
        <Link href="/" className="lg:hidden" style={{
          display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', marginBottom: 36,
        }}>
          <span style={{
            width: 24, height: 24, background: '#F4F3EF', borderRadius: 6,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <IconBolt size={13} strokeWidth={2.4} color="#0E0F0D" />
          </span>
          <span style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 20, textTransform: 'uppercase', color: '#F4F3EF',
          }}>
            MTB Forecaster
          </span>
        </Link>

        <div style={{ maxWidth: 400, width: '100%' }}>
          {/* Heading server-rendered — LCP paints before JS loads */}
          <h2 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 36,
            textTransform: 'uppercase', letterSpacing: '.5px', color: '#F4F3EF', marginBottom: 32,
          }}>
            Entrar
          </h2>

          <LoginFormClient />
        </div>
      </div>
    </div>
  )
}
