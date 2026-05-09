import Link from 'next/link'

const veredictos = [
  {
    label: 'DROP LIBERADO',
    desc: 'Solo seco — condições ideais para pedalar.',
    cor: '#16a34a',
  },
  {
    label: 'ATENÇÃO',
    desc: 'Solo úmido — pedal possível mas com cuidado.',
    cor: '#d97706',
  },
  {
    label: 'MELHOR ESPERAR',
    desc: 'Solo encharcado — risco de dano à trilha.',
    cor: '#ef4444',
  },
]

const features = [
  { icon: '🌧️', title: 'Chuva acumulada', desc: 'Análise das últimas 48h e pico das 3h mais recentes.' },
  { icon: '🪨', title: 'Tipo de solo', desc: 'Considera terra batida, granito, barro e outros tipos.' },
  { icon: '⏱️', title: 'Meia-vida de secagem', desc: 'Calcula quanto tempo falta para o solo secar.' },
  { icon: '🏔️', title: 'Múltiplas trilhas', desc: 'Acompanhe suas trilhas favoritas de SP, MG, RJ e mais.' },
  { icon: '📱', title: 'Mobile-first', desc: 'Consulte as condições de qualquer lugar, no celular.' },
  { icon: '🔔', title: 'Alertas Telegram', desc: 'Receba notificações direto no seu Telegram.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: '#F5F5F5' }}>

      {/* ── HERO split-screen ─────────────────────────────────────────── */}
      <section style={{ background: '#111111' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

          {/* Left: brand + CTA */}
          <div>
            <div
              className="inline-block text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded mb-6"
              style={{ background: '#FFE000', color: '#111111' }}
            >
              Atualizado diariamente
            </div>
            <h1 className="font-wheat text-5xl sm:text-6xl text-white leading-tight mb-4">
              MTB Forecast
            </h1>
            <p className="text-xl font-semibold mb-3" style={{ color: '#FFE000' }}>
              Saiba antes de pedalar.
            </p>
            <p className="text-lg mb-10" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Condições de trilhas de mountain bike em tempo real. Análise de solo,
              chuva acumulada e janela de pedal — tudo num só lugar.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/login"
                className="font-bold px-8 py-4 rounded-xl text-center text-lg transition-all"
                style={{ background: '#FFE000', color: '#111111' }}
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="font-semibold px-8 py-4 rounded-xl text-center text-lg transition-all text-white"
                style={{ border: '1px solid rgba(255,255,255,0.25)' }}
              >
                Criar conta grátis
              </Link>
            </div>
          </div>

          {/* Right: veredicto preview */}
          <div className="hidden lg:flex flex-col gap-3">
            {veredictos.map((v) => (
              <div
                key={v.label}
                className="rounded-xl p-4 flex items-start gap-4"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                  style={{ background: v.cor }}
                />
                <div>
                  <p className="font-bold text-sm text-white">{v.label}</p>
                  <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Yellow ticker ──────────────────────────────────────────────── */}
      <div style={{ background: '#FFE000', borderBottom: '1px solid #E0E0E0' }} className="py-3 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center gap-6 text-xs font-semibold text-[#111111] uppercase tracking-widest">
          <span>🚵 Mountain Bike</span>
          <span>·</span>
          <span>📡 Previsão em tempo real</span>
          <span>·</span>
          <span>🌧 Acúmulo 48h</span>
          <span>·</span>
          <span>⏳ Meia-vida de secagem</span>
          <span>·</span>
          <span>🏔 SP · MG · RJ · RS</span>
        </div>
      </div>

      {/* ── Veredictos — mobile ─────────────────────────────────────────── */}
      <section className="lg:hidden py-10 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {veredictos.map((v) => (
            <div
              key={v.label}
              className="rounded-xl p-4"
              style={{ background: '#ffffff', border: `2px solid ${v.cor}` }}
            >
              <p className="font-bold text-sm mb-1" style={{ color: v.cor }}>{v.label}</p>
              <p className="text-[#555555] text-sm">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Como funciona ─────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-[#111111] mb-2">
          Tudo que você precisa saber antes de sair
        </h2>
        <p className="text-[#555555] mb-10">Análise automática atualizada todos os dias às 7h BRT.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-5"
              style={{ background: '#ffffff', border: '1px solid #E0E0E0' }}
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[#111111] mb-1 text-sm">{f.title}</h3>
              <p className="text-[#555555] text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ─────────────────────────────────────────────────── */}
      <section style={{ background: '#111111' }} className="py-16 px-4 sm:px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Pronto para pedalar com segurança?
        </h2>
        <p className="mb-8" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Crie sua conta grátis e acompanhe as trilhas da sua região.
        </p>
        <Link
          href="/cadastro"
          className="inline-block font-bold px-10 py-4 rounded-xl text-lg transition-all"
          style={{ background: '#FFE000', color: '#111111' }}
        >
          Criar conta grátis
        </Link>
      </section>

      <footer style={{ background: '#111111', borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }} className="py-6 text-center text-sm">
        © 2025 MTB Forecast — Feito por e para MTBers 🚵
      </footer>
    </div>
  )
}
