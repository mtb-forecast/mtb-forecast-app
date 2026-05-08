'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Trilha } from '@/lib/types'
import AdminPanel from '@/components/AdminPanel'

type Sugestao = {
  id: string
  strava_segment_id: number
  user_id: string
  solo_type: string
  exposicao: string
  trail_type: string
  bioma: string
  motivo: string
  status: string
  created_at: string
  segmento_nome?: string
  config_atual?: {
    solo_type: string
    exposicao: string
    trail_type: string
    bioma: string
  }
}

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendentes, setPendentes] = useState<Trilha[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [loading, setLoading] = useState(true)
  const [sugestaoMsg, setSugestaoMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) {
        router.replace('/dashboard')
        return
      }

      setIsAdmin(true)

      const [{ data: trilhasPendentes }, { data: sugestoesPendentes }] = await Promise.all([
        supabase.from('trilhas').select('*').eq('aprovada', false).order('created_at', { ascending: false }),
        supabase.from('strava_config_sugestoes').select('*').eq('status', 'pendente').order('created_at', { ascending: false }),
      ])

      setPendentes(trilhasPendentes || [])

      // Enrich sugestões with segment name and current config
      const enriched = await Promise.all(
        (sugestoesPendentes || []).map(async (s: Sugestao) => {
          const { data: config } = await supabase
            .from('strava_segmentos_config')
            .select('name, solo_type, exposicao, trail_type, bioma')
            .eq('strava_segment_id', s.strava_segment_id)
            .maybeSingle()
          return {
            ...s,
            segmento_nome: config?.name ?? `Segmento #${s.strava_segment_id}`,
            config_atual: config ? {
              solo_type: config.solo_type,
              exposicao: config.exposicao,
              trail_type: config.trail_type,
              bioma: config.bioma,
            } : undefined,
          }
        })
      )
      setSugestoes(enriched)
      setLoading(false)
    }
    load()
  }, [router])

  async function aprovar(id: string) {
    await supabase.from('trilhas').update({ aprovada: true }).eq('id', id)
    setPendentes((prev) => prev.filter((t) => t.id !== id))
  }

  async function rejeitar(id: string) {
    await supabase.from('trilhas').delete().eq('id', id)
    setPendentes((prev) => prev.filter((t) => t.id !== id))
  }

  async function aprovarSugestao(s: Sugestao) {
    await Promise.all([
      supabase.from('strava_segmentos_config').update({
        solo_type: s.solo_type,
        exposicao: s.exposicao,
        trail_type: s.trail_type,
        bioma: s.bioma,
      }).eq('strava_segment_id', s.strava_segment_id),
      supabase.from('strava_config_sugestoes').update({ status: 'aprovada' }).eq('id', s.id),
    ])
    setSugestoes(prev => prev.filter(x => x.id !== s.id))
    setSugestaoMsg('Sugestão aprovada e configuração atualizada.')
    setTimeout(() => setSugestaoMsg(null), 3000)
  }

  async function rejeitarSugestao(id: string) {
    await supabase.from('strava_config_sugestoes').update({ status: 'rejeitada' }).eq('id', id)
    setSugestoes(prev => prev.filter(x => x.id !== id))
    setSugestaoMsg('Sugestão rejeitada.')
    setTimeout(() => setSugestaoMsg(null), 3000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-slate-900 px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-white">Painel Admin</h1>
        <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30">
          Admin
        </span>
      </div>

      {/* Contador trilhas pendentes */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-500/20 rounded-lg p-3">
            <span className="text-2xl">⏳</span>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Trilhas pendentes</p>
            <p className="text-3xl font-bold text-white">{pendentes.length}</p>
          </div>
        </div>
      </div>

      <AdminPanel trilhas={pendentes} onAprovar={aprovar} onRejeitar={rejeitar} />

      {/* ── Sugestões de configuração Strava ─────────────────────────────────── */}
      <div className="mt-10">
        <h2 className="text-lg font-bold text-white mb-4">
          Sugestões de configuração Strava
          {sugestoes.length > 0 && (
            <span className="ml-2 text-sm font-normal bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {sugestoes.length} pendente{sugestoes.length > 1 ? 's' : ''}
            </span>
          )}
        </h2>

        {sugestaoMsg && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm text-green-300 bg-green-900/40 border border-green-700">
            {sugestaoMsg}
          </div>
        )}

        {sugestoes.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400 text-sm">
            Nenhuma sugestão pendente.
          </div>
        ) : (
          <div className="space-y-4">
            {sugestoes.map(s => (
              <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-white font-semibold">{s.segmento_nome}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      Segmento #{s.strava_segment_id} · {new Date(s.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full flex-shrink-0">
                    pendente
                  </span>
                </div>

                {/* Config atual vs sugerida */}
                {s.config_atual && (
                  <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                    <div className="bg-slate-700/50 rounded-lg p-3">
                      <p className="text-slate-400 font-medium mb-2 uppercase tracking-wider text-[10px]">Config atual</p>
                      <p className="text-slate-300">Solo: <span className="text-white">{s.config_atual.solo_type}</span></p>
                      <p className="text-slate-300">Exposição: <span className="text-white">{s.config_atual.exposicao}</span></p>
                      <p className="text-slate-300">Tipo: <span className="text-white">{s.config_atual.trail_type}</span></p>
                      <p className="text-slate-300">Bioma: <span className="text-white">{s.config_atual.bioma}</span></p>
                    </div>
                    <div className="bg-amber-900/30 border border-amber-700/40 rounded-lg p-3">
                      <p className="text-amber-400 font-medium mb-2 uppercase tracking-wider text-[10px]">Sugestão</p>
                      <p className="text-slate-300">Solo: <span className="text-amber-300">{s.solo_type}</span></p>
                      <p className="text-slate-300">Exposição: <span className="text-amber-300">{s.exposicao}</span></p>
                      <p className="text-slate-300">Tipo: <span className="text-amber-300">{s.trail_type}</span></p>
                      <p className="text-slate-300">Bioma: <span className="text-amber-300">{s.bioma}</span></p>
                    </div>
                  </div>
                )}

                {/* Motivo */}
                <div className="mb-4 bg-slate-700/40 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Motivo</p>
                  <p className="text-slate-200 text-sm">{s.motivo}</p>
                </div>

                {/* Ações */}
                <div className="flex gap-2">
                  <button
                    onClick={() => aprovarSugestao(s)}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => rejeitarSugestao(s.id)}
                    className="flex-1 bg-slate-700 hover:bg-red-900/60 text-slate-300 hover:text-red-300 text-sm font-semibold py-2 rounded-lg transition-colors border border-slate-600"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
