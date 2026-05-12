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
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const [{ data: trilhasData }, { data: favData }] = await Promise.all([
        supabase.from('trilhas').select(`*, condicoes(*)`).eq('aprovada', true)
          .order('name')
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false }),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
      ])

      if (trilhasData) {
        const mapped = trilhasData.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][] }) => {
          const arr = Array.isArray(t.condicoes) ? t.condicoes : []
          return { ...t, condicao: arr[0] ?? undefined }
        })
        setTrilhas(mapped)
        setFilteredTrilhas(mapped)
      }

      if (favData) setFavoritos(new Set(favData.map((f: { trilha_id: string }) => f.trilha_id)))
      setLoading(false)
    }
    load()
  }, [router])

  useEffect(() => {
    let result = trilhas
    if (search) result = result.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    if (regiaoFilter) result = result.filter(t => t.regiao === regiaoFilter)
    setFilteredTrilhas(result)
  }, [search, regiaoFilter, trilhas])

  async function toggleFavorito(trilhaId: string) {
    if (!userId) return
    if (favoritos.has(trilhaId)) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
      setFavoritos(prev => { const s = new Set(prev); s.delete(trilhaId); return s })
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos(prev => new Set([...prev, trilhaId]))
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Trilhas</h1>
            <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
              {filteredTrilhas.length} trilha{filteredTrilhas.length !== 1 ? 's' : ''} encontrada{filteredTrilhas.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row" style={{ gap: 10, alignItems: 'center' }}>
            <a
              href="/api/strava/auth"
              style={{
                background: '#FC4C02', color: '#fff',
                border: 'none', borderRadius: 4,
                padding: '10px 20px', fontSize: 13, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 8,
                textDecoration: 'none', whiteSpace: 'nowrap', width: '100%', justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
              </svg>
              Conectar com Strava
            </a>
            <Link
              href="/trilhas/cadastrar"
              style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '10px 20px', fontSize: 13, fontWeight: 500,
                whiteSpace: 'nowrap', width: '100%', textAlign: 'center',
              }}
            >
              + Cadastrar trilha
            </Link>
          </div>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3" style={{ marginBottom: 24 }}>
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field"
            style={{ flex: 1 }}
          />
          <select
            value={regiaoFilter}
            onChange={e => setRegiaoFilter(e.target.value)}
            className="input-field"
            style={{ width: 160 }}
          >
            <option value="">Todos estados</option>
            {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {filteredTrilhas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#888', fontSize: 14 }}>
            Nenhuma trilha encontrada com esses filtros.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredTrilhas.map(t => (
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
