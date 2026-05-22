import Link from 'next/link'

const CARDS_MOCKADOS = [
  {
    name: 'Downhill Saracura — Mairiporã SP',
    veredicto: 'DROP LIBERADO',
    aderencia: 'GRIP PERFEITO',
    info: '0.0mm · Solo seco · Janela: hoje 06h–22h',
    cor: '#22c55e',
    badgeBg: '#dcfce7',
    badgeColor: '#166534',
  },
  {
    name: 'ZigZag — Campos do Jordão SP',
    veredicto: 'DROP LIBERADO - Veja os alertas',
    aderencia: 'SECO',
    info: '2.1mm · Rajada 42km/h prevista',
    cor: '#d97706',
    badgeBg: '#FFE000',
    badgeColor: '#111',
  },
  {
    name: 'DH Mumia — Rio Acima MG',
    veredicto: 'MELHOR ESPERAR',
    aderencia: 'BAIXA ADERÊNCIA',
    info: '18mm acumulados · Solo encharcado',
    cor: '#ef4444',
    badgeBg: '#fee2e2',
    badgeColor: '#991b1b',
  },
]

const howItWorks = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5">
        <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364-.707.707M6.343 17.657l-.707.707m12.728 0-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" strokeLinecap="round" />
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" opacity="0.2" />
        <path d="M8 12s0-4 4-4" strokeLinecap="round" />
        <path d="M16 16s-1 2-4 2-4-2-4-2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Chuva acumulada',
    desc: 'Análise das últimas 48h e pico das 3h mais recentes para calcular a saturação real do solo.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5">
        <path d="M3 17l4-8 4 4 4-6 4 10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 17H3" strokeLinecap="round" />
      </svg>
    ),
    title: 'Tipo de solo',
    desc: 'Considera terra batida, granito, barro e outros tipos com seus coeficientes de secagem específicos.',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Janela de pedal',
    desc: 'Calcula a meia-vida de secagem e indica a melhor janela para pedalar com segurança.',
  },
]

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#111' }}>

      {/* ── Split-screen hero ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ minHeight: '100vh' }}>

        {/* Left: black panel */}
        <div style={{ background: '#111', padding: '48px', display: 'flex', flexDirection: 'column' }}>

          {/* Inline header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 80 }}>
            <span className="font-wheat" style={{ color: '#fff', fontSize: 18, letterSpacing: '1.5px' }}>
              MTB FORECASTER
            </span>
            <div style={{ display: 'flex', gap: 24 }}>
              <Link href="/login" style={{ color: '#888', fontSize: 13 }}>Entrar</Link>
              <Link href="/cadastro" style={{ color: '#888', fontSize: 13 }}>Cadastrar</Link>
            </div>
          </div>

          {/* Hero text */}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, letterSpacing: '2px', color: '#FFE000', textTransform: 'uppercase', marginBottom: 16 }}>
              DH | ENDURO | XCC | XCM · BRASIL
            </p>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 'clamp(40px, 6vw, 56px)', lineHeight: 1.05, marginBottom: 20 }}>
              Saiba antes<br />de pedalar.
            </h1>
            <p style={{ color: '#888', fontSize: 15, lineHeight: 1.7, maxWidth: 360, marginBottom: 44 }}>
              Condições de solo, chuva acumulada e janela de pedal em tempo real para trilhas de mountain bike no Brasil.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
              <Link
                href="/cadastro"
                style={{
                  background: '#FFE000', color: '#111',
                  border: '1.5px solid #111', borderRadius: 4,
                  padding: '14px 24px', fontSize: 14, fontWeight: 500,
                  textAlign: 'center', display: 'block',
                }}
              >
                Criar conta grátis
              </Link>
              <Link
                href="/login"
                style={{
                  background: 'transparent', color: '#fff',
                  border: '1px solid #444', borderRadius: 4,
                  padding: '14px 24px', fontSize: 14,
                  textAlign: 'center', display: 'block',
                }}
              >
                Já tenho conta
              </Link>
            </div>
          </div>

          {/* Footer info */}
          <p style={{ color: '#444', fontSize: 12, marginTop: 60 }}>
            +5000 Trilhas monitoradas · BRASIL · Atualizado Diariamente
          </p>
        </div>

        {/* Right: image panel */}
        <div
          className="hidden lg:flex"
          style={{
            position: 'relative',
            backgroundImage: 'url(https://images.unsplash.com/photo-1544191696-102dbeb9e5ce?w=1200&q=80)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 40,
          }}
        >
          {/* Dark overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.58)' }} />

          {/* Cards */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: 11, letterSpacing: '2px', color: '#FFE000', textTransform: 'uppercase', marginBottom: 16 }}>
              CONDIÇÕES AGORA
            </p>
            {CARDS_MOCKADOS.map(card => (
              <div
                key={card.name}
                style={{
                  background: 'rgba(255,255,255,0.97)',
                  borderRadius: 4,
                  padding: '12px 16px',
                  borderLeft: `3px solid ${card.cor}`,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#111', lineHeight: 1.3 }}>{card.name}</p>
                  <span style={{
                    background: card.badgeBg, color: card.badgeColor,
                    borderRadius: 2, fontSize: 11, fontWeight: 500,
                    padding: '2px 6px', flexShrink: 0,
                  }}>
                    {card.veredicto}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{card.aderencia} · {card.info}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Yellow ticker ───────────────────────────────────────────────── */}
      <div style={{ background: '#FFE000', padding: '12px 48px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        {['27 trilhas monitoradas', 'Chuva acumulada 48h', 'Meia-vida de secagem', 'Atualizado às 07:00 BRT'].map(t => (
          <span key={t} style={{ fontSize: 12, fontWeight: 500, color: '#111' }}>{t}</span>
        ))}
      </div>

      {/* ── Strava integration ──────────────────────────────────────────── */}
      <div style={{ background: '#FC4C02', height: 3 }} />
      <div style={{ background: '#111', padding: '80px 48px' }}>
        <div
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{ gap: '80px', alignItems: 'center', maxWidth: 1100, margin: '0 auto' }}
        >
          <div>
            <p style={{ fontSize: 11, letterSpacing: '2px', color: '#FC4C02', textTransform: 'uppercase', marginBottom: 16 }}>
              INTEGRAÇÃO OFICIAL
            </p>
            <h2 className="font-wheat" style={{ color: '#fff', fontSize: 36, lineHeight: 1.1 }}>
              Monitore suas trilhas do Strava.
            </h2>
            <p style={{ color: '#888', fontSize: 15, lineHeight: 1.6, marginTop: 16, maxWidth: 480 }}>
              Conecte sua conta Strava e importe seus segmentos favoritos. O MTB Forecaster monitora as condições de cada trilha diariamente e te avisa quando é hora de pedalar.
            </p>
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Importe segmentos favoritos com um clique',
                'Condições calculadas diariamente para cada trilha',
                'Até 3 trilhas pessoais monitoradas',
                'Dados compartilhados entre riders do mesmo segmento',
              ].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#22c55e', fontSize: 16 }}>✅</span>
                  <span style={{ fontSize: 14, color: '#fff' }}>{item}</span>
                </div>
              ))}
            </div>
            <Link
              href="/cadastro"
              style={{
                display: 'inline-block', marginTop: 32,
                background: '#FC4C02', color: '#fff',
                border: 'none', borderRadius: 4,
                padding: '14px 28px', fontSize: 14, fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Criar conta grátis
            </Link>
          </div>

          <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 24, border: '1px solid #333' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <svg viewBox="0 0 24 24" fill="#FC4C02" width={20} height={20}>
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              <span style={{ color: '#FC4C02', fontSize: 15, fontWeight: 600 }}>Strava</span>
            </div>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>Seus segmentos favoritos</p>
            {[
              { name: 'DH Saracura - Mairiporã SP', veredicto: 'DROP LIBERADO', info: '0.0mm · Solo seco · Janela: hoje 06h–22h', borderCor: '#22c55e', badgeBg: '#dcfce7', badgeColor: '#166534' },
              { name: 'ZigZag - Campos do Jordão', veredicto: 'DROP LIBERADO - Veja os alertas', info: '2.1mm · Rajada 42km/h prevista', borderCor: '#FFE000', badgeBg: '#FFE000', badgeColor: '#111' },
              { name: 'DH Trilha da Vaca - Mairiporã', veredicto: 'MELHOR ESPERAR', info: '18mm acumulados · Solo encharcado', borderCor: '#ef4444', badgeBg: '#fee2e2', badgeColor: '#991b1b' },
            ].map(card => (
              <div key={card.name} style={{ background: '#111', borderRadius: 6, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${card.borderCor}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', lineHeight: 1.3 }}>{card.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, flexShrink: 0, background: card.badgeBg, color: card.badgeColor, borderRadius: 2, padding: '2px 6px' }}>{card.veredicto}</span>
                </div>
                <p style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{card.info}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Como funciona ───────────────────────────────────────────────── */}
      <div style={{ background: '#fff', padding: '80px 48px', textAlign: 'center' }}>
        <h2 className="font-wheat" style={{ fontSize: 36, color: '#111', marginBottom: 48 }}>Como funciona</h2>
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 40, maxWidth: 900, margin: '0 auto', textAlign: 'left' }}>
          {howItWorks.map(f => (
            <div key={f.title}>
              <div style={{ marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 500, color: '#111', marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#888', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA final ───────────────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '80px 48px', textAlign: 'center' }}>
        <h2 className="font-wheat" style={{ fontSize: 36, color: '#fff', marginBottom: 16 }}>
          Pronto para pedalar com segurança?
        </h2>
        <p style={{ color: '#888', fontSize: 15, marginBottom: 32 }}>
          Crie sua conta grátis e acompanhe as condições da sua região.
        </p>
        <Link
          href="/cadastro"
          style={{
            background: '#FFE000', color: '#111',
            border: '1.5px solid #FFE000', borderRadius: 4,
            padding: '16px 40px', fontSize: 15, fontWeight: 500,
            display: 'inline-block',
          }}
        >
          Criar conta grátis
        </Link>
      </div>
    </div>
  )
}
