'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, Profile, VEREDICTO_CONFIG, ADERENCIA_CONFIG } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'

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

// ── helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 12 }}>
      {children}
    </p>
  )
}

function SectionHeader({ title, linkHref, linkLabel, linkColor }: {
  title: string
  linkHref?: string
  linkLabel?: string
  linkColor?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>{title}</h2>
      {linkHref && (
        <Link href={linkHref} style={{ fontSize: 13, color: linkColor ?? '#111', fontWeight: 500, borderBottom: `1px solid ${linkColor ?? '#111'}` }}>
          {linkLabel ?? 'Ver todas →'}
        </Link>
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
  const [ranking, setRanking] = useState<TrilhaComCondicao[]>([])
  const [stravaTrails, setStravaTrails] = useState<TrilhaPessoalComCondicao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email ?? null)

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(profileData)

      const { data: favIds } = await supabase
        .from('favoritos').select('trilha_id').eq('user_id', user.id)

      if (favIds && favIds.length > 0) {
        const ids = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const { data: trilhas } = await supabase
          .from('trilhas').select(`*, condicoes(*)`)
          .in('id', ids).eq('aprovada', true)
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
        if (trilhas) {
          setFavoritas(trilhas.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][] }) => {
            const arr = Array.isArray(t.condicoes) ? t.condicoes : []
            return { ...t, condicao: arr[0] ?? undefined }
          }))
        }
      }

      if (profileData?.regiao) {
        const { data: rankData } = await supabase
          .from('trilhas').select(`*, condicoes(*)`)
          .eq('regiao', profileData.regiao).eq('aprovada', true)
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
          .limit(6)
        if (rankData) {
          setRanking(rankData.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][] }) => {
            const arr = Array.isArray(t.condicoes) ? t.condicoes : []
            return { ...t, condicao: arr[0] ?? undefined }
          }))
        }
      }

      const { data: trilhasStrava } = await supabase
        .from('trilhas_pessoais').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const trilhasComCondicao = await Promise.all(
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
      )
      setStravaTrails(trilhasComCondicao)
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>
            {name ? `Olá, ${name}.` : 'Dashboard.'}
          </h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            Confira as condições de hoje nas suas trilhas
          </p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* Banner de perfil incompleto */}
      {!(profile?.nome && profile?.apelido && profile?.telefone && profile?.regiao) && (
        <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 32px' }}>
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
      <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>

        {/* Favoritas */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Minhas trilhas favoritas" linkHref="/trilhas" linkLabel="Ver todas →" />
          {favoritas.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>Você ainda não tem trilhas favoritas.</p>
              <Link href="/trilhas" style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '10px 20px', fontSize: 13, fontWeight: 500,
              }}>
                Explorar trilhas
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {favoritas.map(t => <TrilhaCard key={t.id} trilha={t} />)}
            </div>
          )}
        </section>

        {/* Trilhas Strava */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeader title="Minhas trilhas Strava" linkHref="/perfil" linkLabel="Gerenciar →" linkColor="#FC4C02" />
          {stravaTrails.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 32, textAlign: 'center' }}>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
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
              {stravaTrails.map(t => {
                const c = t.condicao
                const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
                const vcfg = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
                const acfg = c?.aderencia_status ? (ADERENCIA_CONFIG[c.aderencia_status] ?? null) : null
                return (
                  <div
                    key={t.id}
                    style={{
                      background: '#fff',
                      border: '0.5px solid #e5e5e5',
                      borderLeft: '3px solid #FC4C02',
                      borderRadius: 8,
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    <div style={{ padding: 16, flex: 1 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 500, color: '#111', lineHeight: 1.3, marginBottom: 8 }}>
                        {t.name}
                      </h3>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#FC4C02', background: 'rgba(252,76,2,0.08)', borderRadius: 2, padding: '2px 6px' }}>
                          Strava
                        </span>
                        <span style={{ fontSize: 11, color: '#888', background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 2, padding: '2px 6px' }}>
                          {t.regiao}
                        </span>
                      </div>
                      {c ? (
                        <>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                            {acfg && (
                              <span style={{ fontSize: 11, fontWeight: 500, borderRadius: 2, padding: '2px 6px', background: acfg.cor + '18', color: acfg.cor }}>
                                {acfg.emoji} {c.aderencia_status}
                              </span>
                            )}
                            {vcfg && (
                              <span style={{ fontSize: 11, fontWeight: 500, borderRadius: 2, padding: '2px 6px', background: vcfg.bg, color: vcfg.cor }}>
                                {vcfg.emoji} {veredictoText}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#888', flexWrap: 'wrap', marginBottom: 4 }}>
                            <span>🌧 <b>{c.acumulo_48h?.toFixed(1) ?? '—'}mm</b></span>
                            {c.pico_3h != null && c.pico_3h > 0 && (
                              <span style={{ color: '#ef4444' }}>⚡ <b>{c.pico_3h.toFixed(1)}mm</b></span>
                            )}
                            <span>💨 <b>{c.wind_ms?.toFixed(1) ?? '—'}m/s</b></span>
                          </div>
                          {c.frase_secagem && <p style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.frase_secagem}</p>}
                          {c.janela && <p style={{ fontSize: 12, color: '#888' }}>🕐 <span style={{ color: '#111', fontWeight: 500 }}>{c.janela}</span></p>}
                        </>
                      ) : (
                        <p style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>
                          Condições no próximo relatório (07:00 BRT)
                        </p>
                      )}
                    </div>
                    <div style={{ padding: '10px 16px', borderTop: '0.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-between' }}>
                      <Link href={`/trilhas/${t.id}`} style={{ fontSize: 13, color: '#111', fontWeight: 500, borderBottom: '1px solid #111' }}>
                        Ver detalhes →
                      </Link>
                      <a href={t.strava_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#FC4C02', fontWeight: 500 }}>
                        Strava ↗
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Ranking da região */}
        {profile?.regiao && (
          <section>
            <SectionHeader title={`Melhores em ${profile.regiao}`} />
            {ranking.length === 0 ? (
              <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 32, textAlign: 'center' }}>
                <p style={{ color: '#888', fontSize: 14 }}>Nenhuma trilha cadastrada para sua região ainda.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ranking.map(t => <TrilhaCard key={t.id} trilha={t} />)}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
