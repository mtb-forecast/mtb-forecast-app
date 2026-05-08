import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 60% 40%, #16a34a 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, #15803d 0%, transparent 50%)',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-green-600/10 border border-green-600/20 text-green-700 px-4 py-1.5 rounded-full text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Atualizado em tempo real
          </div>

          <h1 className="font-wheat text-5xl sm:text-6xl md:text-7xl text-[#1e293b] leading-tight mb-6">
            MTB Forecast
          </h1>
          <p className="text-xl sm:text-2xl text-green-600 font-semibold mb-4">
            Saiba antes de pedalar.
          </p>
          <p className="text-[#64748b] text-lg max-w-2xl mx-auto mb-10">
            Condições de trilhas de mountain bike em tempo real. Análise de solo, chuva acumulada e
            janela de pedal — tudo num só lugar.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors duration-200 shadow-lg shadow-green-900/20"
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="border-2 border-[#1e293b] text-[#1e293b] hover:bg-[#1e293b] hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-colors duration-200"
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
      </section>

      {/* Veredictos sample */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-16">
          {[
            {
              label: 'DROP LIBERADO',
              desc: 'Solo seco, condições ideais para pedalar.',
              border: '#16a34a',
              bg: '#f0fdf4',
              color: '#16a34a',
            },
            {
              label: 'ATENÇÃO',
              desc: 'Solo úmido, pedal possível mas com cuidado.',
              border: '#d97706',
              bg: '#fffbeb',
              color: '#d97706',
            },
            {
              label: 'MELHOR ESPERAR',
              desc: 'Solo encharcado, risco de dano à trilha.',
              border: '#ef4444',
              bg: '#fef2f2',
              color: '#ef4444',
            },
          ].map((v) => (
            <div
              key={v.label}
              className="rounded-xl border-2 p-5"
              style={{
                borderColor: v.border,
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
              }}
            >
              <p className="font-bold text-lg mb-1" style={{ color: v.color }}>{v.label}</p>
              <p className="text-[#64748b] text-sm">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <h2 className="text-2xl font-bold text-[#1e293b] text-center mb-10">
          Tudo que você precisa saber antes de sair
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {[
            {
              icon: '🌧️',
              title: 'Chuva acumulada',
              desc: 'Análise das últimas 48h e pico das 3h mais recentes.',
            },
            {
              icon: '🪨',
              title: 'Tipo de solo',
              desc: 'Considera terra batida, granito, barro e outros tipos.',
            },
            {
              icon: '⏱️',
              title: 'Meia-vida de secagem',
              desc: 'Calcula quanto tempo falta para o solo secar.',
            },
            {
              icon: '🏔️',
              title: 'Múltiplas trilhas',
              desc: 'Acompanhe suas trilhas favoritas de SP, MG, RJ e mais.',
            },
            {
              icon: '📱',
              title: 'Mobile-first',
              desc: 'Consulte as condições de qualquer lugar, no celular.',
            },
            {
              icon: '🔔',
              title: 'Alertas Telegram',
              desc: 'Receba notificações direto no seu Telegram.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl p-5 transition-shadow hover:shadow-lg"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
              }}
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-[#1e293b] mb-1">{f.title}</h3>
              <p className="text-[#64748b] text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="rounded-2xl p-10" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
          <h2 className="text-3xl font-bold text-[#1e293b] mb-4">
            Pronto para pedalar com segurança?
          </h2>
          <p className="text-[#64748b] mb-8">
            Crie sua conta grátis e tenha acesso às condições das trilhas da sua região.
          </p>
          <Link
            href="/cadastro"
            className="bg-green-600 hover:bg-green-500 text-white font-bold px-10 py-4 rounded-xl text-lg transition-colors inline-block"
          >
            Criar conta grátis
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#d4c9bb] py-8 text-center text-[#64748b] text-sm">
        © 2025 MTB Forecast — Feito por e para MTBers 🚵
      </footer>
    </div>
  )
}
