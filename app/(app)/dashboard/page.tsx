'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, Profile } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'

type TrilhaPessoalComCondicao = {
  id: string
  name: string
  regiao: string
  strava_url: string
  extensao_km?: number
  desnivel_m?: number
  condicao?: {
    veredicto?: string
    aderencia_status?: string
    frase_secagem?: string
    janela?: string
  }
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

      // Trilhas pessoais do Strava (com condicoes_pessoais se disponível)
      const { data: pessoais } = await supabase
        .from('trilhas_pessoais')
        .select(`id, name, regiao, strava_url, extensao_km, desnivel_m, condicoes_pessoais(*)`)
        .eq('user_id', user.id)
        .order('name')

      if (pessoais) {
        setStravaTrails(pessoais.map((t: TrilhaPessoalComCondicao & { condicoes_pessoais?: TrilhaPessoalComCondicao['condicao'][] }) => {
          const arr = Array.isArray(t.condicoes_pessoais) ? t.condicoes_pessoais : []
          return { ...t, condicao: arr[0] ?? undefined }
        }))
      }

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#64748b]">Carregando condições...</p>
        </div>
      </div>
    )
  }

  const emptyCardStyle = {
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(4px)',
    border: '1px dashed rgba(0,0,0,0.15)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
  }

  const filledCardStyle = {
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
  }

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-wheat text-3xl text-[#1e293b]">
          {(() => {
            const name = profile?.nome?.split(' ')[0] || userEmail?.split('@')[0]
            return name ? `Olá, ${name} 👋` : 'Olá! 👋'
          })()}
        </h1>
        <p className="text-[#64748b] mt-1">
          Confira as condições de hoje nas suas trilhas
        </p>
      </div>

      {/* Favoritas */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#1e293b]">Minhas trilhas favoritas</h2>
          <Link href="/trilhas" className="text-green-600 hover:text-green-500 text-sm">
            Ver todas →
          </Link>
        </div>

        {favoritas.length === 0 ? (
          <div className="rounded-xl p-10 text-center" style={emptyCardStyle}>
            <p className="text-[#64748b] mb-4">Você ainda não tem trilhas favoritas.</p>
            <Link
              href="/trilhas"
              className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors inline-block"
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
          <h2 className="text-lg font-semibold text-[#1e293b]">Minhas trilhas Strava</h2>
          <Link href="/perfil" className="text-sm" style={{ color: '#FC4C02' }}>
            Gerenciar →
          </Link>
        </div>

        {stravaTrails.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={emptyCardStyle}>
            <p className="text-[#64748b] mb-4">
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
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(4px)',
                  borderTop: '1px solid rgba(0,0,0,0.08)',
                  borderRight: '1px solid rgba(0,0,0,0.08)',
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                  borderLeft: '4px solid #FC4C02',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
                }}
              >
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-[#1e293b] text-sm leading-tight flex-1 line-clamp-2">
                      {t.name}
                    </h3>
                  </div>

                  {/* Badge Strava + região */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                      style={{ color: '#FC4C02', background: 'rgba(252,76,2,0.15)', border: '1px solid rgba(252,76,2,0.25)' }}
                    >
                      🟠 Strava
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                      {t.regiao}
                    </span>
                  </div>

                  {/* Condição ou fallback */}
                  {t.condicao ? (
                    <p className="text-xs text-[#64748b] truncate">{t.condicao.frase_secagem}</p>
                  ) : (
                    <p className="text-xs text-[#64748b] italic">
                      Condições serão calculadas no próximo relatório diário (07:00 BRT)
                    </p>
                  )}
                </div>

                <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <a
                    href={t.strava_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center text-xs font-semibold hover:opacity-75 transition-opacity"
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
            <h2 className="text-lg font-semibold text-[#1e293b]">
              Melhores trilhas em {profile.regiao}
            </h2>
          </div>

          {ranking.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={filledCardStyle}>
              <p className="text-[#64748b]">Nenhuma trilha cadastrada para sua região ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ranking.map(t => <TrilhaCard key={t.id} trilha={t} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
