'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
type TrilhaMTB = {
  kind: 'mtb'
  id: string
  name: string
  regiao: string
  cidade: string | null
  status: string
  motivo_rejeicao?: string | null
  created_at: string
  source: 'pendentes' | 'catalogo'
}

type PumpTrack = {
  kind: 'pumptrack'
  id: string
  name: string
  regiao: string   // uf
  cidade: string | null
  status: string   // status_validacao
  created_at: string
}

type Item = TrilhaMTB | PumpTrack

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  pendente:             { bg: 'rgba(251,191,36,0.12)',  color: '#f59e0b', dot: '#f59e0b', label: 'Aguardando revisão' },
  aprovada:             { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', dot: '#4ade80', label: 'Aprovada' },
  rejeitada:            { bg: 'rgba(248,113,113,0.12)', color: '#f87171', dot: '#f87171', label: 'Rejeitada' },
  'Ativo - Base de Dados': { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', dot: '#4ade80', label: 'Publicado' },
  'Pendente - Revisão': { bg: 'rgba(251,191,36,0.12)',  color: '#f59e0b', dot: '#f59e0b', label: 'Aguardando revisão' },
}

function statusCfg(status: string) {
  return STATUS_CFG[status] ?? { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af', dot: '#9ca3af', label: status }
}

// ── Tokens ────────────────────────────────────────────────────────────────────
const T = {
  bg: '#f4f5f0', card: '#ffffff', card2: '#eaece4',
  border: '#d0d4c6', primary: '#6d745f', text: '#2a2e25', muted: '#6d745f',
}

type TipoFiltro = 'todos' | 'mtb' | 'pumptrack'

// ── Component ─────────────────────────────────────────────────────────────────
export default function MinhasTrilhasPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Filters
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [cidadeFiltro, setCidadeFiltro] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const [{ data: mtb }, { data: catalogo }, { data: pt }] = await Promise.all([
        supabase
          .from('trilhas_pendentes')
          .select('id, name, regiao, status, motivo_rejeicao, created_at, localidade:localidades(estado, cidade)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('trilhas')
          .select('id, name, regiao, created_at, localidade:localidades(estado, cidade)')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('trilhas_pumptrack')
          .select('id, nome, uf, cidade, status_validacao, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      // IDs já em trilhas_pendentes — não duplicar
      const pendentesIds = new Set((mtb || []).map((t: { id: string }) => t.id))

      type LocRaw = { estado: string; cidade: string | null }
      // Supabase pode retornar o join como objeto OU array dependendo da versão
      function resolveLoc(raw: unknown): LocRaw | null {
        if (!raw) return null
        if (Array.isArray(raw)) return (raw as LocRaw[])[0] ?? null
        return raw as LocRaw
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mtbItems: TrilhaMTB[] = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(mtb || []).map((t: any) => {
          const loc = resolveLoc(t.localidade)
          return {
            kind: 'mtb' as const,
            id: t.id as string,
            name: t.name as string,
            regiao: loc?.estado || (t.regiao as string) || '',
            cidade: loc?.cidade ?? null,
            status: t.status as string,
            motivo_rejeicao: t.motivo_rejeicao as string | null | undefined,
            created_at: t.created_at as string,
            source: 'pendentes' as const,
          }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(catalogo || []).filter((t: any) => !pendentesIds.has(t.id)).map((t: any) => {
          const loc = resolveLoc(t.localidade)
          return {
            kind: 'mtb' as const,
            id: t.id as string,
            name: t.name as string,
            regiao: loc?.estado || (t.regiao as string) || '',
            cidade: loc?.cidade ?? null,
            status: 'aprovada',
            created_at: t.created_at as string,
            source: 'catalogo' as const,
          }
        }),
      ]

      const ptItems: PumpTrack[] = (pt || []).map((p: { id: string; nome: string; uf: string | null; cidade: string | null; status_validacao: string | null; created_at: string }) => ({
        kind: 'pumptrack',
        id: p.id,
        name: p.nome,
        regiao: p.uf || '',
        cidade: p.cidade || null,
        status: p.status_validacao || 'Pendente - Revisão',
        created_at: p.created_at,
      }))

      setItems([...mtbItems, ...ptItems].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived filter options ──────────────────────────────────────────────────
  const estados = useMemo(() => {
    const set = new Set(items.map(i => i.regiao).filter(Boolean))
    return [...set].sort()
  }, [items])

  const cidades = useMemo(() => {
    const set = new Set(
      items
        .filter(i => !estadoFiltro || i.regiao === estadoFiltro)
        .map(i => i.cidade)
        .filter((c): c is string => !!c)
    )
    return [...set].sort()
  }, [items, estadoFiltro])

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return items.filter(i => {
      if (tipoFiltro === 'mtb' && i.kind !== 'mtb') return false
      if (tipoFiltro === 'pumptrack' && i.kind !== 'pumptrack') return false
      if (estadoFiltro && i.regiao !== estadoFiltro) return false
      if (cidadeFiltro && i.cidade !== cidadeFiltro) return false
      if (busca) {
        const q = busca.toLowerCase()
        return i.name.toLowerCase().includes(q) || (i.cidade || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [items, tipoFiltro, estadoFiltro, cidadeFiltro, busca])

  const countMTB = items.filter(i => i.kind === 'mtb').length
  const countPT  = items.filter(i => i.kind === 'pumptrack').length

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(item: Item) {
    setDeleting(true)
    const kind = item.kind === 'pumptrack'
      ? 'pumptrack'
      : item.source === 'catalogo' ? 'mtb_catalogo' : 'mtb_pendente'
    const res = await fetch('/api/delete-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id: item.id }),
    })
    setDeleting(false)
    if (res.ok) {
      setItems(prev => prev.filter(i => !(i.id === item.id && i.kind === item.kind)))
      setConfirmDeleteId(null)
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,0.08)', borderTopColor: T.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ padding: '20px 16px 0', maxWidth: 640, margin: '0 auto' }}>
        <Link href="/perfil" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.muted, fontSize: 13, textDecoration: 'none', marginBottom: 20 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />
          Perfil
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: T.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
              Meus cadastros
            </h1>
            <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
              {countMTB} trilha{countMTB !== 1 ? 's' : ''} MTB · {countPT} pump track{countPT !== 1 ? 's' : ''}
            </p>
          </div>
          <Link href="/trilhas/cadastrar" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: T.primary, color: '#fff', borderRadius: 12,
            padding: '9px 14px', fontSize: 13, fontWeight: 800, textDecoration: 'none', flexShrink: 0,
          }}>
            <i className="ti ti-plus" style={{ fontSize: 14 }} />
            Novo
          </Link>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div style={{ padding: '0 16px 0', maxWidth: 640, margin: '0 auto' }}>

        {/* Tipo pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
          {([
            { id: 'todos',     label: 'Todos',      count: items.length },
            { id: 'mtb',       label: '🏔 MTB',       count: countMTB },
            { id: 'pumptrack', label: '🟣 Pump Track', count: countPT },
          ] as { id: TipoFiltro; label: string; count: number }[]).map(opt => (
            <button key={opt.id} onClick={() => setTipoFiltro(opt.id)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 20,
                background: tipoFiltro === opt.id ? T.primary : T.card2,
                color: tipoFiltro === opt.id ? '#fff' : T.muted,
                border: tipoFiltro === opt.id ? 'none' : `1px solid ${T.border}`,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s', outline: 'none',
              }}>
              {opt.label}
              <span style={{ fontSize: 11, background: tipoFiltro === opt.id ? 'rgba(255,255,255,0.2)' : T.border, borderRadius: 10, padding: '1px 7px' }}>{opt.count}</span>
            </button>
          ))}
        </div>

        {/* Estado + Cidade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select
            value={estadoFiltro}
            onChange={e => { setEstadoFiltro(e.target.value); setCidadeFiltro('') }}
            style={{
              background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '9px 12px', fontSize: 13, color: estadoFiltro ? T.text : T.muted,
              outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
            }}
          >
            <option value="">Estado (todos)</option>
            {estados.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          <select
            value={cidadeFiltro}
            onChange={e => setCidadeFiltro(e.target.value)}
            disabled={cidades.length === 0}
            style={{
              background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '9px 12px', fontSize: 13, color: cidadeFiltro ? T.text : T.muted,
              outline: 'none', cursor: cidades.length === 0 ? 'not-allowed' : 'pointer',
              width: '100%', boxSizing: 'border-box', opacity: cidades.length === 0 ? 0.4 : 1,
            }}
          >
            <option value="">Cidade (todas)</option>
            {cidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: T.muted }} />
          <input
            type="text"
            placeholder="Buscar por nome…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '9px 12px 9px 36px', fontSize: 13, color: T.text,
              outline: 'none',
            }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 14, padding: 2 }}>
              <i className="ti ti-x" />
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {(estadoFiltro || cidadeFiltro) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {estadoFiltro && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(109,116,95,0.08)', border: '1px solid rgba(109,116,95,0.2)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: T.primary }}>
                {estadoFiltro}
                <button onClick={() => { setEstadoFiltro(''); setCidadeFiltro('') }} style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', padding: 0, fontSize: 12, display: 'flex' }}>
                  <i className="ti ti-x" />
                </button>
              </span>
            )}
            {cidadeFiltro && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(109,116,95,0.08)', border: '1px solid rgba(109,116,95,0.2)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: T.primary }}>
                {cidadeFiltro}
                <button onClick={() => setCidadeFiltro('')} style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', padding: 0, fontSize: 12, display: 'flex' }}>
                  <i className="ti ti-x" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── LIST ── */}
      <div style={{ padding: '0 16px 100px', maxWidth: 640, margin: '0 auto' }}>
        {items.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#eaece4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ti ti-map-pin" style={{ fontSize: 24, color: T.muted }} />
            </div>
            <p style={{ fontSize: 15, color: T.text, fontWeight: 600, margin: '0 0 8px' }}>Nenhum cadastro ainda</p>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 24px' }}>Compartilhe suas trilhas e pump tracks com a comunidade MTB.</p>
            <Link href="/trilhas/cadastrar" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: T.primary, color: '#fff', borderRadius: 14,
              padding: '12px 24px', fontSize: 14, fontWeight: 800, textDecoration: 'none',
            }}>
              <i className="ti ti-plus" style={{ fontSize: 16 }} />
              Cadastrar agora
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '32px', textAlign: 'center' }}>
            <i className="ti ti-filter-off" style={{ fontSize: 28, color: T.muted }} />
            <p style={{ fontSize: 14, color: T.muted, marginTop: 12 }}>Nenhum resultado para os filtros aplicados.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(item => {
              const cfg = statusCfg(item.status)
              const isPumptrack = item.kind === 'pumptrack'
              const isPTActive = isPumptrack && item.status === 'Ativo - Base de Dados'
              const editHref = isPumptrack
                ? `/trilhas/editar-pumptrack/${item.id}`
                : item.kind === 'mtb' && item.source === 'catalogo'
                  ? `/trilhas/editar-aprovada/${item.id}`
                  : `/trilhas/editar/${item.id}`

              return (
                <div key={`${item.kind}-${item.id}`} style={{
                  background: T.card, border: `1px solid ${T.border}`,
                  borderRadius: 20, overflow: 'hidden',
                }}>
                  <div style={{ padding: '16px 20px' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: isPumptrack ? '#a78bfa' : T.muted, textTransform: 'uppercase' }}>
                            {isPumptrack ? '🟣 Pump Track' : '🏔 Trilha MTB'}
                          </span>
                          {isPTActive && (
                            <span style={{ fontSize: 10, color: T.muted }}>· no mapa</span>
                          )}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{item.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: cfg.bg, borderRadius: 20, padding: '4px 10px' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                      </div>
                    </div>

                    {/* Meta */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className="ti ti-map-pin" style={{ fontSize: 12 }} />
                        {item.regiao}{item.cidade ? ` · ${item.cidade}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: T.muted }}>
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    {/* Rejection reason (MTB only) */}
                    {item.kind === 'mtb' && item.status === 'rejeitada' && item.motivo_rejeicao && (
                      <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                        <p style={{ fontSize: 12, color: '#f87171', margin: 0, lineHeight: 1.6 }}>
                          <strong>Motivo:</strong> {item.motivo_rejeicao}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    {confirmDeleteId === `${item.kind}-${item.id}` ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                        <span style={{ fontSize: 13, color: '#f87171', flex: 1 }}>Confirmar exclusão?</span>
                        <button
                          onClick={() => handleDelete(item)}
                          disabled={deleting}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {deleting
                            ? <span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                            : null}
                          Excluir
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 13, padding: '7px 10px' }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Link href={editHref} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: T.card2, color: T.text, borderRadius: 10,
                          padding: '8px 16px', fontSize: 13, fontWeight: 600,
                          textDecoration: 'none', border: `1px solid ${T.border}`,
                        }}>
                          <i className="ti ti-pencil" style={{ fontSize: 14, color: T.primary }} />
                          Editar
                        </Link>

                        {isPTActive && (
                          <Link href="/mapa" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: T.card2, color: T.primary, borderRadius: 10,
                            padding: '8px 16px', fontSize: 13, fontWeight: 600,
                            textDecoration: 'none', border: `1px solid ${T.border}`,
                          }}>
                            <i className="ti ti-map" style={{ fontSize: 14 }} />
                            Ver no mapa
                          </Link>
                        )}

                        <button
                          onClick={() => setConfirmDeleteId(`${item.kind}-${item.id}`)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'transparent', color: '#f87171', borderRadius: 10,
                            padding: '8px 12px', fontSize: 13, fontWeight: 600,
                            border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer',
                          }}>
                          <i className="ti ti-trash" style={{ fontSize: 14 }} />
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
