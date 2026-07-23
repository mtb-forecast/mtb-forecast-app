'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  IconPlus, IconSearch, IconX, IconMapPin,
  IconFilterOff, IconPencil, IconMap, IconTrash, IconMountain,
} from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
type TrilhaMTB = {
  kind: 'mtb'
  id: string
  name: string
  regiao: string
  cidade: string | null
  status: string
  created_at: string
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
  bg:      '#F5F6F2',
  card:    '#FFFFFF',
  card2:   '#F8F9F5',
  border:  'rgba(0,0,0,.08)',
  primary: '#6d745f',
  text:    '#1A1D18',
  muted:   '#6d745f',
  dim:     '#9AA093',
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

      const [{ data: catalogo }, { data: pt }] = await Promise.all([
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

      type LocRaw = { estado: string; cidade: string | null }
      function resolveLoc(raw: unknown): LocRaw | null {
        if (!raw) return null
        if (Array.isArray(raw)) return (raw as LocRaw[])[0] ?? null
        return raw as LocRaw
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mtbItems: TrilhaMTB[] = (catalogo || []).map((t: any) => {
        const loc = resolveLoc(t.localidade)
        return {
          kind: 'mtb' as const,
          id: t.id as string,
          name: t.name as string,
          regiao: loc?.estado || (t.regiao as string) || '',
          cidade: loc?.cidade ?? null,
          status: 'aprovada',
          created_at: t.created_at as string,
        }
      })

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
    const kind = item.kind === 'pumptrack' ? 'pumptrack' : 'mtb_catalogo'
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
      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '24px 16px 20px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link href="/perfil" style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1px',
            color: 'rgba(154,160,147,.7)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
          }}>
            ← Perfil
          </Link>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                fontSize: 'clamp(28px, 5vw, 38px)', textTransform: 'uppercase',
                color: '#F4F3EF', lineHeight: 0.95, margin: '0 0 6px',
              }}>
                Meus cadastros
              </h1>
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', margin: 0 }}>
                {countMTB} trilha{countMTB !== 1 ? 's' : ''} MTB · {countPT} pump track{countPT !== 1 ? 's' : ''}
              </p>
            </div>
            <Link href="/trilhas/cadastrar" style={{
              background: '#F4F3EF', color: '#0E0F0D', borderRadius: 999,
              padding: '8px 16px', fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700,
              fontSize: 14, textTransform: 'uppercase', letterSpacing: '.5px',
              textDecoration: 'none', flexShrink: 0,
            }}>
              + Novo
            </Link>
          </div>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div style={{ padding: '0 16px 0', maxWidth: 640, margin: '0 auto' }}>

        {/* Tipo pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
          {([
            { id: 'todos',     label: 'Todos',      count: items.length },
            { id: 'mtb',       label: 'MTB',         count: countMTB },
            { id: 'pumptrack', label: 'Pump Track',  count: countPT },
          ] as { id: TipoFiltro; label: string; count: number }[]).map(opt => {
            const active = tipoFiltro === opt.id
            const isPumptrack = opt.id === 'pumptrack'
            return (
              <button key={opt.id} onClick={() => setTipoFiltro(opt.id)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 20,
                  background: active ? (isPumptrack ? '#7C3AED' : T.primary) : T.card2,
                  color: active ? '#fff' : (isPumptrack ? '#a78bfa' : T.muted),
                  border: active ? 'none' : `1px solid ${T.border}`,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s', outline: 'none',
                }}>
                {opt.id === 'mtb' && <IconMountain size={13} />}
                {opt.label}
                <span style={{ fontSize: 11, background: active ? 'rgba(255,255,255,0.2)' : T.border, borderRadius: 10, padding: '1px 7px' }}>{opt.count}</span>
              </button>
            )
          })}
        </div>

        {/* Estado + Cidade */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select
            value={estadoFiltro}
            onChange={e => { setEstadoFiltro(e.target.value); setCidadeFiltro('') }}
            style={{
              background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)', borderRadius: 10,
              padding: '9px 12px', fontSize: 13, color: estadoFiltro ? '#1A1D18' : '#9AA093',
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
              background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)', borderRadius: 10,
              padding: '9px 12px', fontSize: 13, color: cidadeFiltro ? '#1A1D18' : '#9AA093',
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
          <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted }} />
          <input
            type="text"
            placeholder="Buscar por nome…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)', borderRadius: 10,
              padding: '9px 12px 9px 36px', fontSize: 13, color: '#1A1D18',
              outline: 'none',
            }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 14, padding: 2 }}>
              <IconX size={14} />
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
                  <IconX size={14} />
                </button>
              </span>
            )}
            {cidadeFiltro && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(109,116,95,0.08)', border: '1px solid rgba(109,116,95,0.2)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: T.primary }}>
                {cidadeFiltro}
                <button onClick={() => setCidadeFiltro('')} style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', padding: 0, fontSize: 12, display: 'flex' }}>
                  <IconX size={14} />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── LIST ── */}
      <div style={{ padding: '0 16px 100px', maxWidth: 640, margin: '0 auto' }}>
        {items.length === 0 ? (
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F8F9F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <IconMapPin size={24} style={{ color: T.muted }} />
            </div>
            <p style={{ fontSize: 15, color: T.text, fontWeight: 600, margin: '0 0 8px' }}>Nenhum cadastro ainda</p>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 24px' }}>Compartilhe suas trilhas e pump tracks com a comunidade MTB.</p>
            <Link href="/trilhas/cadastrar" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#6d745f', color: '#fff', borderRadius: 12,
              padding: '12px 24px', fontSize: 14, fontWeight: 800, textDecoration: 'none',
            }}>
              <IconPlus size={16} />
              Cadastrar agora
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 16, padding: '32px', textAlign: 'center' }}>
            <IconFilterOff size={28} style={{ color: T.muted }} />
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
                : `/trilhas/editar-aprovada/${item.id}`

              return (
                <div key={`${item.kind}-${item.id}`} style={{
                  background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)',
                  borderRadius: 14, overflow: 'hidden',
                }}>
                  <div style={{ padding: '16px 20px' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: isPumptrack ? '#a78bfa' : T.muted, textTransform: 'uppercase' }}>
                            {isPumptrack ? 'Pump Track' : 'Trilha MTB'}
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
                        <IconMapPin size={12} />
                        {item.regiao}{item.cidade ? ` · ${item.cidade}` : ''}
                      </span>
                      <span style={{ fontSize: 12, color: T.muted }}>
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    {/* Actions */}
                    {confirmDeleteId === `${item.kind}-${item.id}` ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '10px 14px' }}>
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
                          background: '#F8F9F5', color: '#1A1D18', borderRadius: 10,
                          padding: '8px 16px', fontSize: 13, fontWeight: 600,
                          textDecoration: 'none', border: '1px solid rgba(0,0,0,.08)',
                        }}>
                          <IconPencil size={14} style={{ color: T.primary }} />
                          Editar
                        </Link>

                        {isPTActive && (
                          <Link href="/mapa" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#F8F9F5', color: '#6d745f', borderRadius: 10,
                            padding: '8px 16px', fontSize: 13, fontWeight: 600,
                            textDecoration: 'none', border: '1px solid rgba(0,0,0,.08)',
                          }}>
                            <IconMap size={14} />
                            Ver no mapa
                          </Link>
                        )}

                        <button
                          onClick={() => setConfirmDeleteId(`${item.kind}-${item.id}`)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'transparent', color: '#EF4444', borderRadius: 10,
                            padding: '8px 12px', fontSize: 13, fontWeight: 600,
                            border: '1px solid rgba(239,68,68,.2)', cursor: 'pointer',
                          }}>
                          <IconTrash size={14} />
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
