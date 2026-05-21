'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { VEREDICTO_ACCENT, VEREDICTO_JANELA_BG, VEREDICTO_JANELA_COLOR, VEREDICTO_LABEL } from '@/lib/display'

type CondicaoPreview = {
  veredicto: string
  aderencia_status: string
  acumulo_48h: number
  wind_ms: number
}

type TrilhaPreview = {
  id: string
  name: string
  regiao: string
  trail_type: string | null
  bioma: string | null
  condicoes: CondicaoPreview[]
}

type Observacao = {
  id: string
  texto: string
  veredicto_sistema: string | null
  created_at: string
  trilhas: { name: string }[] | null
  profiles: { apelido: string | null; nome: string | null }[] | null
}

const VEREDICTO_FALLBACK = 'DROP LIBERADO - Veja os alertas'

function TrilhaCardBlurred({ trilha }: { trilha: TrilhaPreview }) {
  const cond = trilha.condicoes?.[0]
  const vKey = (cond?.veredicto && VEREDICTO_ACCENT[cond.veredicto]) ? cond.veredicto : VEREDICTO_FALLBACK
  const bar   = VEREDICTO_ACCENT[vKey]
  const bg    = VEREDICTO_JANELA_BG[vKey]
  const text  = VEREDICTO_JANELA_COLOR[vKey]
  const label = VEREDICTO_LABEL[vKey]
  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '0.5px solid #E5E7EB', background: '#fff' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: bar }} />
      <div style={{ padding: '14px 14px 14px 22px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#111', marginBottom: 4 }}>{trilha.name}</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const, marginBottom: 10 }}>
          {[trilha.trail_type, trilha.regiao, trilha.bioma].filter(Boolean).map(t => (
            <span key={t} style={{ background: '#F3F4F6', borderRadius: 999, padding: '2px 9px', fontSize: 10, color: '#6B7280', fontWeight: 500 }}>{t}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' as const }}>
          <span style={{ background: bg, color: text, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>{label}</span>
          {cond?.aderencia_status && (
            <span style={{ background: bg, color: text, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>{cond.aderencia_status}</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, filter: 'blur(4px)', userSelect: 'none' as const }}>
          {['Chuva 48h', 'Pico 3h', 'Vento prev.'].map(l => (
            <div key={l} style={{ background: '#F9FAFB', borderRadius: 8, padding: '7px 8px' }}>
              <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>—</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, background: '#F9FAFB', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '0.5px solid #E5E7EB' }}>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Faça login para ver detalhes</span>
          <Link href="/login" style={{ background: '#FFE000', color: '#111', fontSize: 11, fontWeight: 600, padding: '6px 12px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
            Entrar
          </Link>
        </div>
      </div>
    </div>
  )
}

function AvaliacaoCard({ obs }: { obs: Observacao }) {
  const cor = VEREDICTO_JANELA_COLOR[obs.veredicto_sistema ?? ''] ?? '#6B7280'
  const riderNome = obs.profiles?.[0]?.apelido || obs.profiles?.[0]?.nome || 'Rider'
  const trilhaNome = obs.trilhas?.[0]?.name ?? ''
  const initials = riderNome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
  const dataFormatada = obs.created_at
    ? new Date(obs.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : ''
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '0.5px solid #E5E7EB', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#FFE000', flexShrink: 0 }}>{initials}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#111' }}>{riderNome}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{trilhaNome}{trilhaNome && dataFormatada ? ' · ' : ''}{dataFormatada}</div>
          </div>
        </div>
        {obs.veredicto_sistema && (
          <span style={{ fontSize: 10, fontWeight: 600, color: cor, background: cor + '18', borderRadius: 6, padding: '3px 8px' }}>{obs.veredicto_sistema}</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, margin: 0 }}>{obs.texto}</p>
    </div>
  )
}

export default function LandingPage() {
  const [trilhas, setTrilhas] = useState<TrilhaPreview[]>([])
  const [avaliacoes, setAvaliacoes] = useState<Observacao[]>([])

  useEffect(() => {
    fetch('/api/public/preview')
      .then(r => r.json())
      .then(({ trilhas, avaliacoes }) => {
        if (trilhas) setTrilhas(trilhas)
        if (avaliacoes) setAvaliacoes(avaliacoes)
      })
  }, [])

  return (
    <main style={{ fontFamily: "'Inter', sans-serif", background: '#F8F9FA', color: '#111', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#1A1A1A', padding: '64px 28px 44px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,224,0,0.12)', border: '1px solid rgba(255,224,0,0.3)', borderRadius: 999, padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#FFE000', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 20 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFE000', display: 'inline-block' }} />
          19 trilhas monitoradas · SP e MG
        </div>
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 56, lineHeight: 0.95, textTransform: 'uppercase' as const, color: '#fff', marginBottom: 18 }}>
          Saiba antes<br />de <span style={{ color: '#FFE000' }}>pedalar.</span>
        </h1>
        <p style={{ fontSize: 15, color: '#9CA3AF', maxWidth: 420, lineHeight: 1.6, marginBottom: 32 }}>
          Condições de solo em tempo real para trilhas DH e Enduro. Modelo meteorológico calibrado por riders de campo.
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: 40 }}>
          <Link href="/cadastro" style={{ background: '#FFE000', color: '#111', fontSize: 14, fontWeight: 600, padding: '13px 26px', borderRadius: 8, textDecoration: 'none' }}>Criar conta grátis</Link>
          <Link href="/trilhas" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
            Ver trilhas →
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' as const }}>
          {[{ val: '19+', label: 'Trilhas ativas' }, { val: 'SP & MG', label: 'Regiões cobertas' }, { val: '24h', label: 'Atualização diária' }].map(s => (
            <div key={s.label}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, color: '#fff' }}>{s.val}</div>
              <div style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 3, background: '#FFE000', marginTop: 40, marginLeft: -28, marginRight: -28 }} />
      </section>

      {/* Condições com blur */}
      <section style={{ padding: '48px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, textTransform: 'uppercase' as const, color: '#111' }}>Condições agora</h2>
          <Link href="/login" style={{ fontSize: 13, color: '#6B7280', textDecoration: 'none' }}>Ver todas →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {trilhas.length > 0
            ? trilhas.slice(0, 4).map(t => <TrilhaCardBlurred key={t.id} trilha={t} />)
            : Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 16, background: '#fff', border: '0.5px solid #E5E7EB', height: 220, opacity: 0.3 + i * 0.15 }} />
              ))
          }
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href="/cadastro" style={{ background: '#FFE000', color: '#111', fontSize: 14, fontWeight: 600, padding: '13px 32px', borderRadius: 8, textDecoration: 'none', display: 'inline-block' }}>
            Criar conta grátis para ver tudo
          </Link>
        </div>
      </section>

      {/* Strava */}
      <section style={{ background: '#1A1A1A', padding: '48px 28px' }}>
        <div style={{ height: 3, background: '#E34402', marginBottom: 28, width: 40 }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' as const }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 18, color: '#E34402', letterSpacing: '0.06em' }}>STRAVA</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>Integrado</span>
            </div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, textTransform: 'uppercase' as const, color: '#fff', lineHeight: 1, marginBottom: 14 }}>
              Suas trilhas do<br /><span style={{ color: '#E34402' }}>Strava</span>, com previsão.
            </h2>
            <p style={{ fontSize: 14, color: '#9CA3AF', lineHeight: 1.6, marginBottom: 24 }}>
              Conecte sua conta Strava e veja as condições de solo das suas trilhas favoritas direto na plataforma. Sem recadastrar nada.
            </p>
            <Link href="/cadastro" style={{ background: '#E34402', color: '#fff', fontSize: 13, fontWeight: 600, padding: '11px 22px', borderRadius: 8, textDecoration: 'none', display: 'inline-block' }}>
              Conectar Strava
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 200, flex: 1 }}>
            {[
              'Importa seus segmentos favoritos automaticamente',
              'Veredicto de solo para cada trilha do seu histórico',
              'Notificação quando suas rotas estiverem liberadas',
            ].map(text => (
              <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 16px', border: '0.5px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height: 3, background: '#FFE000', marginTop: 40, marginLeft: -28, marginRight: -28 }} />
      </section>

      {/* Avaliações */}
      <section style={{ padding: '48px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, textTransform: 'uppercase' as const, color: '#111' }}>O que os riders estão falando</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {avaliacoes.length > 0
            ? avaliacoes.map(obs => <AvaliacaoCard key={obs.id} obs={obs} />)
            : Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 16, background: '#fff', border: '0.5px solid #E5E7EB', height: 100, opacity: 0.3 + i * 0.15 }} />
              ))
          }
        </div>
      </section>

      {/* Como funciona */}
      <section style={{ background: '#1A1A1A', padding: '48px 28px' }}>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, textTransform: 'uppercase' as const, color: '#fff', marginBottom: 8 }}>Como funciona</h2>
        <div style={{ height: 3, background: '#FFE000', width: 40, marginBottom: 28 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {[
            { title: 'Dados meteorológicos reais', text: 'OpenWeather + Open-Meteo coletados diariamente às 07h para cada trilha.' },
            { title: 'Modelo de solo calibrado', text: 'Decaimento exponencial por tipo de solo e exposição, afinado por riders em campo.' },
            { title: 'Microclima por trilha', text: 'Mata Atlântica, altitude e exposição solar ajustam os limiares de cada trilha.' },
            { title: 'Veredicto no seu e-mail', text: 'Email diário com DROP LIBERADO, ATENÇÃO ou MELHOR ESPERAR para suas trilhas.' },
          ].map(c => (
            <div key={c.title} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#fff', marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{c.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#FFE000', padding: '56px 28px', textAlign: 'center' as const }}>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 38, textTransform: 'uppercase' as const, color: '#111', marginBottom: 12 }}>
          Pronto para pedalar<br />com mais segurança?
        </h2>
        <p style={{ fontSize: 14, color: '#555', maxWidth: 360, margin: '0 auto 28px', lineHeight: 1.6 }}>
          Crie sua conta grátis e receba as condições das suas trilhas favoritas todo dia.
        </p>
        <Link href="/cadastro" style={{ background: '#111', color: '#fff', fontSize: 14, fontWeight: 600, padding: '14px 32px', borderRadius: 8, textDecoration: 'none', display: 'inline-block' }}>
          Criar conta grátis
        </Link>
      </section>

      <footer style={{ background: '#111', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 14, letterSpacing: '0.08em', color: '#fff' }}>MTB FORECASTER</span>
        <span style={{ fontSize: 11, color: '#555' }}>Feito por riders, para riders · SP &amp; MG</span>
      </footer>

    </main>
  )
}
