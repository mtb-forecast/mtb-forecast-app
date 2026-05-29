'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Barlow_Condensed } from 'next/font/google'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, Profile, VEREDICTO_CONFIG, ADERENCIA_CONFIG } from '@/lib/types'
import { rainColor, peakColor, windColor, DISPLAY_THR, VEREDICTO_ACCENT, VEREDICTO_JANELA_BG } from '@/lib/display'
import TrilhaCard from '@/components/TrilhaCard'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'] })

type CondicaoPessoal = {
  aderencia_status: string | null
  aderencia_score: number | null
  veredicto: string | null
  veredicto_12h: string | null
  rain_mm: number | null
  wind_ms: number | null
  pico_3h: number | null
  acumulo_48h: number | null
  acumulo_ef: number | null
  ultima_chuva_h: number | null
  meia_vida_h: number | null
  gust_max_kmh: number | null
  janela: string | null
  frase_secagem: string | null
  solo_descansado: boolean | null
  gerado_em: string
}

type TrilhaPessoalComCondicao = {
  id: string
  name: string
  regiao: string
  strava_url: string
  strava_segment_id: number
  extensao_km?: number
  desnivel_m?: number
  condicao?: CondicaoPessoal | null
}

// ── ranking ──────────────────────────────────────────────────────────────────

const RANKING_VEREDICTO: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}

const RANKING_ADERENCIA: Record<string, number> = {
  'GRIP PERFEITO': 0,
  'SECO': 1,
  'BOA ADERÊNCIA': 2,
  'BAIXA ADERÊNCIA': 3,
}

// ── cores Strava card ─────────────────────────────────────────────────────────


// ── helpers visuais ───────────────────────────────────────────────────────────

const pill: React.CSSProperties = {
  fontSize: '0.7rem', color: '#6B7280', background: '#F3F4F6',
  borderRadius: 999, padding: '2px 9px',
}

const metricBox: React.CSSProperties = {
  background: '#F9FAFB', borderRadius: 10, padding: '8px 10px',
}

const metricLabel: React.CSSProperties = {
  fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase',
  letterSpacing: '0.04em', marginBottom: 3,
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </p>
  )
}

function SectionHeader({ title, linkHref, linkLabel, titleColor }: {
  title: string
  linkHref?: string
  linkLabel?: string
  titleColor?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 500, color: titleColor ?? '#111111' }}>{title}</h2>
      {linkHref && (
        <Link href={linkHref} style={{ fontSize: 13, color: '#6B7280', fontWeight: 400, textDecoration: 'none' }}>
          {linkLabel ?? 'Ver todas →'}
        </Link>
      )}
    </div>
  )
}

// ── card Strava ───────────────────────────────────────────────────────────────

function StravaCardItem({ t, avaliacao }: {
  t: TrilhaPessoalComCondicao
  avaliacao?: { count: number; media: number }
}) {
  const c             = t.condicao
  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const accentColor   = veredictoText ? (VEREDICTO_ACCENT[veredictoText] ?? '#E34402') : '#E34402'
  const janelaBg      = veredictoText ? (VEREDICTO_JANELA_BG[veredictoText]    ?? '#F9FAFB') : '#F9FAFB'
  const showPico      = c?.pico_3h != null && c.pico_3h >= DISPLAY_THR.picoMin
  const windKmh       = c?.wind_ms != null ? c.wind_ms * 3.6 : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          background: '#FFFFFF', borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          display: 'flex', overflow: 'hidden',
          transition: 'box-shadow 0.2s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.10)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)')}
      >
        {/* Barra lateral colorida */}
        <div style={{ width: 6, flexShrink: 0, background: accentColor }} />

        {/* Conteúdo */}
        <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Nome + logo STRAVA */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111111', lineHeight: 1.3, flex: 1, margin: 0 }}>
              {t.name}
            </h3>
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#E34402',
              letterSpacing: '0.05em', flexShrink: 0, lineHeight: 1,
            }}>
              STRAVA
            </span>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ ...pill, background: '#FEF0EB', color: '#E34402' }}>Strava</span>
            <span style={pill}>{t.regiao}</span>
          </div>

          {c ? (
            <>
              {/* Badge veredicto */}
              {veredictoText && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <span style={{
                    background: accentColor + '26', color: accentColor,
                    borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, padding: '2px 7px',
                  }}>
                    {veredictoText}
                  </span>
                </div>
              )}

              {/* Grid métricas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <div style={metricBox}>
                  <div style={metricLabel}>Chuva 48h</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: rainColor(c.acumulo_48h), display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-droplet" style={{ fontSize: 14 }} />
                    {c.acumulo_48h?.toFixed(1) ?? '—'}mm
                  </div>
                </div>
                {showPico && (
                  <div style={metricBox}>
                    <div style={metricLabel}>Pico 3h</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: peakColor(c.pico_3h!), display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="ti ti-droplet-half" style={{ fontSize: 14 }} />
                      {c.pico_3h!.toFixed(1)}mm
                    </div>
                  </div>
                )}
                <div style={metricBox}>
                  <div style={metricLabel}>Vento máx.</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: windColor(windKmh), display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="ti ti-wind" style={{ fontSize: 14 }} />
                    {windKmh != null ? windKmh.toFixed(1) : '—'} km/h
                  </div>
                </div>
                {c.ultima_chuva_h != null && (
                  <div style={metricBox}>
                    <div style={metricLabel}>Última chuva</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="ti ti-history" style={{ fontSize: 14 }} />
                      {c.ultima_chuva_h}h atrás
                    </div>
                  </div>
                )}
              </div>

              {/* Frase secagem */}
              {c.frase_secagem && (
                <p style={{ fontStyle: 'italic', fontSize: '0.8rem', color: '#555555', lineHeight: 1.7, margin: 0 }}>
                  {c.frase_secagem}
                </p>
              )}

              {/* Janela */}
              {c.janela ? (
                <div style={{ background: janelaBg, borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-clock" style={{ fontSize: 13, color: '#6B7280' }} />
                  <span style={{ color: '#374151' }}>{c.janela}</span>
                </div>
              ) : (
                <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#9CA3AF' }} />
                  <span style={{ color: '#9CA3AF' }}>Sem janela definida</span>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#9CA3AF', fontStyle: 'italic', margin: 0 }}>
              Condições no próximo relatório (07:00 BRT)
            </p>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            {c?.gerado_em ? (
              <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>
                Atualizado às {new Date(c.gerado_em).toLocaleTimeString('pt-BR', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
                })}
              </span>
            ) : <span />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <a
                href={t.strava_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.8rem', fontWeight: 500, color: '#E34402', textDecoration: 'none' }}
              >
                Strava ↗
              </a>
              <Link
                href={`/trilhas/${t.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#111111' }}>Ver detalhes</span>
                <span style={{
                  background: '#F3F4F6', borderRadius: '50%', width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <i className="ti ti-arrow-right" style={{ fontSize: 13, color: '#111111' }} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Badge avaliações */}
      {avaliacao && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 500, color: '#92400E',
          background: '#FFFBEB', borderRadius: 6, padding: '3px 9px',
          width: 'fit-content',
        }}>
          <i className="ti ti-star-filled" style={{ fontSize: 12, color: '#F59E0B' }} />
          {avaliacao.media}
          <span style={{ color: '#888', fontWeight: 400 }}>
            ({avaliacao.count} avaliação{avaliacao.count > 1 ? 'ões' : ''} recente{avaliacao.count > 1 ? 's' : ''})
          </span>
        </div>
      )}
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [favoritas, setFavoritas] = useState<TrilhaComCondicao[]>([])
  const [stravaTrails, setStravaTrails] = useState<TrilhaPessoalComCondicao[]>([])
  const [avaliacoesPorTrilha, setAvaliacoesPorTrilha] = useState<Record<string, { count: number; media: number }>>({})
  const [avaliacoesPorSegmento, setAvaliacoesPorSegmento] = useState<Record<number, { count: number; media: number }>>({})
  const [loading, setLoading] = useState(true)
  const [selecionadas, setSelecionadas] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email ?? null)

      const h48atras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

      const [{ data: profileData }, { data: favIds }, { data: trilhasStrava }, { data: avaliacoes48h }] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
          supabase.from('trilhas_pessoais').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          supabase.from('observacoes_trilha').select('trilha_id, strava_segment_id, estrelas, created_at').gte('created_at', h48atras),
        ])

      setProfile(profileData)

      const [trilhasResult, trilhasComCondicao] = await Promise.all([
        favIds && favIds.length > 0
          ? supabase
              .from('trilhas').select(`*, condicoes(*), previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med), localidades(cidade, estado, localidade)`)
              .in('id', favIds.map((f: { trilha_id: string }) => f.trilha_id)).eq('aprovada', true)
              .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
              .order('bloco', { foreignTable: 'previsao_blocos' })
          : Promise.resolve({ data: null }),
        Promise.all(
          (trilhasStrava || []).map(async (t: TrilhaPessoalComCondicao) => {
            const { data: cond } = await supabase
              .from('condicoes_strava')
              .select(`aderencia_status, aderencia_score, veredicto, veredicto_12h,
                rain_mm, wind_ms, pico_3h, acumulo_48h, acumulo_ef,
                ultima_chuva_h, meia_vida_h, gust_max_kmh,
                janela, frase_secagem, solo_descansado, gerado_em`)
              .eq('strava_segment_id', t.strava_segment_id)
              .order('gerado_em', { ascending: false })
              .limit(1).maybeSingle()
            return { ...t, condicao: cond || null }
          })
        ),
      ])

      if (trilhasResult.data) {
        const mapped = trilhasResult.data.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][]; previsao_blocos?: import('@/lib/types').PrevisaoBloco[] }) => {
          const arr = Array.isArray(t.condicoes) ? t.condicoes : []
          const condicao = arr[0] ?? undefined
          const blocos = Array.isArray(t.previsao_blocos) ? [...t.previsao_blocos].sort((a, b) => a.bloco - b.bloco) : null
          if (condicao && blocos?.length) condicao.previsao_24h = blocos
          return { ...t, condicao }
        })
        const trilhasOrdenadas = [...mapped].sort((a, b) => {
          const vA = RANKING_VEREDICTO[a.condicao?.veredicto_12h || a.condicao?.veredicto || ''] ?? 99
          const vB = RANKING_VEREDICTO[b.condicao?.veredicto_12h || b.condicao?.veredicto || ''] ?? 99
          if (vA !== vB) return vA - vB
          const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
          const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
          return aA - aB
        })
        setFavoritas(trilhasOrdenadas)
      }

      setStravaTrails(trilhasComCondicao)

      const porTrilha: Record<string, { count: number; media: number }> = {}
      const porSegmento: Record<number, { count: number; media: number }> = {}
      for (const av of avaliacoes48h || []) {
        if (av.trilha_id) {
          if (!porTrilha[av.trilha_id]) porTrilha[av.trilha_id] = { count: 0, media: 0 }
          porTrilha[av.trilha_id].count++
          porTrilha[av.trilha_id].media += av.estrelas
        }
        if (av.strava_segment_id) {
          if (!porSegmento[av.strava_segment_id]) porSegmento[av.strava_segment_id] = { count: 0, media: 0 }
          porSegmento[av.strava_segment_id].count++
          porSegmento[av.strava_segment_id].media += av.estrelas
        }
      }
      Object.values(porTrilha).forEach(d => { d.media = Math.round(d.media / d.count * 10) / 10 })
      Object.values(porSegmento).forEach(d => { d.media = Math.round(d.media / d.count * 10) / 10 })
      setAvaliacoesPorTrilha(porTrilha)
      setAvaliacoesPorSegmento(porSegmento)

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, border: '2px solid #e5e5e5',
            borderTopColor: '#111', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          <p style={{ color: '#888', fontSize: 14 }}>Carregando condições...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const name = profile?.apelido || profile?.nome?.split(' ')[0] || userEmail?.split('@')[0]

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA' }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#1A1A1A', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{
            fontFamily: barlow.style.fontFamily,
            fontSize: 42, fontWeight: 800,
            textTransform: 'uppercase', lineHeight: 1.05,
            margin: 0,
          }}>
            {name ? (
              <>
                <span style={{ color: '#FFFFFF' }}>Olá, </span>
                <span style={{ color: '#FFE000' }}>{name}</span>
                <span style={{ color: '#FFFFFF' }}>.</span>
              </>
            ) : (
              <span style={{ color: '#FFFFFF' }}>Dashboard.</span>
            )}
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 8 }}>
            Confira as condições de hoje nas suas trilhas
          </p>
          <div style={{ background: '#FFE000', height: 3, marginTop: 20 }} />
        </div>
      </div>

      {/* Banner de perfil incompleto */}
      {!(profile?.nome && profile?.apelido && profile?.telefone && profile?.regiao) && (
        <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 28px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, color: '#92400e' }}>
              ⚠️ Complete seu perfil para aproveitar todos os recursos
            </p>
            <Link
              href="/perfil"
              style={{
                fontSize: 13, fontWeight: 500, color: '#111',
                background: '#FFE000', border: '1.5px solid #111',
                borderRadius: 4, padding: '6px 16px',
                whiteSpace: 'nowrap', textDecoration: 'none',
              }}
            >
              Completar perfil
            </Link>
          </div>
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Seção: Trilhas favoritas */}
        <section style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#111111' }}>Minhas trilhas favoritas</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {selecionadas.length === 2 && (
                <Link
                  href={`/dashboard/comparar?a=${selecionadas[0]}&b=${selecionadas[1]}`}
                  style={{
                    background: '#FFE000', color: '#111', border: '1.5px solid #111',
                    borderRadius: 4, padding: '6px 14px', fontSize: 13, fontWeight: 600,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <i className="ti ti-arrows-diff" style={{ fontSize: 14 }} />
                  Comparar trilhas
                </Link>
              )}
              <Link href="/trilhas" style={{ fontSize: 13, color: '#6B7280', fontWeight: 400, textDecoration: 'none' }}>
                Ver todas →
              </Link>
            </div>
          </div>
          {favoritas.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16 }}>Você ainda não tem trilhas favoritas.</p>
              <Link href="/trilhas" style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '10px 20px', fontSize: 13, fontWeight: 500,
                textDecoration: 'none',
              }}>
                Explorar trilhas
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {favoritas.map(t => {
                const isSel = selecionadas.includes(t.id)
                const canSelect = isSel || selecionadas.length < 2
                return (
                  <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      borderRadius: 16,
                      outline: isSel ? '2.5px solid #FFE000' : '2.5px solid transparent',
                      transition: 'outline 0.15s',
                    }}>
                      <TrilhaCard trilha={t} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setSelecionadas(prev =>
                          prev.includes(t.id) ? prev.filter(id => id !== t.id) : prev.length < 2 ? [...prev, t.id] : prev
                        )}
                        disabled={!canSelect}
                        style={{
                          background: isSel ? '#1A1A1A' : '#F3F4F6',
                          color: isSel ? '#FFE000' : '#6B7280',
                          border: isSel ? '1.5px solid #1A1A1A' : '1.5px solid #E5E7EB',
                          borderRadius: 6, fontSize: 12, fontWeight: 600,
                          padding: '4px 12px', cursor: canSelect ? 'pointer' : 'not-allowed',
                          opacity: canSelect ? 1 : 0.5,
                          display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'all 0.15s',
                        }}
                      >
                        <i className={`ti ${isSel ? 'ti-check' : 'ti-plus'}`} style={{ fontSize: 12 }} />
                        {isSel ? 'Selecionada' : 'Comparar'}
                      </button>
                      {avaliacoesPorTrilha[t.id] && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 11, fontWeight: 500, color: '#92400E',
                          background: '#FFFBEB', borderRadius: 6,
                          padding: '3px 9px',
                        }}>
                          <i className="ti ti-star-filled" style={{ fontSize: 12, color: '#F59E0B' }} />
                          {avaliacoesPorTrilha[t.id].media}
                          <span style={{ color: '#888', fontWeight: 400 }}>
                            ({avaliacoesPorTrilha[t.id].count} avaliação{avaliacoesPorTrilha[t.id].count > 1 ? 'ões' : ''} recente{avaliacoesPorTrilha[t.id].count > 1 ? 's' : ''})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <hr style={{ border: 'none', borderTop: '0.5px solid #E5E7EB', margin: '0 0 36px' }} />

        {/* Seção: Trilhas Strava */}
        <section>
          <SectionHeader
            title="Minhas trilhas Strava"
            linkHref="/perfil"
            linkLabel="Gerenciar →"
            titleColor="#E34402"
          />
          {stravaTrails.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16 }}>
                Conecte seus segmentos do Strava para acompanhar as condições.
              </p>
              <a
                href="/api/strava/auth"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#FC4C02', color: '#fff',
                  borderRadius: 4, padding: '10px 20px',
                  fontSize: 13, fontWeight: 500, textDecoration: 'none',
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width={14} height={14}>
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                Conectar com Strava
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stravaTrails.map(t => (
                <StravaCardItem
                  key={t.id}
                  t={t}
                  avaliacao={avaliacoesPorSegmento[t.strava_segment_id]}
                />
              ))}
            </div>
          )}
        </section>

      </div>
      <PWAInstallPrompt />
    </div>
  )
}
