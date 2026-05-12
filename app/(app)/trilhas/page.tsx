'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'

const ESTADOS = ['SP', 'MG', 'RJ', 'PR', 'SC', 'RS', 'ES', 'BA', 'outros'] as const

const VEREDICTO_ORDER: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}

function rankTrilhas(trilhas: TrilhaComCondicao[]): TrilhaComCondicao[] {
  return [...trilhas].sort((a, b) => {
    const va = a.condicao?.veredicto_12h?.trim() || a.condicao?.veredicto?.trim() || ''
    const vb = b.condicao?.veredicto_12h?.trim() || b.condicao?.veredicto?.trim() || ''
    const oa = VEREDICTO_ORDER[va] ?? 3
    const ob = VEREDICTO_ORDER[vb] ?? 3
    if (oa !== ob) return oa - ob
    const sa = a.condicao?.aderencia_score ?? 999
    const sb = b.condicao?.aderencia_score ?? 999
    return sa - sb
  })
}

export default function TrilhasPage() {
  const router = useRouter()
  const [trilhas, setTrilhas] = useState<TrilhaComCondicao[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [regiaoFilter, setRegiaoFilter] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())

  // Auth + favoritos
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      const { data: favData } = await supabase.from('favoritos').select('trilha_id').eq('user_id', user.id)
      if (favData) setFavoritos(new Set(favData.map((f: { trilha_id: string }) => f.trilha_id)))
    }
    init()
  }, [router])

  // Busca trilhas quando estado muda
  useEffect(() => {
    if (!regiaoFilter) { setTrilhas([]); return }
    setLoading(true)
    setSearch('')
    supabase
      .from('trilhas').select(`*, condicoes(*)`)
      .eq('aprovada', true).eq('regiao', regiaoFilter)
      .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
      .then(({ data }) => {
        if (data) {
          const mapped = data.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][] }) => {
            const arr = Array.isArray(t.condicoes) ? t.condicoes : []
            return { ...t, condicao: arr[0] ?? undefined }
          })
          setTrilhas(rankTrilhas(mapped))
        }
        setLoading(false)
      })
  }, [regiaoFilter])

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

  const filtered = search
    ? trilhas.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : trilhas

  const estadoLabel = regiaoFilter === 'outros' ? 'Outros' : regiaoFilter

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Trilhas</h1>
            <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
              {regiaoFilter
                ? `${filtered.length} trilha${filtered.length !== 1 ? 's' : ''} em ${estadoLabel}`
                : 'Selecione um estado para ver as trilhas'}
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
          <select
            value={regiaoFilter}
            onChange={e => setRegiaoFilter(e.target.value)}
            className="input-field"
            style={{ width: 200 }}
          >
            <option value="">Selecione o estado</option>
            {ESTADOS.map(r => <option key={r} value={r}>{r === 'outros' ? 'Outros' : r}</option>)}
          </select>

          {regiaoFilter && (
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field"
              style={{ flex: 1 }}
            />
          )}
        </div>

        {/* Estado: sem filtro */}
        {!regiaoFilter && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🗺️</div>
            <h2 className="font-wheat" style={{ fontSize: 24, color: '#111', marginBottom: 12 }}>
              Selecione um estado
            </h2>
            <p style={{ fontSize: 14, color: '#888' }}>
              Escolha um estado para ver as trilhas e condições em tempo real
            </p>
          </div>
        )}

        {/* Carregando */}
        {regiaoFilter && loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Trilhas */}
        {regiaoFilter && !loading && (
          filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#888', fontSize: 14 }}>
              Nenhuma trilha encontrada{search ? ` para "${search}"` : ` em ${estadoLabel}`}.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(t => (
                <TrilhaCard
                  key={t.id}
                  trilha={t}
                  isFavorito={favoritos.has(t.id)}
                  onToggleFavorito={() => toggleFavorito(t.id)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
