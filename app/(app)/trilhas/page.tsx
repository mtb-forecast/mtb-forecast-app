'use client'

import { Barlow_Condensed } from 'next/font/google'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, ESTADOS_BRASIL } from '@/lib/types'
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
  const [trilhas, setTrilhas] = useState<TrilhaComCondicao[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [estadoSelecionado, setEstadoSelecionado] = useState(estadoInicial)
  const [userId, setUserId] = useState<string | null>(null)
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())
  const [plano, setPlano] = useState<string | null>(null)
  const [limiteMsg, setLimiteMsg] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      const [{ data: favData }, { data: profile }] = await Promise.all([
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
        supabase.from('profiles').select('plano').eq('id', user.id).single(),
      ])
      if (favData) setFavoritos(new Set(favData.map((f: { trilha_id: string }) => f.trilha_id)))
      setPlano(profile?.plano ?? null)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!estadoSelecionado) { setTrilhas([]); return }
    setLoading(true)
    setSearch('')
    supabase
      .from('trilhas').select(`*, condicoes(*)`)
      .eq('aprovada', true).eq('regiao', estadoSelecionado)
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
  }, [estadoSelecionado])

  const handleEstadoChange = (estado: string) => {
    setEstadoSelecionado(estado)
    if (estado) {
      router.push(`/trilhas?estado=${estado}`, { scroll: false })
    } else {
      router.push('/trilhas', { scroll: false })
    }
  }

  async function toggleFavorito(trilhaId: string) {
    if (!userId) return
    if (favoritos.has(trilhaId)) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
      setFavoritos(prev => { const s = new Set(prev); s.delete(trilhaId); return s })
    } else {
      const isGratuito = !plano || plano === 'gratuito'
      if (isGratuito && favoritos.size >= 5) {
        setLimiteMsg(true)
        setTimeout(() => setLimiteMsg(false), 6000)
        return
      }
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos(prev => new Set([...prev, trilhaId]))
    }
  }

  if (!mounted) return null

  const filtered = search
    ? trilhas.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : trilhas

  const estadoLabel = estadoSelecionado === 'outros' ? 'Outros' : estadoSelecionado

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
        .trilhas-select { width: 280px; }
        @media (max-width: 640px) {
          .trilhas-dicas-grid { grid-template-columns: 1fr !important; }
          .trilhas-strava-banner { flex-direction: column !important; gap: 16px !important; }
          .trilhas-header-actions { flex-direction: column !important; width: 100% !important; }
          .trilhas-header-actions a { justify-content: center !important; }
          .trilhas-select { width: 100% !important; }
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
                ? `${filtered.length} trilha${filtered.length !== 1 ? 's' : ''} em ${estadoLabel}`
                : 'Selecione um estado para ver as trilhas'}
            </p>
          </div>

          <div className="trilhas-header-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href="/api/strava/auth"
              style={{
                background: '#FC4C02', color: '#FFFFFF',
                borderRadius: 8, padding: '10px 20px',
                fontSize: 13, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 8,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
              </svg>
              Conectar com Strava
            </a>
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
      <div style={{
        background: '#F8F9FA',
        borderBottom: '0.5px solid #E5E7EB',
        padding: '16px 28px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Select de estado com seta customizada */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <select
              value={estadoSelecionado}
              onChange={e => handleEstadoChange(e.target.value)}
              className="trilhas-select"
              style={{
                ...fieldBase,
                appearance: 'none',
                WebkitAppearance: 'none',
                padding: '10px 40px 10px 14px',
                color: estadoSelecionado ? '#111111' : '#9CA3AF',
                cursor: 'pointer',
                width: 280,
              }}
            >
              <option value="">Selecione o estado</option>
              {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
            <i
              className="ti ti-chevron-down"
              style={{
                position: 'absolute', right: 12, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 16, color: '#6B7280', pointerEvents: 'none',
              }}
            />
          </div>

          {/* Input de busca */}
          {estadoSelecionado && (
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <i
                className="ti ti-search"
                style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 16, color: '#9CA3AF', pointerEvents: 'none',
                }}
              />
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

        {/* Sem estado selecionado */}
        {!estadoSelecionado && (
          <>
            {/* Como usar — 4 cards */}
            <div
              className="trilhas-dicas-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}
            >
              {[
                { icon: 'ti-map-2',       color: '#FFE000',  title: 'Selecione seu estado',    text: 'Escolha o estado para ver todas as trilhas monitoradas com condições em tempo real.' },
                { icon: 'ti-star',        color: '#FFE000',  title: 'Favorite suas trilhas',   text: 'Salve suas trilhas favoritas para acessar rapidamente as condições no dashboard.' },
                { icon: 'ti-brand-strava',color: '#FC4C02',  title: 'Importe do Strava',       text: 'Conecte sua conta Strava e importe seus segmentos favoritos para monitoramento diário.' },
                { icon: 'ti-message-star',color: '#FFE000',  title: 'Avalie as trilhas',       text: 'Compartilhe como estava a trilha com outros riders — sua experiência ajuda a comunidade.' },
              ].map(({ icon, color, title, text }) => (
                <div
                  key={title}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 12,
                    border: '0.5px solid #E5E7EB',
                    padding: 20,
                  }}
                >
                  <i className={`ti ${icon}`} style={{ fontSize: 24, color, display: 'block', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#111111', margin: '0 0 6px' }}>{title}</p>
                  <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.55, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>

            {/* Banner Strava */}
            <div
              className="trilhas-strava-banner"
              style={{
                background: 'rgba(252,76,2,0.08)',
                border: '1px solid #FC4C02',
                borderRadius: 8, padding: '20px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <i className="ti ti-brand-strava" style={{ fontSize: 24, color: '#FC4C02', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 15, fontWeight: 500, color: '#111', margin: '0 0 4px' }}>Monitore suas trilhas do Strava</p>
                  <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>Importe segmentos favoritos e receba condições diárias</p>
                </div>
              </div>
              <a
                href="/perfil/strava"
                style={{
                  background: '#FC4C02', color: '#FFFFFF',
                  borderRadius: 8, padding: '8px 16px',
                  fontSize: 13, fontWeight: 500,
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Conectar com Strava
              </a>
            </div>
          </>
        )}

        {/* Loading */}
        {estadoSelecionado && loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{
              width: 32, height: 32,
              border: '2px solid #E5E7EB', borderTopColor: '#111',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        )}

        {/* Trilhas */}
        {estadoSelecionado && !loading && (
          filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: 15, color: '#6B7280', margin: '0 0 20px' }}>
                {search
                  ? `Nenhuma trilha encontrada para "${search}".`
                  : `Nenhuma trilha cadastrada em ${estadoLabel} ainda.`}
              </p>
              {!search && (
                <Link
                  href="/trilhas/cadastrar"
                  style={{
                    display: 'inline-block',
                    background: '#FFE000', color: '#111111',
                    borderRadius: 8, padding: '12px 24px',
                    fontSize: 14, fontWeight: 600,
                    textDecoration: 'none',
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
                  onToggleFavorito={() => toggleFavorito(t.id)}
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
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap',
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
