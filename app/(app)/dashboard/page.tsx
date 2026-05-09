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

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #E0E0E0',
  borderRadius: 12,
}

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
        .from('trilhas_pessoais')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const trilhasComCondicao = await Promise.all(
        (trilhasStrava || []).map(async (t: TrilhaPessoalComCondicao) => {
          const { data: cond } = await supabase
            .from('condicoes_strava')
            .select(`
              aderencia_status, aderencia_score, veredicto, veredicto_12h,
              rain_mm, wind_ms, pico_3h, acumulo_48h, acumulo_ef,
              ultima_chuva_h, meia_vida_h, gust_max_kmh,
              janela, frase_secagem, solo_descansado, gerado_em
            `)
            .eq('strava_segment_id', t.strava_segment_id)
            .order('gerado_em', { ascending: false })
            .limit(1)
            .maybeSingle()
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F5F5' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#111111', borderTopColor: 'transparent' }} />
          <p style={{ color: '#555555' }}>Carregando condições...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#F5F5F5', minHeight: '100vh' }}>

      {/* ── Header preto ────────────────────────────────────────────────── */}
      <div style={{ background: '#111111' }} className="px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-wheat text-3xl text-white">
            {(() => {
              const name = profile?.nome?.split(' ')[0] || userEmail?.split('@')[0]
              return name ? `Olá, ${name} 👋` : 'Olá! 👋'
            })()}
          </h1>
          <p className="mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Confira as condições de hoje nas suas trilhas
          </p>
        </div>
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">

        {/* Favoritas */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#111111]">Minhas trilhas favoritas</h2>
            <Link href="/trilhas" className="text-sm font-medium" style={{ color: '#555555' }}>
              Ver todas →
            </Link>
          </div>

          {favoritas.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={cardStyle}>
              <p className="mb-4" style={{ color: '#555555' }}>Você ainda não tem trilhas favoritas.</p>
              <Link
                href="/trilhas"
                className="inline-block font-semibold px-6 py-2.5 rounded-lg transition-all text-sm"
                style={{ background: '#FFE000', color: '#111111' }}
              >
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
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#111111]">Minhas trilhas Strava</h2>
            <Link href="/perfil" className="text-sm font-medium" style={{ color: '#FC4C02' }}>
              Gerenciar →
            </Link>
          </div>

          {stravaTrails.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={cardStyle}>
              <p className="mb-4" style={{ color: '#555555' }}>
                Conecte seus segmentos favoritos do Strava para acompanhar as condições.
              </p>
              <a
                href="/api/strava/auth"
                className="inline-flex items-center gap-2 font-semibold text-white px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90 text-sm"
                style={{ background: '#FC4C02' }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                Conectar com Strava
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stravaTrails.map(t => (
                <div
                  key={t.id}
                  className="rounded-xl overflow-hidden flex flex-col"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #E0E0E0',
                    borderLeft: '3px solid #FC4C02',
                  }}
                >
                  <div className="p-4 flex-1">
                    <h3 className="font-bold text-[#111111] text-sm leading-tight line-clamp-2 mb-2">
                      {t.name}
                    </h3>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold"
                        style={{ color: '#FC4C02', background: 'rgba(252,76,2,0.10)', border: '1px solid rgba(252,76,2,0.25)' }}
                      >
                        🟠 Strava
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#F5F5F5', color: '#555555', border: '1px solid #E0E0E0' }}>
                        {t.regiao}
                      </span>
                    </div>

                    {t.condicao ? (() => {
                      const c = t.condicao!
                      const veredictoText = c.veredicto_12h?.trim() || c.veredicto?.trim() || null
                      const vcfg = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
                      const acfg = c.aderencia_status ? (ADERENCIA_CONFIG[c.aderencia_status] ?? null) : null
                      return (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            {acfg && (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold"
                                style={{ color: acfg.cor, background: acfg.cor + '18', border: `1px solid ${acfg.cor}33` }}
                              >
                                {acfg.emoji} {c.aderencia_status}
                              </span>
                            )}
                            {vcfg && (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold"
                                style={{ color: vcfg.cor, background: vcfg.bg, border: `1px solid ${vcfg.cor}33` }}
                              >
                                {vcfg.emoji} {veredictoText}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs mb-2 flex-wrap" style={{ color: '#555555' }}>
                            <span>🌧 <b>{c.acumulo_48h?.toFixed(1) ?? '—'}mm</b></span>
                            {c.pico_3h != null && c.pico_3h > 0 && (
                              <span className="text-red-500">⚡ <b>{c.pico_3h.toFixed(1)}mm</b> pico</span>
                            )}
                            <span>💨 <b>{c.wind_ms?.toFixed(1) ?? '—'}m/s</b></span>
                          </div>
                          {c.frase_secagem && (
                            <p className="text-xs truncate mb-2" style={{ color: '#555555' }}>{c.frase_secagem}</p>
                          )}
                          {c.janela && (
                            <p className="text-xs" style={{ color: '#555555' }}>
                              🕐 Janela: <span className="font-medium text-[#111111]">{c.janela}</span>
                            </p>
                          )}
                        </>
                      )
                    })() : (
                      <p className="text-xs italic" style={{ color: '#999999' }}>
                        Condições serão calculadas no próximo relatório diário (07:00 BRT)
                      </p>
                    )}
                  </div>

                  <div
                    className="px-4 py-2.5 flex items-center justify-between"
                    style={{ borderTop: '1px solid #E0E0E0' }}
                  >
                    <Link
                      href={`/trilhas/${t.id}`}
                      className="text-xs font-semibold hover:opacity-75 transition-opacity"
                      style={{ color: '#111111' }}
                    >
                      Ver detalhes →
                    </Link>
                    <a
                      href={t.strava_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold hover:opacity-75 transition-opacity"
                      style={{ color: '#FC4C02' }}
                    >
                      Ver no Strava ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ranking da região */}
        {profile?.regiao && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#111111]">
                Melhores trilhas em {profile.regiao}
              </h2>
            </div>

            {ranking.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={cardStyle}>
                <p style={{ color: '#555555' }}>Nenhuma trilha cadastrada para sua região ainda.</p>
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
