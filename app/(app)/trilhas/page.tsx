'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import { TrilhaComCondicao, PumpTrack } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'
import PumpTrackCard from '@/components/PumpTrackCard'
import { IconChevronDown, IconSearch, IconRoute, IconShieldCheck } from '@tabler/icons-react'


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
  const [pumptracksAll, setPumptracksAll] = useState<PumpTrack[]>([])
  const [pumptracksCount, setPumptracksCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingTrilhas, setLoadingTrilhas] = useState(false)
  const [search, setSearch] = useState('')

  const [estadoSelecionado, setEstadoSelecionado] = useState(estadoInicial)
  const [cidadeSelecionada, setCidadeSelecionada] = useState('')
  const [localidadeSelecionada, setLocalidadeSelecionada] = useState('')

  const [estados, setEstados] = useState<string[]>([])
  const [mantenedoresList, setMantenedoresList] = useState<{ id: string; nome: string; nome_primario: string | null; nome_secundario: string | null }[]>([])

  const [userId, setUserId] = useState<string | null>(null)
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())
  useEffect(() => { setMounted(true) }, [])

  // Init leve: auth + estados + count de pumptracks + mantenedores
  useEffect(() => {
    async function init() {
      try {
        const user = await getClientUser()
        if (!user) { window.location.href = '/login'; return }
        setUserId(user.id)

        const [{ data: favData }, { data: estadosData }, { data: ptCountData }, { data: mantData }] =
          await Promise.all([
            supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
            supabase.from('localidades').select('estado').order('estado'),
            supabase.from('trilhas_pumptrack').select('id, uf'),
            supabase.from('mantenedores').select('id, nome, nome_primario, nome_secundario').eq('ativo', true).order('nome'),
          ])

        if (favData) setFavoritos(new Set(favData.map((f: { trilha_id: string }) => f.trilha_id)))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ptRows = (ptCountData as any[] | null) ?? []
        setPumptracksCount(ptRows.length)

        const trailStates = (estadosData || []).map((r: { estado: string }) => r.estado).filter(Boolean)
        const ptStates = ptRows.map((pt: { uf: string }) => pt.uf).filter(Boolean)
        setEstados([...new Set([...trailStates, ...ptStates])].sort() as string[])

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (mantData) setMantenedoresList(mantData as any[])
      } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Fetch pesado: trilhas + pumptracks do estado selecionado
  useEffect(() => {
    if (!estadoSelecionado || !userId) {
      setTrilhasAll([])
      setPumptracksAll([])
      return
    }
    let cancelled = false
    setLoadingTrilhas(true)

    async function fetchTrilhas() {
      try {
        const [{ data: trilhasData }, { data: ptData }] = await Promise.all([
          supabase
            .from('trilhas')
            .select(`
              id, name, bioma, trail_type, regiao,
              localidades(cidade, estado, localidade),
              mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url),
              condicoes(
                veredicto, veredicto_12h,
                aderencia_status, aderencia_futura_status, aderencia_futura_label,
                pico_3h, wind_ms, chuva_solo_48h, ultima_chuva_h,
                texto_dinamico, frase_secagem, gerado_em
              )
            `)
            .eq('aprovada', true)
            .eq('regiao', estadoSelecionado)
            .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
            .order('name'),
          supabase
            .from('trilhas_pumptrack')
            .select(`
              id, nome, cidade, uf, endereco, latitude, longitude,
              tipo_superficie, comprimento_estimado, iluminacao, estacionamento,
              fonte, google_maps_url, instagram, status_validacao,
              condicoes_pumptrack(gerado_em, rain_mm, pico_3h, wind_kmh, temp_max, temp_min, pop_12h)
            `)
            .eq('uf', estadoSelecionado)
            .order('nome'),
        ])

        if (cancelled) return

        if (trilhasData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped = (trilhasData as any[]).map((t) => {
            const arr = Array.isArray(t.condicoes) ? t.condicoes : []
            return { ...t, condicao: arr[0] ?? undefined } as TrilhaComCondicao
          })
          setTrilhasAll(mapped)
        }

        if (ptData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped = (ptData as any[]).map((pt) => {
            const arr = Array.isArray(pt.condicoes_pumptrack) ? pt.condicoes_pumptrack : []
            return { ...pt, condicao: arr[0] ?? undefined } as PumpTrack
          })
          setPumptracksAll(mapped)
        }
      } catch (err) {
        if (!cancelled) console.error('Erro ao carregar trilhas:', err)
      } finally {
        if (!cancelled) setLoadingTrilhas(false)
      }
    }
    fetchTrilhas()
    return () => { cancelled = true }
  }, [estadoSelecionado, userId])

  // Reseta seleções em cascata quando filtros pai mudam
  useEffect(() => {
    setCidadeSelecionada('')
    setLocalidadeSelecionada('')
  }, [estadoSelecionado])

  useEffect(() => {
    setLocalidadeSelecionada('')
  }, [cidadeSelecionada])

  // Cidades disponíveis — derivadas das trilhas já carregadas (evita mostrar cidades sem trilhas)
  const cidades = useMemo(() => {
    if (!estadoSelecionado) return []
    const set = new Set<string>()
    for (const t of trilhasAll) {
      const estado = t.localidades?.estado || t.regiao
      if (estado === estadoSelecionado && t.localidades?.cidade) set.add(t.localidades.cidade)
    }
    for (const pt of pumptracksAll) {
      if (pt.uf === estadoSelecionado && pt.cidade) set.add(pt.cidade)
    }
    return [...set].sort()
  }, [trilhasAll, pumptracksAll, estadoSelecionado])

  // Localidades disponíveis — derivadas das trilhas da cidade selecionada
  const localidadesOpts = useMemo(() => {
    if (!estadoSelecionado || !cidadeSelecionada) return []
    const set = new Set<string>()
    for (const t of trilhasAll) {
      const estado = t.localidades?.estado || t.regiao
      if (estado === estadoSelecionado && t.localidades?.cidade === cidadeSelecionada && t.localidades?.localidade) {
        set.add(t.localidades.localidade)
      }
    }
    return [...set].sort()
  }, [trilhasAll, estadoSelecionado, cidadeSelecionada])

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
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos(prev => new Set([...prev, trilhaId]))
    }
  }, [userId, favoritos])

  // Filtragem client-side — estado já filtrado no banco; apenas cidade/localidade aqui
  const trilhasFiltradas = useMemo(() => {
    if (!estadoSelecionado) return []
    return trilhasAll.filter(t => {
      if (cidadeSelecionada && t.localidades?.cidade !== cidadeSelecionada) return false
      if (localidadeSelecionada && t.localidades?.localidade !== localidadeSelecionada) return false
      return true
    })
  }, [trilhasAll, estadoSelecionado, cidadeSelecionada, localidadeSelecionada])

  const ranked = useMemo(() => rankTrilhas(trilhasFiltradas), [trilhasFiltradas])

  const filtered = useMemo(() =>
    search
      ? ranked.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
      : ranked
  , [ranked, search])

  const filtroLabel = useMemo(
    () => [localidadeSelecionada, cidadeSelecionada, estadoSelecionado].filter(Boolean).join(', '),
    [localidadeSelecionada, cidadeSelecionada, estadoSelecionado]
  )

  const pumptracks = useMemo(() => {
    if (!estadoSelecionado) return []
    return pumptracksAll.filter(pt => {
      if (pt.uf !== estadoSelecionado) return false
      if (cidadeSelecionada && pt.cidade !== cidadeSelecionada) return false
      if (search && !pt.nome.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [pumptracksAll, estadoSelecionado, cidadeSelecionada, search])

  if (!mounted) return null

  const fieldBase: React.CSSProperties = {
    boxSizing: 'border-box',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    background: '#FFFFFF',
    fontSize: 14,
    color: '#2a2e25',
    outline: 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .trilhas-select:focus { border-color: #6d745f !important; box-shadow: 0 0 0 2px rgba(109,116,95,0.2) !important; }
        .trilhas-input:focus  { border-color: #6d745f !important; box-shadow: 0 0 0 2px rgba(109,116,95,0.2) !important; }
        @media (max-width: 640px) {
          .trilhas-dicas-grid { grid-template-columns: 1fr !important; }
.trilhas-header-actions { flex-direction: column !important; width: 100% !important; }
          .trilhas-header-actions a { justify-content: center !important; }
          .trilhas-filtros { flex-direction: column !important; }
          .trilhas-filtros select, .trilhas-filtros input { width: 100% !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="hero-dark" style={{ background: '#2a2e25', padding: '36px 28px' }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-barlow-condensed), sans-serif',
              fontSize: 36, fontWeight: 800,
              textTransform: 'uppercase',
              color: '#FFFFFF', lineHeight: 1.1, margin: 0,
            }}>
              Trilhas
            </h1>
            <p style={{ color: '#9CA3AF', fontSize: 14, margin: '8px 0 0' }}>
              {estadoSelecionado
                ? `${filtered.length} trilha${filtered.length !== 1 ? 's' : ''}${pumptracks.length > 0 ? ` · ${pumptracks.length} pump track${pumptracks.length !== 1 ? 's' : ''}` : ''} em ${filtroLabel}`
                : 'Selecione um estado para ver as trilhas'}
            </p>
          </div>

          <div className="trilhas-header-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href="/trilhas/cadastrar"
              style={{
                background: '#6d745f', color: '#fff',
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

      {/* Faixa de acento */}
      <div style={{ background: '#a8b899', height: 3 }} />

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="trilhas-filter-bar" style={{ background: '#f4f5f0', borderBottom: '0.5px solid #E5E7EB', padding: '16px 28px' }}>
        <div
          className="trilhas-filtros"
          style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
        >

          {/* Select — Mantenedor / Bike Park */}
          {mantenedoresList.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value=""
                onChange={e => { if (e.target.value) router.push(`/mantenedores/${e.target.value}`) }}
                className="trilhas-select"
                style={{
                  ...fieldBase,
                  appearance: 'none', WebkitAppearance: 'none',
                  padding: '10px 40px 10px 14px',
                  color: '#9CA3AF',
                  cursor: 'pointer', width: 220,
                }}
              >
                <option value="">Mantenedores / Bike Park</option>
                {mantenedoresList.map(m => {
                  const label = [m.nome_primario || m.nome, m.nome_secundario].filter(Boolean).join(' ')
                  return <option key={m.id} value={m.id}>{label}</option>
                })}
              </select>
              <IconChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', pointerEvents: 'none' }} />
            </div>
          )}

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
                color: estadoSelecionado ? '#2a2e25' : '#9CA3AF',
                cursor: 'pointer', width: 200,
              }}
            >
              <option value="">Estado</option>
              {estados.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <IconChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', pointerEvents: 'none' }} />
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
                  color: cidadeSelecionada ? '#2a2e25' : '#9CA3AF',
                  cursor: 'pointer', width: 220,
                }}
              >
                <option value="">Todas as cidades</option>
                {cidades.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <IconChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', pointerEvents: 'none' }} />
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
                  color: localidadeSelecionada ? '#2a2e25' : '#9CA3AF',
                  cursor: 'pointer', width: 220,
                }}
              >
                <option value="">Todas as localidades</option>
                {localidadesOpts.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <IconChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', pointerEvents: 'none' }} />
            </div>
          )}

          {/* Input de busca */}
          {estadoSelecionado && (
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <IconSearch size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Buscar trilha ou pump track..."
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
      <div className="trilhas-content" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px' }}>

        {/* Onboarding — sem estado selecionado */}
        {!estadoSelecionado && (
          <>
            <div
              className="trilhas-dicas-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}
            >
              {[
                { icon: 'ti-map-2',        color: '#a8b899', title: 'Selecione seu estado',   text: 'Escolha o estado para ver todas as trilhas monitoradas com condições em tempo real.' },
                { icon: 'ti-star',         color: '#a8b899', title: 'Favorite suas trilhas',  text: 'Salve suas trilhas favoritas para acessar rapidamente as condições no dashboard.' },
                { icon: 'ti-message-star', color: '#a8b899', title: 'Avalie as trilhas',      text: 'Compartilhe como estava a trilha com outros riders — sua experiência ajuda a comunidade.' },
              ].map(({ icon, color, title, text }) => (
                <div
                  key={title}
                  style={{ background: '#FFFFFF', borderRadius: 12, border: '0.5px solid #E5E7EB', padding: 20 }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: 24, color, display: 'block', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#2a2e25', margin: '0 0 6px' }}>{title}</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.55, margin: 0 }}>{text}</p>
                </div>
              ))}

              {/* Card Pump Track — destaque roxo */}
              <div style={{
                background: '#FFFFFF', borderRadius: 12,
                border: '0.5px solid #DDD6FE', padding: 20,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: 'linear-gradient(90deg, #7C3AED, #A78BFA)',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <IconRoute size={24} style={{ color: '#7C3AED' }} />
                  <span style={{
                    background: '#EDE9FE', color: '#7C3AED',
                    fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>Novo</span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#2a2e25', margin: '0 0 6px' }}>
                  Pump Tracks no mapa
                </p>
                <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.55, margin: '0 0 12px' }}>
                  {pumptracksCount} pump tracks cadastrados com previsão do tempo e navegação via Waze. Selecione seu estado para ver os locais próximos.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['Asfalto', 'Terra', 'Homologado', 'Waze'].map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, color: '#7C3AED', background: '#EDE9FE',
                      borderRadius: 999, padding: '2px 8px',
                    }}>{tag}</span>
                  ))}
                </div>
              </div>

              {/* Card Mantenedores / Bike Park — destaque verde, full width */}
              {mantenedoresList.length > 0 && (
                <div style={{
                  gridColumn: '1 / -1',
                  background: '#FFFFFF', borderRadius: 12,
                  border: '0.5px solid #c8d4be', padding: 20,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: 'linear-gradient(90deg, #4a6741, #a8b899)',
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <IconShieldCheck size={22} style={{ color: '#6d745f' }} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#2a2e25', margin: 0 }}>
                      Mantenedores & Bike Parks
                    </p>
                    <span style={{
                      background: '#dcfce7', color: '#15803d',
                      fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                      {mantenedoresList.length} ativo{mantenedoresList.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.55, margin: '0 0 12px' }}>
                    Trilhas monitoradas e mantidas por marcas e parques parceiros. Clique para ver todas as trilhas de cada mantenedor.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {mantenedoresList.map(m => (
                      <Link
                        key={m.id}
                        href={`/mantenedores/${m.id}`}
                        style={{
                          fontSize: 12, fontWeight: 600,
                          color: '#4a6741', background: '#f0f3ec',
                          border: '0.5px solid #c8d4be', borderRadius: 999,
                          padding: '4px 12px', textDecoration: 'none',
                        }}
                      >
                        {[m.nome_primario || m.nome, m.nome_secundario].filter(Boolean).join(' ')} →
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </>
        )}

        {/* Loading trilhas */}
        {loadingTrilhas && estadoSelecionado && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #E5E7EB', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {/* Lista de trilhas */}
        {!loadingTrilhas && estadoSelecionado && (
          <>
            {/* Trilhas MTB — ou estado vazio se não houver nenhuma NEM pump track */}
            {filtered.length === 0 && pumptracks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <p style={{ fontSize: 15, color: '#6B7280', margin: '0 0 20px' }}>
                  {search
                    ? `Nenhum resultado para "${search}".`
                    : `Nenhuma trilha cadastrada em ${filtroLabel} ainda.`}
                </p>
                {!search && (
                  <Link
                    href="/trilhas/cadastrar"
                    style={{
                      display: 'inline-block',
                      background: '#6d745f', color: '#fff',
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
            )}

            {/* ── Seção Pump Tracks — sempre renderizada quando há resultados ── */}
            {pumptracks.length > 0 && (
              <div style={{ marginTop: filtered.length > 0 ? 40 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      background: '#EDE9FE', color: '#7C3AED',
                      borderRadius: 999, padding: '3px 12px',
                      fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}>
                      Pump Tracks
                    </span>
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {pumptracks.length} local{pumptracks.length !== 1 ? 'is' : ''}
                    </span>
                  </div>
                  <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pumptracks.map(pt => (
                    <PumpTrackCard key={pt.id} pt={pt} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function TrilhasPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f4f5f0' }} />}>
      <TrilhasContent />
    </Suspense>
  )
}
