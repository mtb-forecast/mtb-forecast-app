'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'

const PER_PAGE = 25

type Loc = { estado: string; cidade: string | null }

type TrilhaRow = {
  id: string
  name: string
  regiao: string | null
  observacoes: string | null
  localidade: Loc | Loc[] | null
  mantenedor: { nome: string; nome_primario: string | null } | null
}

function resolveLoc(raw: TrilhaRow['localidade']): Loc | null {
  if (!raw) return null
  if (Array.isArray(raw)) return (raw as Loc[])[0] ?? null
  return raw as Loc
}

function isPendente(t: TrilhaRow) {
  return !!t.observacoes?.includes('AJUSTE NECESSÁRIO')
}

function AdminTrilhasContent() {
  const router  = useRouter()
  const params  = useSearchParams()
  const [ready, setReady]               = useState(false)
  const [todas, setTodas]               = useState<TrilhaRow[]>([])
  const [page, setPage]                 = useState(0)
  const [busca, setBusca]               = useState('')
  const [estado, setEstado]             = useState(params.get('estado') ?? '')
  const [cidade, setCidade]             = useState(params.get('cidade') ?? '')
  const [estados, setEstados]           = useState<string[]>([])
  const [somentePendentes, setSomentePendentes] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId]   = useState<string | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/dashboard'); return }

      const { data } = await supabase
        .from('trilhas')
        .select('id, name, regiao, observacoes, localidade:localidades(estado, cidade), mantenedor:mantenedores(nome,nome_primario)')
        .eq('aprovada', true)
        .order('name')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[] as TrilhaRow[]
      setTodas(rows)

      const ests = [...new Set(
        rows.map(t => resolveLoc(t.localidade)?.estado || t.regiao || '').filter(Boolean)
      )].sort() as string[]
      setEstados(ests)

      setReady(true)
    }
    init()
  }, [router])

  // ── Filtros derivados ──────────────────────────────────────────────────────
  const cidades = useMemo(() => {
    if (!estado) return []
    const set = new Set<string>()
    for (const t of todas) {
      const loc = resolveLoc(t.localidade)
      if ((loc?.estado || t.regiao) === estado && loc?.cidade) set.add(loc.cidade)
    }
    return [...set].sort()
  }, [todas, estado])

  useEffect(() => { setCidade(''); setPage(0) }, [estado])
  useEffect(() => { setPage(0) }, [cidade, busca, somentePendentes])

  const filtradas = useMemo(() => {
    return todas.filter(t => {
      const loc     = resolveLoc(t.localidade)
      const tEstado = loc?.estado || t.regiao || ''
      const tCidade = loc?.cidade || ''
      if (estado && tEstado !== estado) return false
      if (cidade && tCidade !== cidade) return false
      if (busca.trim() && !t.name.toLowerCase().includes(busca.trim().toLowerCase())) return false
      if (somentePendentes && !isPendente(t)) return false
      return true
    })
  }, [todas, estado, cidade, busca, somentePendentes])

  const totalPendentes = useMemo(() => todas.filter(isPendente).length, [todas])
  const totalPages     = Math.ceil(filtradas.length / PER_PAGE)
  const paginadas      = filtradas.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  function handleBusca(v: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setBusca(v), 250)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    const res = await fetch('/api/delete-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'mtb_catalogo', id }),
    })
    setDeleting(false)
    if (res.ok) {
      setTodas(prev => prev.filter(t => t.id !== id))
      setConfirmDeleteId(null)
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!ready) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const fieldBase: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none',
    background: '#fff', border: '1px solid #e5e5e5',
    borderRadius: 8, fontSize: 14, outline: 'none', cursor: 'pointer',
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 20, textDecoration: 'none' }}>
            ← Admin
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32, margin: 0 }}>Trilhas aprovadas</h1>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', background: '#6d745f', color: '#fff', borderRadius: 2, padding: '3px 8px' }}>
              ADMIN
            </span>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            {filtradas.length} de {todas.length} trilha{todas.length !== 1 ? 's' : ''} no catálogo
            {totalPendentes > 0 && (
              <span style={{ marginLeft: 10, color: '#f59e0b', fontWeight: 600 }}>
                · ⚠️ {totalPendentes} pendente{totalPendentes !== 1 ? 's' : ''} de ajuste
              </span>
            )}
          </p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ padding: '24px 32px 80px', maxWidth: 900, margin: '0 auto' }}>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Estado */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <select
              value={estado}
              onChange={e => setEstado(e.target.value)}
              style={{ ...fieldBase, padding: '10px 36px 10px 14px', color: estado ? '#2a2e25' : '#888', width: 180 }}
            >
              <option value="">Estado (todos)</option>
              {estados.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#888', pointerEvents: 'none' }} />
          </div>

          {/* Cidade */}
          {estado && cidades.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={cidade}
                onChange={e => setCidade(e.target.value)}
                style={{ ...fieldBase, padding: '10px 36px 10px 14px', color: cidade ? '#2a2e25' : '#888', width: 210 }}
              >
                <option value="">Todas as cidades</option>
                {cidades.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <i className="ti ti-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#888', pointerEvents: 'none' }} />
            </div>
          )}

          {/* Busca */}
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <i className="ti ti-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#888' }} />
            <input
              type="text"
              placeholder="Buscar por nome…"
              onChange={e => handleBusca(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#fff', border: '1px solid #e5e5e5',
                borderRadius: 8, padding: '10px 12px 10px 36px',
                fontSize: 14, color: '#2a2e25', outline: 'none',
              }}
            />
          </div>

          {/* Filtro pendentes */}
          {totalPendentes > 0 && (
            <button
              onClick={() => setSomentePendentes(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: somentePendentes ? 'none' : '1px solid #fcd34d',
                background: somentePendentes ? '#fbbf24' : '#fffbeb',
                color: somentePendentes ? '#fff' : '#92400e',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              ⚠️ Pendentes{somentePendentes ? '' : ` (${totalPendentes})`}
            </button>
          )}
        </div>

        {/* Lista */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, overflow: 'hidden' }}>
          {paginadas.length === 0 ? (
            <div style={{ padding: '48px 32px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              Nenhuma trilha encontrada.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: '#aaa', textTransform: 'uppercase' }}>Nome</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: '#aaa', textTransform: 'uppercase' }}>Local</th>
                  <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', color: '#aaa', textTransform: 'uppercase' }}>Mantenedor</th>
                  <th style={{ padding: '12px 20px', width: 160 }} />
                </tr>
              </thead>
              <tbody>
                {paginadas.map((t, i) => {
                  const loc      = resolveLoc(t.localidade)
                  const localStr = loc
                    ? `${loc.estado}${loc.cidade ? ` · ${loc.cidade}` : ''}`
                    : t.regiao || '—'
                  const pendente   = isPendente(t)
                  const isConfirm  = confirmDeleteId === t.id

                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: i < paginadas.length - 1 ? '0.5px solid #f4f5f0' : 'none',
                        background: pendente ? 'rgba(251,191,36,0.04)' : undefined,
                      }}
                    >
                      <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#2a2e25' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {pendente && (
                            <span title="Pendente de ajuste" style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>⚠️</span>
                          )}
                          {t.name}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 13, color: '#6b7280' }}>{localStr}</td>
                      <td style={{ padding: '14px 20px', fontSize: 13, color: t.mantenedor ? '#2a2e25' : '#d1d5db' }}>
                        {t.mantenedor ? (t.mantenedor.nome_primario ?? t.mantenedor.nome) : '—'}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        {isConfirm ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>Excluir?</span>
                            <button
                              onClick={() => handleDelete(t.id)}
                              disabled={deleting}
                              style={{
                                fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
                                background: '#ef4444', color: '#fff', border: 'none',
                                cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1,
                              }}
                            >
                              {deleting ? '…' : 'Sim'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              style={{
                                fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 6,
                                background: '#f4f5f0', color: '#6b7280', border: '0.5px solid #e5e5e5',
                                cursor: 'pointer',
                              }}
                            >
                              Não
                            </button>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Link
                              href={`/trilhas/editar-aprovada/${t.id}?from=admin${estado ? `&estado=${encodeURIComponent(estado)}` : ''}${cidade ? `&cidade=${encodeURIComponent(cidade)}` : ''}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 13, fontWeight: 600, color: '#6d745f',
                                textDecoration: 'none', padding: '6px 12px',
                                background: '#f4f5f0', borderRadius: 6, border: '0.5px solid #e5e5e5',
                              }}
                            >
                              <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                              Editar
                            </Link>
                            <button
                              onClick={() => setConfirmDeleteId(t.id)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 13, fontWeight: 600, color: '#ef4444',
                                padding: '6px 10px', background: 'rgba(239,68,68,0.06)',
                                borderRadius: 6, border: '0.5px solid rgba(239,68,68,0.2)',
                                cursor: 'pointer',
                              }}
                            >
                              <i className="ti ti-trash" style={{ fontSize: 13 }} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e5e5',
                background: page === 0 ? '#f4f5f0' : '#fff', color: page === 0 ? '#d1d5db' : '#2a2e25',
                fontSize: 13, fontWeight: 600, cursor: page === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: 13, color: '#888' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e5e5',
                background: page >= totalPages - 1 ? '#f4f5f0' : '#fff',
                color: page >= totalPages - 1 ? '#d1d5db' : '#2a2e25',
                fontSize: 13, fontWeight: 600, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminTrilhasPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f4f5f0' }} />}>
      <AdminTrilhasContent />
    </Suspense>
  )
}
