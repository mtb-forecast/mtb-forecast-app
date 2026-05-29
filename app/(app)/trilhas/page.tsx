'use client'

import { Barlow_Condensed } from 'next/font/google'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'] })

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

function TrilhasContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const estadoInicial = searchParams.get('estado') || ''

  const [mounted, setMounted] = useState(false)
  const [trilhasAll, setTrilhasAll] = useState<TrilhaComCondicao[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [estadoSelecionado, setEstadoSelecionado] = useState(estadoInicial)
  const [cidadeSelecionada, setCidadeSelecionada] = useState('')
  const [localidadeSelecionada, setLocalidadeSelecionada] = useState('')

  const [estados, setEstados] = useState<string[]>([])
  const [cidades, setCidades] = useState<string[]>([])
  const [localidadesOpts, setLocalidadesOpts] = useState<string[]>([])

  const [userId, setUserId] = useState<string | null>(null)
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())
  const [plano, setPlano] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [limiteMsg, setLimiteMsg] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Carrega todas as trilhas + estados na montagem
  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/login'); return }
        setUserId(user.id)

        const [{ data: favData }, { data: profile }, { data: trilhasData }, { data: estadosData }] =
          await Promise.all([
            supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
            supabase.from('profiles').select('plano, is_admin').eq('id', user.id).single(),
            supabase
              .from('trilhas')
              .select('*, condicoes(*), previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med), localidades(cidade, estado, localidade)')
              .eq('aprovada', true)
              .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
              .order('bloco', { foreignTable: 'previsao_blocos' })
              .order('name'),
            supabase.from('localidades').select('estado').order('estado'),
          ])

        if (favData) setFavoritos(new Set(favData.map((f: { trilha_id: string }) => f.trilha_id)))
        setPlano(profile?.plano ?? null)
        setIsAdmin(!!profile?.is_admin)

        if (trilhasData) {
          const mapped = trilhasData.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][]; previsao_blocos?: import('@/lib/types').PrevisaoBloco[] }) => {
            const arr = Array.isArray(t.condicoes) ? t.condicoes : []
            const condicao = arr[0] ?? undefined
            const blocos = Array.isArray(t.previsao_blocos) ? [...t.previsao_blocos].sort((a, b) => a.bloco - b.bloco) : null
            if (condicao && blocos?.length) condicao.previsao_24h = blocos
            return { ...t, condicao }
          })
          setTrilhasAll(mapped)
        }

        if (estadosData) {
          const distinct = [...new Set(
            estadosData.map((r: { estado: string }) => r.estado).filter(Boolean)
          )] as string[]
          setEstados(distinct)
        }
      } catch (err) {
        console.error('Erro ao carregar trilhas:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [router])

  // Carrega cidades quando estado muda
  useEffect(() => {
    setCidadeSelecionada('')
    setLocalidadeSelecionada('')
    setLocalidadesOpts([])
    if (!estadoSelecionado) { setCidades([]); return }
    supabase
      .from('localidades')
      .select('cidade')
      .eq('estado', estadoSelecionado)
      .order('cidade')
      .then(({ data }) => {
        if (data) {
          const distinct = [...new Set(
            data.map((r: { cidade: string }) => r.cidade).filter(Boolean)
          )] as string[]
          setCidades(distinct)
        }
      })
  }, [estadoSelecionado])

  // Carrega localidades quando cidade muda
  useEffect(() => {
    setLocalidadeSelecionada('')
    if (!estadoSelecionado || !cidadeSelecionada) { setLocalidadesOpts([]); return }
    supabase
      .from('localidades')
      .select('localidade')
      .eq('estado', estadoSelecionado)
      .eq('cidade', cidadeSelecionada)
      .not('localidade', 'is', null)
      .order('localidade')
      .then(({ data }) => {
        if (data) {
          const distinct = [...new Set(
            data.map((r: { localidade: string | null }) => r.localidade).filter(Boolean)
          )] as string[]
          setLocalidadesOpts(distinct)
        }
      })
  }, [estadoSelecionado, cidadeSelecionada])

  function handleEstadoChange(estado: string) {
    setEstadoSelecionado(estado)
    setSearch('')
    router.push(estado ? `/trilhas?estado=${estado}` : '/trilhas', { scroll: false })
  }

  const toggleFavorito = useCallback(async (trilhaId: string) => {
    if (!userId) return
    if (favoritos.has(trilhaId)) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
      setFavoritos(prev => { const s = new Set(prev); s.delete(trilhaId); return s })
    } else {
      const isGratuito = !plano || plano === 'gratuito'
      if (isGratuito && !isAdmin && favoritos.size >= 5) {
        setLimiteMsg(true)
        setTimeout(() => setLimiteMsg(false), 6000)
        return
      }
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos(prev => new Set([...prev, trilhaId]))
    }
  }, [userId, favoritos, plano, isAdmin])

  if (!mounted) return null

  // Filtragem client-side
  const trilhasFiltradas = trilhasAll.filter(t => {
    if (!estadoSelecionado) return false
    const estadoTrilha = t.localidades?.estado || t.regiao || ''
    if (estadoTrilha !== estadoSelecionado) return false
    if (cidadeSelecionada && t.localidades?.cidade !== cidadeSelecionada) return false
    if (localidadeSelecionada && t.localidades?.localidade !== localidadeSelecionada) return false
    return true
  })

  const ranked = rankTrilhas(trilhasFiltradas)
  const filtered = search
    ? ranked.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : ranked

  const filtroLabel = [localidadeSelecionada, cidadeSelecionada, estadoSelecionado].filter(Boolean).join(', ')

  const fieldBase: React.CSSProperties = {
    boxSizing: 'border-box',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    background: '#FFFFFF',
    fontSize: 14,
    color: '#111111',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA' }}>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .trilhas-select:focus { border-color: #FFE000 !important; box-shadow: 0 0 0 2px rgba(255,224,0,0.2) !important; }
        .trilhas-input:focus  { border-color: #FFE000 !important; box-shadow: 0 0 0 2px rgba(255,224,0,0.2) !important; }
        @media (max-width: 640px) {
          .trilhas-dicas-grid { grid-template-columns: 1fr !important; }
.trilhas-header-actions { flex-direction: column !important; width: 100% !important; }
          .trilhas-header-actions a { justify-content: center !important; }
          .trilhas-filtros { flex-direction: column !important; }
          .trilhas-filtros select, .trilhas-filtros input { width: 100% !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#1A1A1A', padding: '36px 28px' }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              fontFamily: barlow.style.fontFamily,
              fontSize: 36, fontWeight: 800,
              textTransform: 'uppercase',
              color: '#FFFFFF', lineHeight: 1.1, margin: 0,
            }}>
              Trilhas
            </h1>
            <p style={{ color: '#9CA3AF', fontSize: 14, margin: '8px 0 0' }}>
              {estadoSelecionado
                ? `${filtered.length} trilha${filtered.length !== 1 ? 's' : ''} em ${filtroLabel}`
                : 'Selecione um estado para ver as trilhas'}
            </p>
          </div>

          <div className="trilhas-header-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href="/trilhas/cadastrar"
              style={{
                background: '#FFE000', color: '#111111',
                borderRadius: 8, padding: '10px 20px',
                fontSize: 13, fontWeight: 600,
                textDecoration: 'none', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center',
              }}
            >
              + Cadastrar trilha
            </Link>
          </div>
        </div>
      </div>

      {/* Faixa amarela */}
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#F8F9FA', borderBottom: '0.5px solid #E5E7EB', padding: '16px 28px' }}>
        <div
          className="trilhas-filtros"
          style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
        >

          {/* Select 1 — Estado */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <select
              value={estadoSelecionado}
              onChange={e => handleEstadoChange(e.target.value)}
              className="trilhas-select"
              style={{
                ...fieldBase,
                appearance: 'none', WebkitAppearance: 'none',
                padding: '10px 40px 10px 14px',
                color: estadoSelecionado ? '#111111' : '#9CA3AF',
                cursor: 'pointer', width: 200,
              }}
            >
              <option value="">Estado</option>
              {estados.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#6B7280', pointerEvents: 'none' }} />
          </div>

          {/* Select 2 — Cidade */}
          {estadoSelecionado && cidades.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={cidadeSelecionada}
                onChange={e => setCidadeSelecionada(e.target.value)}
                className="trilhas-select"
                style={{
                  ...fieldBase,
                  appearance: 'none', WebkitAppearance: 'none',
                  padding: '10px 40px 10px 14px',
                  color: cidadeSelecionada ? '#111111' : '#9CA3AF',
                  cursor: 'pointer', width: 220,
                }}
              >
                <option value="">Todas as cidades</option>
                {cidades.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#6B7280', pointerEvents: 'none' }} />
            </div>
          )}

          {/* Select 3 — Localidade */}
          {cidadeSelecionada && localidadesOpts.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={localidadeSelecionada}
                onChange={e => setLocalidadeSelecionada(e.target.value)}
                className="trilhas-select"
                style={{
                  ...fieldBase,
                  appearance: 'none', WebkitAppearance: 'none',
                  padding: '10px 40px 10px 14px',
                  color: localidadeSelecionada ? '#111111' : '#9CA3AF',
                  cursor: 'pointer', width: 220,
                }}
              >
                <option value="">Todas as localidades</option>
                {localidadesOpts.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#6B7280', pointerEvents: 'none' }} />
            </div>
          )}

          {/* Input de busca */}
          {estadoSelecionado && (
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#9CA3AF', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Buscar trilha..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="trilhas-input"
                style={{ ...fieldBase, width: '100%', padding: '10px 14px 10px 40px' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px' }}>

        {/* Onboarding — sem estado selecionado */}
        {!estadoSelecionado && (
          <>
            <div
              className="trilhas-dicas-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}
            >
              {[
                { icon: 'ti-map-2',        color: '#FFE000', title: 'Selecione seu estado',   text: 'Escolha o estado para ver todas as trilhas monitoradas com condições em tempo real.' },
                { icon: 'ti-star',         color: '#FFE000', title: 'Favorite suas trilhas',  text: 'Salve suas trilhas favoritas para acessar rapidamente as condições no dashboard.' },
                { icon: 'ti-message-star', color: '#FFE000', title: 'Avalie as trilhas',      text: 'Compartilhe como estava a trilha com outros riders — sua experiência ajuda a comunidade.' },
              ].map(({ icon, color, title, text }) => (
                <div
                  key={title}
                  style={{ background: '#FFFFFF', borderRadius: 12, border: '0.5px solid #E5E7EB', padding: 20 }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: 24, color, display: 'block', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#111111', margin: '0 0 6px' }}>{title}</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.55, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>

          </>
        )}

        {/* Loading inicial */}
        {loading && estadoSelecionado && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #E5E7EB', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {/* Lista de trilhas */}
        {!loading && estadoSelecionado && (
          filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: 15, color: '#6B7280', margin: '0 0 20px' }}>
                {search
                  ? `Nenhuma trilha encontrada para "${search}".`
                  : `Nenhuma trilha cadastrada em ${filtroLabel} ainda.`}
              </p>
              {!search && (
                <Link
                  href="/trilhas/cadastrar"
                  style={{
                    display: 'inline-block',
                    background: '#FFE000', color: '#111111',
                    borderRadius: 8, padding: '12px 24px',
                    fontSize: 14, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  Cadastrar a primeira trilha →
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(t => (
                <TrilhaCard
                  key={t.id}
                  trilha={t}
                  isFavorito={favoritos.has(t.id)}
                  onToggleFavorito={toggleFavorito}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* Toast limite de favoritos */}
      {limiteMsg && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A1A', color: '#FFFFFF',
          borderRadius: 12, padding: '12px 20px',
          fontSize: 13, zIndex: 1000, maxWidth: 440, textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', whiteSpace: 'nowrap',
        }}>
          Plano Gratuito permite até 5 trilhas favoritas.{' '}
          <a href="/planos" style={{ color: '#FFE000', fontWeight: 600, textDecoration: 'none' }}>Faça upgrade</a>{' '}
          para monitorar mais trilhas.
        </div>
      )}
    </div>
  )
}

export default function TrilhasPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F8F9FA' }} />}>
      <TrilhasContent />
    </Suspense>
  )
}
