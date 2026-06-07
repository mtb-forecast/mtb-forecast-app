'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
type MTBItem = {
  kind: 'mtb'
  source: 'pendente' | 'catalogo'
  id: string
  name: string
  regiao: string
  status: string
  user_email?: string
  created_at: string
}

type PTItem = {
  kind: 'pumptrack'
  id: string
  name: string
  regiao: string
  status: string
  user_email?: string
  created_at: string
}

type AnyItem = MTBItem | PTItem

// ── Tokens ────────────────────────────────────────────────────────────────────
const T = { bg: '#f7f7f5', card: '#fff', border: '#e5e5e5', text: '#111', muted: '#888', danger: '#ef4444' }

const STATUS_COLOR: Record<string, string> = {
  pendente: '#d97706',
  aprovada: '#16a34a',
  rejeitada: '#dc2626',
  'Ativo - Base de Dados': '#16a34a',
  'Pendente - Revisão': '#d97706',
  catalogo: '#2563eb',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GerenciarTrilhasPage() {
  const router = useRouter()
  const [items, setItems] = useState<AnyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'mtb' | 'pumptrack'>('todos')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/dashboard'); return }

      const [{ data: pendentes }, { data: catalogo }, { data: pumptrack }] = await Promise.all([
        supabase.from('trilhas_pendentes').select('id, name, regiao, status, created_at, user_id').order('created_at', { ascending: false }),
        supabase.from('trilhas').select('id, name, regiao, aprovada, created_at, created_by').order('created_at', { ascending: false }),
        supabase.from('trilhas_pumptrack').select('id, nome, uf, status_validacao, created_at, user_id').order('created_at', { ascending: false }),
      ])

      const mtbItems: MTBItem[] = [
        ...(pendentes || []).map((t: { id: string; name: string; regiao: string; status: string; created_at: string }) => ({
          kind: 'mtb' as const, source: 'pendente' as const,
          id: t.id, name: t.name, regiao: t.regiao || '', status: t.status, created_at: t.created_at,
        })),
        ...(catalogo || []).map((t: { id: string; name: string; regiao: string; created_at: string }) => ({
          kind: 'mtb' as const, source: 'catalogo' as const,
          id: t.id, name: t.name, regiao: t.regiao || '', status: 'catalogo', created_at: t.created_at,
        })),
      ]

      const ptItems: PTItem[] = (pumptrack || []).map((p: { id: string; nome: string; uf: string | null; status_validacao: string | null; created_at: string }) => ({
        kind: 'pumptrack', id: p.id, name: p.nome, regiao: p.uf || '',
        status: p.status_validacao || 'Pendente - Revisão', created_at: p.created_at,
      }))

      const all: AnyItem[] = [...mtbItems, ...ptItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      setItems(all)
      setLoading(false)
    }
    load()
  }, [router])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (tipoFiltro === 'mtb' && i.kind !== 'mtb') return false
      if (tipoFiltro === 'pumptrack' && i.kind !== 'pumptrack') return false
      if (busca) {
        const q = busca.toLowerCase()
        return i.name.toLowerCase().includes(q) || i.regiao.toLowerCase().includes(q)
      }
      return true
    })
  }, [items, tipoFiltro, busca])

  async function handleDelete(item: AnyItem) {
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
      setItems(prev => prev.filter(i => i.id !== item.id || i.kind !== item.kind))
      setConfirmDeleteId(null)
      setMsg('Item excluído com sucesso.')
      setTimeout(() => setMsg(null), 3000)
    }
  }

  const countMTB = items.filter(i => i.kind === 'mtb').length
  const countPT  = items.filter(i => i.kind === 'pumptrack').length

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: '#111', padding: '32px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#888', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />
            Painel Admin
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>Gerenciar trilhas</h1>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', background: '#FFE000', color: '#111', borderRadius: 4, padding: '3px 8px' }}>ADMIN</span>
          </div>
          <p style={{ color: '#888', fontSize: 13, marginTop: 6 }}>
            {countMTB} trilha{countMTB !== 1 ? 's' : ''} MTB · {countPT} pump track{countPT !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>

        {msg && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            {msg}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            { id: 'todos',     label: 'Todos',        count: items.length },
            { id: 'mtb',       label: '🏔 MTB',        count: countMTB },
            { id: 'pumptrack', label: '🟣 Pump Track',  count: countPT },
          ] as { id: typeof tipoFiltro; label: string; count: number }[]).map(opt => (
            <button key={opt.id} onClick={() => setTipoFiltro(opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20,
                background: tipoFiltro === opt.id ? '#111' : '#fff',
                color: tipoFiltro === opt.id ? '#FFE000' : T.muted,
                border: `1px solid ${tipoFiltro === opt.id ? '#111' : T.border}`,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none',
              }}>
              {opt.label}
              <span style={{ fontSize: 11, background: tipoFiltro === opt.id ? 'rgba(255,224,0,0.15)' : '#f7f7f5', borderRadius: 10, padding: '1px 7px' }}>{opt.count}</span>
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 20 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: T.muted }} />
          <input
            type="text"
            placeholder="Buscar por nome ou região…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '10px 12px 10px 36px', fontSize: 13, color: T.text, outline: 'none',
            }}
          />
          {busca && (
            <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 14, padding: 2 }}>
              <i className="ti ti-x" />
            </button>
          )}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: T.muted }}>Nenhum item encontrado.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(item => {
              const isPT = item.kind === 'pumptrack'
              const statusColor = STATUS_COLOR[item.status] ?? T.muted
              const editHref = isPT
                ? `/trilhas/editar-pumptrack/${item.id}`
                : item.kind === 'mtb' && item.source === 'catalogo'
                  ? `/trilhas/editar-aprovada/${item.id}`
                  : `/trilhas/editar/${item.id}`
              const deleteKey = `${item.kind}-${item.id}`

              return (
                <div key={deleteKey} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 18px' }}>
                  {confirmDeleteId === deleteKey ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ flex: 1, fontSize: 13, color: T.danger, fontWeight: 600 }}>
                        Excluir &ldquo;{item.name}&rdquo;? Ação irreversível.
                      </span>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={deleting}
                        style={{ background: T.danger, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {deleting && <span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                        Confirmar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        style={{ background: 'none', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Type + Name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: isPT ? '#7c3aed' : T.muted, textTransform: 'uppercase', flexShrink: 0 }}>
                            {isPT ? '🟣 PT' : '🏔 MTB'}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: T.muted }}>{item.regiao}</span>
                          <span style={{ fontSize: 11, color: T.muted }}>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: `${statusColor}18`, borderRadius: 10, padding: '2px 8px' }}>
                            {item.status}
                          </span>
                          {item.kind === 'mtb' && item.source === 'catalogo' && (
                            <span style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>· catálogo</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <Link href={editHref} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: '#f7f7f5', color: T.text, borderRadius: 8,
                          padding: '7px 12px', fontSize: 12, fontWeight: 600,
                          textDecoration: 'none', border: `1px solid ${T.border}`,
                        }}>
                          <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                          Editar
                        </Link>
                        <button
                          onClick={() => setConfirmDeleteId(deleteKey)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'transparent', color: T.danger, borderRadius: 8,
                            padding: '7px 12px', fontSize: 12, fontWeight: 600,
                            border: `1px solid rgba(239,68,68,0.25)`, cursor: 'pointer',
                          }}>
                          <i className="ti ti-trash" style={{ fontSize: 13 }} />
                          Excluir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
