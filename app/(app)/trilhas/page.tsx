'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, ESTADOS_BRASIL } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'

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

  useEffect(() => {
    setMounted(true)
  }, [])

  // Auth + favoritos
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

  // Busca trilhas quando estado muda
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

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Trilhas</h1>
            <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
              {estadoSelecionado
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
            value={estadoSelecionado}
            onChange={e => handleEstadoChange(e.target.value)}
            className="input-field"
            style={{ width: 200 }}
          >
            <option value="">Selecione o estado</option>
            {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>

          {estadoSelecionado && (
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

        {/* Estado: sem filtro — seção de dicas */}
        {!estadoSelecionado && (
          <div>
            {/* Grid de imagens */}
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}
              className="trilhas-img-grid"
            >
              {[
                { src: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80', dica: 'Verifique sempre as condições antes de sair' },
                { src: 'https://images.unsplash.com/photo-1571333250630-f0230c320b6d?w=600&q=80', dica: 'Solo molhado = trilha fechada. Respeite o verde.' },
                { src: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&q=80', dica: 'Favorite trilhas para acompanhar diariamente' },
              ].map(({ src, dica }, i) => (
                <div
                  key={i}
                  style={{ position: 'relative', height: 200, borderRadius: 8, overflow: 'hidden', border: '0.5px solid #e5e5e5' }}
                  className="trilha-img-wrap"
                >
                  <img src={src} alt="Trilha MTB" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div className="trilha-img-overlay" style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 16, opacity: 0, transition: 'opacity 0.2s',
                  }}>
                    <p style={{ color: '#fff', fontSize: 13, fontWeight: 500, textAlign: 'center', lineHeight: 1.5 }}>{dica}</p>
                  </div>
                </div>
              ))}
            </div>

            <style>{`
              @media (max-width: 768px) {
                .trilhas-img-grid { grid-template-columns: 1fr !important; }
                .trilhas-dicas-grid { grid-template-columns: 1fr !important; }
                .trilhas-strava-banner { flex-direction: column !important; gap: 16px !important; }
              }
              .trilha-img-wrap:hover .trilha-img-overlay { opacity: 1 !important; }
            `}</style>

            {/* Como usar — 4 cards */}
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}
              className="trilhas-dicas-grid"
            >
              {[
                { icon: <i className="ti ti-map-2" style={{ fontSize: 32, color: '#111' }} />, title: 'Selecione seu estado', text: 'Escolha o estado para ver todas as trilhas monitoradas com condições em tempo real.' },
                { icon: <i className="ti ti-star" style={{ fontSize: 32, color: '#111' }} />, title: 'Favorite suas trilhas', text: 'Salve suas trilhas favoritas para acessar rapidamente as condições no dashboard.' },
                { icon: <i className="ti ti-brand-strava" style={{ fontSize: 32, color: '#FC4C02' }} />, title: 'Importe do Strava', text: 'Conecte sua conta Strava e importe seus segmentos favoritos para monitoramento diário.' },
                { icon: <i className="ti ti-message-star" style={{ fontSize: 32, color: '#111' }} />, title: 'Avalie as trilhas', text: 'Compartilhe como estava a trilha com outros riders — sua experiência ajuda a comunidade.' },
              ].map(({ icon, title, text }) => (
                <div key={title} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 16 }}>
                  <div style={{ marginBottom: 8 }}>{icon}</div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#111', marginBottom: 4 }}>{title}</p>
                  <p style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>{text}</p>
                </div>
              ))}
            </div>

            {/* Banner Strava */}
            <div
              className="trilhas-strava-banner"
              style={{
                background: 'rgba(252,76,2,0.08)', border: '1px solid #FC4C02',
                borderRadius: 8, padding: '20px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <i className="ti ti-brand-strava" style={{ fontSize: 24, color: '#FC4C02', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 15, fontWeight: 500, color: '#111', marginBottom: 4 }}>Monitore suas trilhas do Strava</p>
                  <p style={{ fontSize: 13, color: '#888' }}>Importe segmentos favoritos e receba condições diárias</p>
                </div>
              </div>
              <a
                href="/perfil/strava"
                style={{
                  background: '#FC4C02', color: '#fff',
                  border: 'none', borderRadius: 4,
                  padding: '8px 16px', fontSize: 13, fontWeight: 500,
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Conectar com Strava
              </a>
            </div>
          </div>
        )}

        {/* Carregando */}
        {estadoSelecionado && loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Trilhas */}
        {estadoSelecionado && !loading && (
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

      {limiteMsg && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#111', color: '#fff', borderRadius: 8, padding: '12px 20px',
          fontSize: 13, zIndex: 1000, maxWidth: 440, textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
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
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f7f7f5' }} />}>
      <TrilhasContent />
    </Suspense>
  )
}
