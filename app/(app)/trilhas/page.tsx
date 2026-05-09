'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, REGIOES } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'

export default function TrilhasPage() {
  const router = useRouter()
  const [trilhas, setTrilhas] = useState<TrilhaComCondicao[]>([])
  const [filteredTrilhas, setFilteredTrilhas] = useState<TrilhaComCondicao[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [regiaoFilter, setRegiaoFilter] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      const [{ data: trilhasData }, { data: favData }] = await Promise.all([
        supabase
          .from('trilhas')
          .select(`*, condicoes(*)`)
          .eq('aprovada', true)
          .order('name')
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false }),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
      ])

      if (trilhasData) {
        const mapped = trilhasData.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][] }) => {
          const condicoesArr = Array.isArray(t.condicoes) ? t.condicoes : []
          const latestCondicao = condicoesArr[0] ?? undefined
          return { ...t, condicao: latestCondicao }
        })
        setTrilhas(mapped)
        setFilteredTrilhas(mapped)
      }

      if (favData) {
        setFavoritos(new Set(favData.map((f: { trilha_id: string }) => f.trilha_id)))
      }

      setLoading(false)
    }
    load()
  }, [router])

  useEffect(() => {
    let result = trilhas
    if (search) {
      result = result.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
      )
    }
    if (regiaoFilter) {
      result = result.filter((t) => t.regiao === regiaoFilter)
    }
    setFilteredTrilhas(result)
  }, [search, regiaoFilter, trilhas])

  async function toggleFavorito(trilhaId: string) {
    if (!userId) return
    if (favoritos.has(trilhaId)) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
      setFavoritos((prev) => { const s = new Set(prev); s.delete(trilhaId); return s })
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos((prev) => new Set([...prev, trilhaId]))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F5F5' }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#111111', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div style={{ background: '#F5F5F5', minHeight: '100vh' }}>

      {/* ── Header preto ─────────────────────────────────────────────────── */}
      <div style={{ background: '#111111' }} className="px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-wheat text-3xl text-white">Trilhas</h1>
            <p className="mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {filteredTrilhas.length} trilhas encontradas
            </p>
          </div>
          <Link
            href="/trilhas/nova"
            className="font-semibold px-5 py-2.5 rounded-lg text-sm whitespace-nowrap transition-all"
            style={{ background: '#FFE000', color: '#111111' }}
          >
            + Cadastrar trilha
          </Link>
        </div>
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field flex-1"
          />
          <select
            value={regiaoFilter}
            onChange={(e) => setRegiaoFilter(e.target.value)}
            className="input-field sm:w-40"
          >
            <option value="">Todos estados</option>
            {REGIOES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {filteredTrilhas.length === 0 ? (
          <div className="text-center py-20" style={{ color: '#555555' }}>
            Nenhuma trilha encontrada com esses filtros.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredTrilhas.map((t) => (
              <TrilhaCard
                key={t.id}
                trilha={t}
                isFavorito={favoritos.has(t.id)}
                onToggleFavorito={() => toggleFavorito(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
