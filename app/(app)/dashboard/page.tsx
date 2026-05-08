'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, Profile } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [favoritas, setFavoritas] = useState<TrilhaComCondicao[]>([])
  const [ranking, setRanking] = useState<TrilhaComCondicao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(profileData)

      const { data: favIds } = await supabase
        .from('favoritos')
        .select('trilha_id')
        .eq('user_id', user.id)

      if (favIds && favIds.length > 0) {
        const ids = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const { data: trilhas } = await supabase
          .from('trilhas')
          .select(`*, condicoes(*)`)
          .in('id', ids)
          .eq('aprovada', true)
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false })

        if (trilhas) {
          setFavoritas(
            trilhas.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][] }) => {
              const condicoesArr = Array.isArray(t.condicoes) ? t.condicoes : []
              return { ...t, condicao: condicoesArr[0] ?? undefined }
            })
          )
        }
      }

      if (profileData?.regiao) {
        const { data: rankData } = await supabase
          .from('trilhas')
          .select(`*, condicoes(*)`)
          .eq('regiao', profileData.regiao)
          .eq('aprovada', true)
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
          .limit(6)

        if (rankData) {
          setRanking(
            rankData.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][] }) => {
              const condicoesArr = Array.isArray(t.condicoes) ? t.condicoes : []
              return { ...t, condicao: condicoesArr[0] ?? undefined }
            })
          )
        }
      }

      setLoading(false)
    }

    load()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Carregando condições...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Olá, {profile?.nome?.split(' ')[0] || 'Rider'} 👋
        </h1>
        <p className="text-slate-400 mt-1">
          Confira as condições de hoje nas suas trilhas
        </p>
      </div>

      {/* Favoritas */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Minhas trilhas favoritas</h2>
          <Link href="/trilhas" className="text-green-400 hover:text-green-300 text-sm">
            Ver todas →
          </Link>
        </div>

        {favoritas.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 border-dashed rounded-xl p-10 text-center">
            <p className="text-slate-400 mb-4">Você ainda não tem trilhas favoritas.</p>
            <Link
              href="/trilhas"
              className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors inline-block"
            >
              Explorar trilhas
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {favoritas.map((t) => (
              <TrilhaCard key={t.id} trilha={t} />
            ))}
          </div>
        )}
      </section>

      {/* Ranking da região */}
      {profile?.regiao && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Melhores trilhas em {profile.regiao}
            </h2>
          </div>

          {ranking.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
              <p className="text-slate-400">Nenhuma trilha cadastrada para sua região ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ranking.map((t) => (
                <TrilhaCard key={t.id} trilha={t} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
