import Link from 'next/link'

const SLIDES = [
  {
    url: 'https://plus.unsplash.com/premium_photo-1683442814148-78aa260ac18e?w=1400&q=80&auto=format&fit=crop',
    label: 'Mountain Bike',
  },
  {
    url: 'https://images.unsplash.com/photo-1652361561822-b2aa3f30416e?w=1400&q=80&auto=format&fit=crop',
    label: 'Flow Trail',
  },
  {
    url: 'https://images.unsplash.com/photo-1645520719499-6856445fe4ad?w=1400&q=80&auto=format&fit=crop',
    label: 'Enduro',
  },
  {
    url: 'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?w=1400&q=80&auto=format&fit=crop',
    label: 'Trail Run',
  },
  {
    url: 'https://images.unsplash.com/photo-1682347812583-7855d5debecd?w=1400&q=80&auto=format&fit=crop',
    label: 'Trilha',
  },
  {
    url: 'https://images.unsplash.com/photo-1706033546034-23eaee295104?w=1400&q=80&auto=format&fit=crop',
    label: 'Moto',
  },
]

const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'Dados meteorológicos',
    desc: 'Coletamos chuva acumulada das últimas 48h, pico de intensidade nas últimas 3h e previsão para as próximas 24h usando múltiplas APIs climáticas.',
  },
  {
    step: 2,
    title: 'Modelo de solo',
    desc: 'Calculamos a saturação real considerando tipo de solo, altitude, bioma e microclima de cada trilha. Cada uma tem seus próprios parâmetros.',
  },
  {
    step: 3,
    title: 'Veredicto + janela',
    desc: 'Você recebe DROP LIBERADO, ATENÇÃO ou MELHOR ESPERAR com a melhor janela para as próximas 47 horas — sem achismo.',
  },
]

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#111' }}>

      <style>{`
        .lp-hero-slide { opacity: 0; transition: opacity 0.6s ease; }
        .lp-hero-slide.active { opacity: 1; }
        .lp-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.3); cursor: pointer; transition: all 0.3s; border: none; padding: 0; }
        .lp-dot.active { background: #FFE000; width: 20px; border-radius: 3px; }
        .lp-nav-link { font-size: 13px; color: #aaa; text-decoration: none; transition: color 0.15s; }
        .lp-nav-link:hover { color: #fff; }
        .lp-footer-link { font-size: 12px; color: #555; text-decoration: none; transition: color 0.15s; }
        .lp-footer-link:hover { color: #999; }

        @media (max-width: 640px) {
          .lp-nav { padding: 16px 20px !important; }
          .lp-nav-como { display: none !important; }
          .lp-nav-links { gap: 12px !important; }
          .lp-hero-content {
            padding-left: 20px !important;
            padding-right: 20px !important;
            padding-top: 72px !important;
            max-width: 100% !important;
          }
          .lp-dots-wrap { left: 20px !important; }
          .lp-slide-lbl { display: none !important; }
          .lp-ticker {
            padding: 10px 20px !important;
            justify-content: flex-start !important;
            gap: 4px 14px !important;
          }
          .lp-section-how { padding: 52px 20px !important; }
          .lp-section-cta { padding: 60px 20px !important; }
          .lp-footer-wrap {
            padding: 24px 20px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
        }
      `}</style>

      {/* ── HERO ── */}
      <div style={{ position: 'relative', height: '100vh', minHeight: 600, overflow: 'hidden' }}>

        {/* NAV */}
        <nav className="lp-nav" style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '24px 48px',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '2px', color: '#fff', flexShrink: 0 }}>
            MTB FORECASTER
          </span>
          <div className="lp-nav-links" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <a href="#como-funciona" className="lp-nav-link lp-nav-como">Como funciona</a>
            <Link href="/login" className="lp-nav-link">Entrar</Link>
            <Link href="/cadastro" style={{
              background: '#FFE000', color: '#111',
              fontSize: 12, fontWeight: 700,
              padding: '9px 20px', borderRadius: 4,
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
              Criar conta
            </Link>
          </div>
        </nav>

        {/* SLIDES */}
        {SLIDES.map((slide, i) => (
          <div
            key={slide.url}
            id={`slide-${i}`}
            className={`lp-hero-slide${i === 0 ? ' active' : ''}`}
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url('${slide.url}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ))}

        {/* OVERLAY */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.58)' }} />

        {/* CONTENT */}
        <div className="lp-hero-content" style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          paddingLeft: 48, paddingRight: 48, paddingTop: 80, paddingBottom: 0,
          maxWidth: 680,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '3px',
            color: '#FFE000', textTransform: 'uppercase', marginBottom: 16,
          }}>
            MTB · EMTB · XC · MOTO · RUN
          </p>
          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800,
            lineHeight: 1.05, color: '#fff', letterSpacing: '-1px', marginBottom: 16,
          }}>
            Saiba antes<br />de <span style={{ color: '#FFE000' }}>pedalar.</span>
          </h1>
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.6, maxWidth: 400, marginBottom: 32,
          }}>
            Condições de solo em tempo real para trilhas e atividades outdoor. Modelos meteorológicos e dados de campo para um veredicto confiável.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/cadastro" style={{
              background: '#FFE000', color: '#111',
              fontSize: 14, fontWeight: 700,
              padding: '14px 32px', borderRadius: 4, textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}>
              Criar conta grátis
            </Link>
            <Link href="/login" style={{
              background: 'transparent', color: '#fff',
              fontSize: 14, fontWeight: 500,
              padding: '14px 32px', borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.3)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}>
              Já tenho conta
            </Link>
          </div>
        </div>

        {/* DOTS */}
        <div id="lp-dots" className="lp-dots-wrap" style={{
          position: 'absolute', bottom: 28, left: 48,
          display: 'flex', gap: 8, zIndex: 5,
        }}>
          {SLIDES.map((_, i) => (
            <button key={i} className={`lp-dot${i === 0 ? ' active' : ''}`} data-i={i} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>

        {/* SLIDE LABEL */}
        <p id="lp-slide-label" className="lp-slide-lbl" style={{
          position: 'absolute', bottom: 24, right: 48,
          fontSize: 10, letterSpacing: '2px',
          color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', zIndex: 5,
        }}>
          {SLIDES[0].label}
        </p>
      </div>

      {/* ── TICKER ── */}
      <div className="lp-ticker" style={{
        background: '#FFE000', padding: '11px 48px',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        {['Trilhas monitoradas diariamente', 'Chuva acumulada 48h', 'Modelo de secagem do solo', 'Atualização em tempo real', 'Brasil'].map(t => (
          <span key={t} style={{ fontSize: 11, fontWeight: 700, color: '#111', letterSpacing: '0.5px' }}>{t}</span>
        ))}
      </div>

      {/* ── COMO FUNCIONA ── */}
      <div id="como-funciona" className="lp-section-how" style={{ background: '#fff', padding: '80px 48px' }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '3px',
          color: '#888', textTransform: 'uppercase',
          marginBottom: 12, textAlign: 'center',
        }}>
          Como funciona
        </p>
        <h2 style={{
          fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 800,
          color: '#111', textAlign: 'center',
          marginBottom: 56, letterSpacing: '-0.5px',
        }}>
          Do céu ao veredicto
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 40, maxWidth: 960, margin: '0 auto',
        }}>
          {HOW_IT_WORKS.map(item => (
            <div key={item.step}>
              <div style={{
                width: 36, height: 36, background: '#FFE000', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 16,
              }}>
                {item.step}
              </div>
              <div style={{ width: 32, height: 3, background: '#FFE000', borderRadius: 2, marginBottom: 16 }} />
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111', marginBottom: 8 }}>{item.title}</h3>
              <p style={{ fontSize: 13, color: '#777', lineHeight: 1.65 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA FINAL ── */}
      <div className="lp-section-cta" style={{
        background: '#111', padding: '100px 48px',
        textAlign: 'center', borderTop: '1px solid #1E1E1E',
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '3px',
          color: '#FFE000', textTransform: 'uppercase', marginBottom: 16,
        }}>
          Gratuito para começar
        </p>
        <h2 style={{
          fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800,
          color: '#fff', marginBottom: 16, letterSpacing: '-0.5px',
        }}>
          Pronto para pedalar<br />com segurança?
        </h2>
        <p style={{ fontSize: 15, color: '#777', marginBottom: 36 }}>
          Crie sua conta e acompanhe as condições das suas trilhas favoritas.
        </p>
        <Link href="/cadastro" style={{
          background: '#FFE000', color: '#111',
          fontSize: 15, fontWeight: 700,
          padding: '16px 48px', borderRadius: 4,
          textDecoration: 'none', display: 'inline-block',
        }}>
          Criar conta grátis
        </Link>
      </div>

      {/* ── FOOTER ── */}
      <div className="lp-footer-wrap" style={{
        background: '#0A0A0A', padding: '32px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid #1E1E1E', flexWrap: 'wrap', gap: 16,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '2px', color: '#444' }}>
          MTB FORECASTER
        </span>
        <div style={{ display: 'flex', gap: 24 }}>
          <a href="#como-funciona" className="lp-footer-link">Como funciona</a>
          <Link href="/login" className="lp-footer-link">Entrar</Link>
          <Link href="/cadastro" className="lp-footer-link">Criar conta</Link>
        </div>
        <span style={{ fontSize: 11, color: '#333' }}>© 2026 MTB Forecaster</span>
      </div>

      {/* ── SLIDESHOW SCRIPT ── */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var slides = document.querySelectorAll('.lp-hero-slide');
          var dots = document.querySelectorAll('#lp-dots button');
          var labelEl = document.getElementById('lp-slide-label');
          var labels = ${JSON.stringify(SLIDES.map(s => s.label))};
          var current = 0;
          function goTo(i) {
            slides[current].classList.remove('active');
            dots[current].classList.remove('active');
            current = i;
            slides[current].classList.add('active');
            dots[current].classList.add('active');
            if (labelEl) labelEl.textContent = labels[current];
          }
          dots.forEach(function(d) {
            d.addEventListener('click', function() { goTo(parseInt(d.dataset.i)); });
          });
          setInterval(function() { goTo((current + 1) % slides.length); }, 3500);
        })();
      `}} />

    </div>
  )
}
