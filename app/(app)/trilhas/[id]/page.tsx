'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Trilha, Condicao, VEREDICTO_CONFIG } from '@/lib/types'
import CondicaoCard from '@/components/CondicaoCard'

type TrilhaDetalhada = Trilha & { condicoes?: Condicao[] }

export default function TrilhaDetalhe() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [trilha, setTrilha] = useState<Trilha | null>(null)
  const [condicaoAtual, setCondicaoAtual] = useState<Condicao | null>(null)
  const [historico, setHistorico] = useState<Condicao[]>([])
  const [loading, setLoading] = useState(true)
  const [isFavorito, setIsFavorito] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const [{ data: trilhaData }, { data: favData }] = await Promise.all([
        supabase.from('trilhas').select(`*, condicoes(*)`).eq('id', id).single(),
        supabase.from('favoritos').select('id').eq('user_id', user.id).eq('trilha_id', id).maybeSingle(),
      ])

      if (!trilhaData) { router.replace('/trilhas'); return }

      const t = trilhaData as TrilhaDetalhada
      setTrilha(t)
      const conds = (t.condicoes || []).sort(
        (a: Condicao, b: Condicao) => new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
      )
      setCondicaoAtual(conds[0] || null)
      setHistorico(conds.slice(1, 6))
      setIsFavorito(!!favData)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function toggleFavorito() {
    if (!userId) return
    if (isFavorito) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', id)
      setIsFavorito(false)
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: id })
      setIsFavorito(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!trilha) return null

  const vcfg = condicaoAtual ? VEREDICTO_CONFIG[condicaoAtual.veredicto] : null

  return (
    <div className="min-h-screen bg-slate-900 px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/trilhas" className="hover:text-white">Trilhas</Link>
        <span>/</span>
        <span className="text-white">{trilha.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">{trilha.name}</h1>
          <div className="flex flex-wrap gap-2">
            {trilha.bioma && (
              <span className="badge bg-slate-700 text-slate-300">{trilha.bioma}</span>
            )}
            <span className="badge bg-slate-700 text-slate-300">{trilha.trail_type}</span>
            <span className="badge bg-slate-700 text-slate-300">{trilha.regiao}</span>
          </div>
        </div>
        <button
          onClick={toggleFavorito}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors text-sm font-medium ${
            isFavorito
              ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10'
              : 'border-slate-600 text-slate-400 hover:border-yellow-500 hover:text-yellow-400'
          }`}
        >
          {isFavorito ? '★ Favoritada' : '☆ Favoritar'}
        </button>
      </div>

      {/* Veredicto atual */}
      {condicaoAtual && vcfg && (
        <div className={`border-2 rounded-xl p-6 mb-6 ${vcfg.border} ${vcfg.bg}`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`text-xl font-extrabold ${vcfg.color}`}>{condicaoAtual.veredicto}</span>
            <span className="text-slate-400 text-sm">
              {new Date(condicaoAtual.gerado_em).toLocaleString('pt-BR')}
            </span>
          </div>
          <p className="text-slate-300 mb-4">{condicaoAtual.frase_secagem}</p>
          <p className="text-slate-400 text-sm">Janela: {condicaoAtual.janela}</p>
        </div>
      )}

      {/* Condição detalhada */}
      {condicaoAtual && (
        <div className="mb-8">
          <CondicaoCard condicao={condicaoAtual} />
        </div>
      )}

      {/* Dados da trilha */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Dados da trilha</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Tipo de solo', value: trilha.solo_type },
            { label: 'Exposição', value: trilha.exposicao },
            { label: 'Altitude', value: `${trilha.altitude_m}m` },
            { label: 'Desnível', value: trilha.desnivel_m ? `${trilha.desnivel_m}m` : '—' },
            { label: 'Extensão', value: trilha.extensao_km ? `${trilha.extensao_km}km` : '—' },
            { label: 'Latitude', value: trilha.lat.toFixed(4) },
            { label: 'Longitude', value: trilha.lon.toFixed(4) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">{label}</p>
              <p className="text-white font-medium text-sm">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mapa placeholder */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-8">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Localização</h2>
        </div>
        <a
          href={`https://www.google.com/maps?q=${trilha.lat},${trilha.lon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 p-10 text-green-400 hover:text-green-300 transition-colors"
        >
          <span className="text-2xl">📍</span>
          <span>Abrir no Google Maps ({trilha.lat.toFixed(4)}, {trilha.lon.toFixed(4)})</span>
        </a>
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Histórico de condições</h2>
          <div className="space-y-3">
            {historico.map((c) => {
              const cfg = VEREDICTO_CONFIG[c.veredicto]
              return (
                <div
                  key={c.id}
                  className={`bg-slate-800 border rounded-lg p-4 flex items-center justify-between ${cfg?.border || 'border-slate-700'}`}
                >
                  <div>
                    <span className={`font-semibold text-sm ${cfg?.color || 'text-white'}`}>
                      {c.veredicto}
                    </span>
                    <p className="text-slate-400 text-xs mt-0.5">{c.frase_secagem}</p>
                  </div>
                  <span className="text-slate-500 text-xs">
                    {new Date(c.gerado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
