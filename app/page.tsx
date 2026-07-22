import Link from 'next/link'
import {
  IconBolt,
  IconClock,
  IconBellRinging,
  IconCalendarTime,
  IconMap2,
} from '@tabler/icons-react'

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'>
  <g fill='none' stroke='%236d745f' stroke-opacity='0.13' stroke-width='1.5'>
    <path d='M450,120 C560,110 650,180 660,290 C670,400 620,500 520,560 C420,620 300,600 240,510 C180,420 190,300 270,220 C330,160 390,130 450,120 Z'/>
    <path d='M450,80 C590,65 700,150 715,290 C730,430 665,555 545,625 C425,695 285,670 205,565 C130,465 145,315 240,220 C310,150 380,95 450,80 Z'/>
    <path d='M450,40 C620,20 750,120 770,290 C790,460 705,610 560,690 C420,770 250,735 155,610 C65,490 85,310 200,200 C290,110 370,60 450,40 Z'/>
    <path d='M450,0 C650,-25 800,90 825,290 C850,490 745,665 575,755 C415,845 220,800 110,655 C0,515 25,300 155,175 C265,70 360,25 450,0 Z'/>
    <path d='M450,-40 C680,-70 850,60 880,290 C910,520 785,720 590,820 C410,915 190,865 65,700 C-55,540 -25,290 110,150 C240,10 350,-10 450,-40 Z'/>
  </g>
</svg>
`.replace(/\s+/g, ' ').trim()

const TOPO_DATA_URI = `url("data:image/svg+xml,${TOPO_SVG}")`

const PIPELINE = [
  {
    n: '01',
    tag: 'DADOS',
    title: 'Chuva acumulada',
    desc: (
      <>
        Histórico de precipitação via <code className="lp-mono-chip">ERA5</code> e previsão
        horária <code className="lp-mono-chip">OpenWeather</code> pro ponto exato de cada
        trilha.
      </>
    ),
  },
  {
    n: '02',
    tag: 'SOLO',
    title: 'Tipo de solo',
    desc: 'Cada solo seca num ritmo. Decaimento exponencial por meia-vida, ajustado por bioma, estação e exposição da trilha.',
  },
  {
    n: '03',
    tag: 'VEREDICTO',
    title: 'Janela de pedal',
    desc: 'Aderência, veredicto de 12h e o melhor horário pra pedalar. Você decide em 5 segundos.',
  },
]

const VEREDICTOS = [
  {
    color: '#22C55E',
    chip: 'DROP LIBERADO',
    desc: 'Solo firme, risco baixo. Vai sem medo.',
  },
  {
    color: '#F59E0B',
    chip: 'ATENÇÃO',
    desc: 'Liberado, mas com alertas: chuva prevista, pico de precipitação ou rajada. Veja antes de ir.',
  },
  {
    color: '#EF4444',
    chip: 'MELHOR ESPERAR',
    desc: 'Solo saturado ou chuva forte chegando. Preserve a trilha — e o seu câmbio.',
  },
]

const TICKER_ITEMS = [
  'Saracura',
  'Pump Track Moema',
  'Zoom Bike Park',
  'Mobai Bike Land',
  'Lago do Taboão',
  'Pump Track DRAC',
]

const BAR_HEIGHTS = [28, 40, 32, 50, 38, 60, 78, 52]

export default function LandingPage() {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0E0F0D', overflowX: 'hidden' }}>
      <style>{`
        .lp-root, .lp-root * { box-sizing: border-box; }
        .lp-vazado {
          color: transparent;
          -webkit-text-stroke: 2px #F4F3EF;
        }
        .lp-mono-chip {
          font-family: var(--font-dm-mono);
          font-size: 12px;
          color: #6d745f;
          background: rgba(109,116,95,.12);
          padding: 1px 6px;
          border-radius: 4px;
          font-style: normal;
        }
        .lp-btn-bone {
          display: inline-flex; align-items: center; justify-content: center;
          background: #F4F3EF; color: #0E0F0D;
          font-family: var(--font-barlow-condensed); font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px;
          border-radius: 999px; text-decoration: none;
          padding: 14px 30px; font-size: 15px;
          transition: transform .18s ease, box-shadow .18s ease;
          white-space: nowrap;
        }
        .lp-btn-bone:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(244,243,239,.18); }
        .lp-btn-ghost {
          display: inline-flex; align-items: center; justify-content: center;
          background: transparent; color: #F4F3EF;
          font-family: var(--font-barlow-condensed); font-weight: 700;
          text-transform: uppercase; letter-spacing: 1px;
          border-radius: 999px; text-decoration: none;
          padding: 14px 30px; font-size: 15px;
          border: 1.5px solid rgba(244,243,239,.25);
          transition: border-color .18s ease, color .18s ease;
          white-space: nowrap;
        }
        .lp-btn-ghost:hover { border-color: #fff; color: #fff; }
        .lp-root a:focus-visible, .lp-root button:focus-visible {
          outline: 3px solid #F4F3EF; outline-offset: 2px;
        }
        .lp-nav-link {
          font-family: var(--font-dm-sans); font-size: 14px; color: #9AA093;
          text-decoration: none; transition: color .15s;
        }
        .lp-nav-link:hover { color: #F4F3EF; }
        .lp-feature-card { transition: transform .18s ease, border-color .18s ease; }
        .lp-feature-card:hover { transform: translateY(-3px); border-color: rgba(244,243,239,.28); }
        .lp-ticker-track {
          display: flex; align-items: center; gap: 40px; width: max-content;
          animation: lp-scroll 34s linear infinite;
        }
        @keyframes lp-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-ticker-track { animation: none; }
        }
        @media (max-width: 880px) {
          .lp-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .lp-hero-card-wrap { transform: none !important; max-width: 100% !important; }
          .lp-nav-links-text { display: none !important; }
          .lp-nav-pad { padding: 18px 20px !important; }
          .lp-hero-pad { padding: 96px 20px 48px !important; }
          .lp-pipeline-grid { grid-template-columns: 1fr !important; }
          .lp-verdicts-grid { grid-template-columns: 1fr !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-feature-strip { grid-template-columns: 1fr !important; }
          .lp-section-pad { padding: 56px 20px !important; }
          .lp-cta-pad { padding: 64px 20px !important; }
          .lp-footer-pad { padding: 28px 20px !important; }
        }
      `}</style>

      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: TOPO_DATA_URI,
          backgroundSize: '900px',
          backgroundRepeat: 'repeat',
        }}
      />

      <div className="lp-root" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── NAV ── */}
        <nav className="lp-nav-pad" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 48px', borderBottom: '1px solid rgba(244,243,239,.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 6, background: '#F4F3EF',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <IconBolt size={16} stroke={2.4} color="#0E0F0D" />
            </span>
            <span style={{
              fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '1px', color: '#F4F3EF', fontSize: 16,
            }}>
              MTB Forecaster
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <div className="lp-nav-links-text" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
              <a href="#como-funciona" className="lp-nav-link">Como funciona</a>
              <Link href="/login" className="lp-nav-link">Entrar</Link>
            </div>
            <Link href="/cadastro" className="lp-btn-bone" style={{ padding: '10px 22px', fontSize: 13 }}>
              Criar conta
            </Link>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className="lp-hero-pad" style={{ padding: '72px 48px 64px' }}>
          <div className="lp-hero-grid" style={{
            display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48,
            maxWidth: 1280, margin: '0 auto', alignItems: 'center',
          }}>
            {/* Coluna esquerda */}
            <div>
              <p style={{
                fontFamily: 'var(--font-dm-mono)', fontSize: 13, letterSpacing: '2px',
                color: '#6d745f', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
              }}>
                <span style={{ display: 'inline-block', width: 34, height: 2, background: '#6d745f' }} />
                MTB · EMTB · XC · PUMP TRACK · MOTO · RUN
              </p>
              <h1 style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                fontSize: 'clamp(52px, 7vw, 92px)', lineHeight: 0.95,
                textTransform: 'uppercase', color: '#F4F3EF', margin: '0 0 20px',
              }}>
                Saiba antes<br />de <span className="lp-vazado">pedalar.</span>
              </h1>
              <p style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 18, color: '#9AA093',
                lineHeight: 1.6, maxWidth: 480, margin: '0 0 32px',
              }}>
                Trilhas MTB e pump tracks monitorados com chuva real, modelo de secagem do
                solo e um{' '}
                <strong style={{ color: '#F4F3EF', fontWeight: 700 }}>veredicto direto</strong>:
                DROP LIBERADO ou melhor esperar. Atualizado 2× por dia, todo dia.
              </p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
                <Link href="/cadastro" className="lp-btn-bone">Ver condições agora</Link>
                <a href="#como-funciona" className="lp-btn-ghost">Como funciona</a>
              </div>
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 13, color: '#9AA093' }}>
                <span style={{ color: '#F4F3EF' }}>2×/dia</span> atualizações ·{' '}
                <span style={{ color: '#F4F3EF' }}>12h</span> horizonte do veredicto ·{' '}
                <span style={{ color: '#F4F3EF' }}>ERA5 + OpenWeather</span>
              </p>
            </div>

            {/* Coluna direita — card de produto */}
            <div className="lp-hero-card-wrap" style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                position: 'relative', width: '100%', maxWidth: 400,
                background: 'linear-gradient(160deg, #1B1E18, #121410)',
                border: '1px solid rgba(109,116,95,.28)', borderRadius: 24,
                padding: 28, boxShadow: '0 30px 60px rgba(0,0,0,.45)',
                transform: 'rotate(1.5deg)',
              }}>
                <div style={{
                  position: 'absolute', top: -14, right: 20, transform: 'rotate(-4deg)',
                  background: '#22C55E', color: '#0E0F0D',
                  fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                  textTransform: 'uppercase', fontSize: 13, letterSpacing: '0.5px',
                  padding: '6px 14px', borderRadius: 8,
                  boxShadow: '0 8px 20px rgba(34,197,94,.35)',
                }}>
                  Drop Liberado
                </div>

                <div style={{ marginTop: 14, marginBottom: 18 }}>
                  <p style={{
                    fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700,
                    fontSize: 24, color: '#F4F3EF', margin: 0, textTransform: 'uppercase',
                  }}>
                    Saracura
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#9AA093', margin: '2px 0 0' }}>
                    Extrema · MG
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  {['Enduro', 'Argiloso', 'Mata fechada'].map(tag => (
                    <span key={tag} style={{
                      fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#F4F3EF',
                      background: 'rgba(244,243,239,.08)', padding: '4px 10px', borderRadius: 999,
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16,
                }}>
                  {[
                    { label: 'Aderência', value: '92', color: '#22C55E' },
                    { label: 'Solo', value: 'Grip perfeito', color: '#22C55E' },
                    { label: 'Chuva 24h', value: '0.4mm', color: '#F4F3EF' },
                    { label: 'Pico 3h', value: '1.2mm', color: '#F59E0B' },
                  ].map(m => (
                    <div key={m.label} style={{
                      background: 'rgba(244,243,239,.05)', borderRadius: 12, padding: '12px 14px',
                    }}>
                      <p style={{
                        fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093',
                        textTransform: 'uppercase', margin: '0 0 4px', letterSpacing: '0.5px',
                      }}>
                        {m.label}
                      </p>
                      <p style={{
                        fontFamily: 'var(--font-dm-mono)', fontSize: 22, color: m.color, margin: 0,
                        lineHeight: 1.1,
                      }}>
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(244,243,239,.06)', border: '1px solid rgba(244,243,239,.18)',
                  borderRadius: 12, padding: '12px 14px', marginBottom: 18,
                }}>
                  <IconClock size={20} color="#F4F3EF" style={{ flexShrink: 0 }} />
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13, color: '#F4F3EF', margin: 0, lineHeight: 1.4 }}>
                    Janela de pedal: <strong>hoje, 8h–14h</strong> — antes da virada do tempo
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
                  {BAR_HEIGHTS.map((h, i) => (
                    <div key={i} style={{
                      flex: 1, height: h,
                      background: i >= BAR_HEIGHTS.length - 3 ? '#5B8DEF' : '#6d745f',
                      opacity: i >= BAR_HEIGHTS.length - 3 ? 0.85 : 0.5,
                      borderRadius: '3px 3px 0 0',
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  {['08h', '12h', '16h', '20h'].map(l => (
                    <span key={l} style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 10, color: '#9AA093' }}>{l}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAIXA ROLANTE ── */}
        <div style={{
          overflow: 'hidden', borderTop: '1px solid rgba(244,243,239,.07)',
          borderBottom: '1px solid rgba(244,243,239,.07)', padding: '18px 0',
        }}>
          <div className="lp-ticker-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((name, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 40, flexShrink: 0 }}>
                <span style={{
                  fontFamily: 'var(--font-barlow-condensed)', fontWeight: 600, fontSize: 18,
                  textTransform: 'uppercase', letterSpacing: '2px', color: '#9AA093',
                }}>
                  {name}
                </span>
                <span style={{ color: '#6d745f', fontSize: 14 }}>◆</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── COMO FUNCIONA ── */}
        <section id="como-funciona" className="lp-section-pad" style={{ padding: '88px 48px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
              fontSize: 'clamp(32px, 5vw, 48px)', textTransform: 'uppercase',
              color: '#F4F3EF', margin: '0 0 12px', lineHeight: 1.05,
            }}>
              Do satélite ao <span className="lp-vazado">veredicto</span>
            </h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 16, color: '#9AA093',
              maxWidth: 560, margin: '0 0 48px',
            }}>
              Não é achismo de grupo de WhatsApp. É um pipeline que roda sozinho, duas vezes
              por dia.
            </p>

            <div className="lp-pipeline-grid" style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2,
              background: 'rgba(244,243,239,.07)', borderRadius: 16, overflow: 'hidden',
              marginBottom: 48,
            }}>
              {PIPELINE.map(step => (
                <div key={step.n} style={{ background: '#171914', padding: 32 }}>
                  <p style={{
                    fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#6d745f',
                    letterSpacing: '1px', margin: '0 0 16px',
                  }}>
                    {step.n} / {step.tag}
                  </p>
                  <h3 style={{
                    fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 22,
                    textTransform: 'uppercase', color: '#F4F3EF', margin: '0 0 10px',
                  }}>
                    {step.title}
                  </h3>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', lineHeight: 1.65, margin: 0 }}>
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="lp-verdicts-grid" style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
            }}>
              {VEREDICTOS.map(v => (
                <div key={v.chip} style={{
                  background: '#171914', border: '1px solid rgba(109,116,95,.28)',
                  borderRadius: 16, padding: 24,
                }}>
                  <span style={{
                    display: 'inline-block', fontFamily: 'var(--font-barlow-condensed)',
                    fontWeight: 800, textTransform: 'uppercase', fontSize: 13,
                    color: '#0E0F0D', background: v.color, borderRadius: 8,
                    padding: '5px 12px', marginBottom: 14, letterSpacing: '0.5px',
                  }}>
                    {v.chip}
                  </span>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', lineHeight: 1.6, margin: 0 }}>
                    {v.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section className="lp-section-pad" style={{ padding: '88px 48px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
              fontSize: 'clamp(32px, 5vw, 48px)', textTransform: 'uppercase',
              color: '#F4F3EF', margin: '0 0 12px', lineHeight: 1.05,
            }}>
              Trilha, bikepark e pump track
            </h2>
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: 16, color: '#9AA093',
              maxWidth: 620, margin: '0 0 48px',
            }}>
              Bikepark seca diferente de trilha de mata — o modelo sabe disso. E pump tracks
              têm previsão própria, com fotos e reviews da comunidade.
            </p>

            <div className="lp-features-grid" style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16,
            }}>
              <div className="lp-feature-card" style={{
                background: '#171914', border: '1px solid rgba(109,116,95,.28)',
                borderRadius: 16, padding: 28,
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44, background: 'rgba(244,243,239,.08)', borderRadius: 12,
                  marginBottom: 18,
                }}>
                  <IconBellRinging size={24} color="#F4F3EF" stroke={1.8} />
                </span>
                <h3 style={{
                  fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 20,
                  textTransform: 'uppercase', color: '#F4F3EF', margin: '0 0 8px',
                }}>
                  Alertas no Telegram
                </h3>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', lineHeight: 1.6, margin: 0 }}>
                  Sua trilha favorita virou DROP LIBERADO? Você fica sabendo antes do grupo.
                </p>
              </div>

              <div className="lp-feature-card" style={{
                background: '#171914', border: '1px solid rgba(109,116,95,.28)',
                borderRadius: 16, padding: 28,
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44, background: 'rgba(244,243,239,.08)', borderRadius: 12,
                  marginBottom: 18,
                }}>
                  <IconCalendarTime size={24} color="#F4F3EF" stroke={1.8} />
                </span>
                <h3 style={{
                  fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 20,
                  textTransform: 'uppercase', color: '#F4F3EF', margin: '0 0 8px',
                }}>
                  Janela de pedal
                </h3>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', lineHeight: 1.6, margin: 0 }}>
                  Não só &quot;se&quot;, mas &quot;quando&quot;: o melhor horário pra pedalar
                  nos próximos dias.
                </p>
              </div>

              <div className="lp-feature-card" style={{
                background: '#171914', border: '1px solid rgba(109,116,95,.28)',
                borderRadius: 16, padding: 28,
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44, background: 'rgba(244,243,239,.08)', borderRadius: 12,
                  marginBottom: 18,
                }}>
                  <IconMap2 size={24} color="#F4F3EF" stroke={1.8} />
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <h3 style={{
                    fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 20,
                    textTransform: 'uppercase', color: '#F4F3EF', margin: 0,
                  }}>
                    Pump tracks
                  </h3>
                  <span style={{
                    fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase',
                    color: '#A78BFA', background: 'rgba(124,58,237,.25)',
                    padding: '3px 8px', borderRadius: 999,
                  }}>
                    Pump Track
                  </span>
                </div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 14, color: '#9AA093', lineHeight: 1.6, margin: 0 }}>
                  Previsão de chuva, fotos e reviews pros principais pump tracks — pins roxos
                  no mapa.
                </p>
              </div>
            </div>

            <div className="lp-feature-strip" style={{
              display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 24,
              background: '#171914', border: '1px solid rgba(109,116,95,.28)',
              borderRadius: 16, padding: '40px 44px', alignItems: 'center',
            }}>
              <div>
                <h3 style={{
                  fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800, fontSize: 28,
                  textTransform: 'uppercase', color: '#F4F3EF', margin: '0 0 12px', lineHeight: 1.1,
                }}>
                  Cadastre a sua trilha.<br />Ou qualquer trilha.
                </h3>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: '#9AA093', lineHeight: 1.65, margin: 0 }}>
                  Trilha MTB ou pump track: preencha o formulário e ela{' '}
                  <strong style={{ color: '#F4F3EF', fontWeight: 700 }}>entra direto no catálogo</strong>.
                  O modelo processa as condições no próximo ciclo e todo mundo passa a ver o
                  veredicto dela.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Link href="/trilhas/cadastrar" className="lp-btn-bone">Cadastrar trilha</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ── */}
        <section className="lp-cta-pad" style={{
          padding: '100px 24px', textAlign: 'center',
          borderTop: '1px solid rgba(244,243,239,.07)',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(44px, 6vw, 76px)', textTransform: 'uppercase',
            color: '#F4F3EF', lineHeight: 1.02, margin: '0 0 20px',
          }}>
            Pare de adivinhar.<br /><span className="lp-vazado">Cheque o veredicto.</span>
          </h2>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 16, color: '#9AA093',
            margin: '0 auto 36px', maxWidth: 480,
          }}>
            Grátis pra começar. Planos pagos liberam alertas, janelas de pedal e todas as
            trilhas.
          </p>
          <Link href="/cadastro" className="lp-btn-bone" style={{ padding: '18px 44px', fontSize: 17 }}>
            Criar conta grátis
          </Link>
        </section>

        {/* ── FOOTER ── */}
        <footer className="lp-footer-pad" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, padding: '28px 48px',
          borderTop: '1px solid rgba(244,243,239,.07)',
        }}>
          <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 13, color: '#9AA093' }}>
            © 2026 MTB Forecaster
          </span>
          <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 13, color: '#9AA093' }}>
            mtbforecaster.com.br · @mtbforecaster_bot
          </span>
        </footer>
      </div>
    </div>
  )
}
