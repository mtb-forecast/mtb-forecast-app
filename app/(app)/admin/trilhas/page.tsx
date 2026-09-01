'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  IconChevronDown, IconSearch, IconPencil, IconTrash, IconAlertTriangle, IconCircleCheck,
} from '@tabler/icons-react'
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

const fieldBase: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#1A1D18', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}
const selectBase: React.CSSProperties = { ...fieldBase, appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }

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
  const [revisando, setRevisando]       = useState<string | null>(null)
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

  // Marca a trilha como revisada: limpa o aviso "AJUSTE NECESSÁRIO" de
  // observacoes. Ação explícita e separada de "Editar" — salvar o formulário
  // não prova que os placeholders (solo_type/exposicao/trail_type/regiao)
  // foram de fato corrigidos, então quem confirma é o admin, aqui.
  async function handleMarcarRevisado(id: string) {
    setRevisando(id)
    const res = await fetch('/api/admin/editar-trilha', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, observacoes: null }),
    })
    setRevisando(null)
    if (res.ok) {
      setTodas(prev => prev.map(t => t.id === id ? { ...t, observacoes: null } : t))
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!ready) return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.08)', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '28px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Link href="/admin" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: 'rgba(154,160,147,.7)',
            marginBottom: 16, textDecoration: 'none',
          }}>
            ← Admin
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 38px)', textTransform: 'uppercase',
            color: '#F4F3EF', lineHeight: 0.95, margin: 0,
          }}>
            Trilhas
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8 }}>
            {filtradas.length} de {todas.length} trilha{todas.length !== 1 ? 's' : ''} no catálogo
            {totalPendentes > 0 && (
              <span style={{ marginLeft: 10, color: '#F59E0B' }}>
                · {totalPendentes} pendente{totalPendentes !== 1 ? 's' : ''} de ajuste
              </span>
            )}
          </p>
        </div>
      </div>

      <div style={{ padding: '24px 32px 80px', maxWidth: 900, margin: '0 auto' }}>

        {/* Filtros */}
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>

            {/* Estado */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select
                value={estado}
                onChange={e => setEstado(e.target.value)}
                style={{ ...selectBase, paddingRight: 36, color: estado ? '#1A1D18' : '#9AA093', width: 180 }}
              >
                <option value="">Estado (todos)</option>
                {estados.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <IconChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9AA093', pointerEvents: 'none' }} />
            </div>

            {/* Cidade */}
            {estado && cidades.length > 0 && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <select
                  value={cidade}
                  onChange={e => setCidade(e.target.value)}
                  style={{ ...selectBase, paddingRight: 36, color: cidade ? '#1A1D18' : '#9AA093', width: 210 }}
                >
                  <option value="">Todas as cidades</option>
                  {cidades.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <IconChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#9AA093', pointerEvents: 'none' }} />
              </div>
            )}

            {/* Busca */}
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9AA093' }} />
              <input
                type="text"
                placeholder="Buscar por nome…"
                onChange={e => handleBusca(e.target.value)}
                style={{ ...fieldBase, paddingLeft: 36 }}
              />
            </div>

            {/* Filtro pendentes */}
            {totalPendentes > 0 && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-dm-mono)', fontSize: 11, color: '#9AA093', cursor: 'pointer', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={somentePendentes}
                  onChange={e => setSomentePendentes(e.target.checked)}
                  style={{ accentColor: '#6d745f' }}
                />
                Só pendentes ({totalPendentes})
              </label>
            )}

            {(estado || cidade || busca || somentePendentes) && (
              <button
                onClick={() => { setEstado(''); setCidade(''); setBusca(''); setSomentePendentes(false) }}
                style={{
                  border: '1px solid rgba(0,0,0,.1)', background: 'transparent', color: '#6B7280',
                  borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        {paginadas.length === 0 ? (
          <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 48, textAlign: 'center', color: '#9AA093', fontSize: 14 }}>
            Nenhuma trilha encontrada.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paginadas.map(t => {
              const loc      = resolveLoc(t.localidade)
              const localStr = loc
                ? `${loc.estado}${loc.cidade ? ` · ${loc.cidade}` : ''}`
                : t.regiao || '—'
              const pendente  = isPendente(t)
              const isConfirm = confirmDeleteId === t.id

              return (
                <div
                  key={t.id}
                  style={{
                    background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12,
                    padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 17,
                          textTransform: 'uppercase', color: '#1A1D18',
                        }}>
                          {t.name}
                        </span>
                        {pendente && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            background: 'rgba(245,158,11,.1)', color: '#F59E0B',
                            border: '1px solid rgba(245,158,11,.25)', borderRadius: 999,
                            fontFamily: 'var(--font-dm-mono)', fontSize: 10, padding: '2px 8px',
                          }}>
                            <IconAlertTriangle size={10} />
                            AJUSTE PENDENTE
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#9AA093' }}>
                        <span>{localStr}</span>
                        <span>{t.mantenedor ? (t.mantenedor.nome_primario ?? t.mantenedor.nome) : '—'}</span>
                      </div>
                      {t.observacoes && (
                        <p style={{
                          fontSize: 12, color: '#9AA093', fontStyle: 'italic',
                          borderLeft: '2px solid rgba(0,0,0,.08)', paddingLeft: 8, marginTop: 8, lineHeight: 1.5,
                        }}>
                          {t.observacoes}
                        </p>
                      )}
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      {isConfirm ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
                          borderRadius: 10, padding: '10px 14px',
                        }}>
                          <span style={{ fontSize: 12, color: '#6B7280' }}>Excluir?</span>
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={deleting}
                            style={{
                              fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8,
                              background: '#EF4444', color: '#fff', border: 'none',
                              cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1,
                            }}
                          >
                            {deleting ? '…' : 'Sim'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8,
                              background: 'transparent', color: '#9AA093', border: 'none', cursor: 'pointer',
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {pendente && (
                            <button
                              onClick={() => handleMarcarRevisado(t.id)}
                              disabled={revisando === t.id}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 12, fontWeight: 600, color: '#15803D',
                                padding: '6px 12px', background: 'rgba(21,128,61,.06)',
                                borderRadius: 8, border: '1px solid rgba(21,128,61,.2)',
                                cursor: revisando === t.id ? 'not-allowed' : 'pointer',
                                opacity: revisando === t.id ? 0.6 : 1,
                              }}
                              title="Confirma que solo, exposição, tipo de trilha e região já foram revisados"
                            >
                              <IconCircleCheck size={13} />
                              {revisando === t.id ? 'Marcando…' : 'Marcar revisado'}
                            </button>
                          )}
                          <Link
                            href={`/trilhas/editar-aprovada/${t.id}?from=admin${estado ? `&estado=${encodeURIComponent(estado)}` : ''}${cidade ? `&cidade=${encodeURIComponent(cidade)}` : ''}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              fontSize: 12, fontWeight: 600, color: '#1A1D18',
                              textDecoration: 'none', padding: '6px 12px',
                              background: '#F8F9F5', borderRadius: 8, border: '1px solid rgba(0,0,0,.08)',
                            }}
                          >
                            <IconPencil size={13} />
                            Editar
                          </Link>
                          <button
                            onClick={() => setConfirmDeleteId(t.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 12, fontWeight: 600, color: '#EF4444',
                              padding: '6px 10px', background: 'transparent',
                              borderRadius: 8, border: '1px solid rgba(239,68,68,.2)',
                              cursor: 'pointer',
                            }}
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,.1)',
                background: page === 0 ? '#F5F6F2' : '#FFFFFF', color: page === 0 ? '#9AA093' : '#1A1D18',
                fontFamily: 'var(--font-dm-mono)', fontSize: 12, cursor: page === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Anterior
            </button>
            <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#9AA093' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(0,0,0,.1)',
                background: page >= totalPages - 1 ? '#F5F6F2' : '#FFFFFF',
                color: page >= totalPages - 1 ? '#9AA093' : '#1A1D18',
                fontFamily: 'var(--font-dm-mono)', fontSize: 12, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
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
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F5F6F2' }} />}>
      <AdminTrilhasContent />
    </Suspense>
  )
}
