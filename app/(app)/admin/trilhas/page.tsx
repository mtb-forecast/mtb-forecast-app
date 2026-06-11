'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'

const PER_PAGE = 25

type TrilhaRow = {
  id: string
  name: string
  regiao: string
  localidade: { estado: string; cidade: string | null } | null
  mantenedor: { nome: string; nome_primario: string | null } | null
}

export default function AdminTrilhasPage() {
  const router = useRouter()
  const [ready, setReady]         = useState(false)
  const [trilhas, setTrilhas]     = useState<TrilhaRow[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [busca, setBusca]         = useState('')
  const [estado, setEstado]       = useState('')
  const [estados, setEstados]     = useState<string[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Init (auth + estados) ──────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/dashboard'); return }

      const { data: locs } = await supabase
        .from('localidades').select('estado').order('estado')
      const unique = [...new Set((locs ?? []).map((l: { estado: string }) => l.estado).filter(Boolean))].sort()
      setEstados(unique as string[])
      setReady(true)
    }
    init()
  }, [router])

  // ── Fetch trilhas ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return

    async function load() {
      setSearching(true)
      let query = supabase
        .from('trilhas')
        .select('id, name, regiao, localidade:localidades(estado, cidade), mantenedor:mantenedores(id,nome,nome_primario)', { count: 'exact' })
        .eq('aprovada', true)
        .order('name')
        .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = query
      if (busca.trim()) q = q.ilike('name', `%${busca.trim()}%`)
      if (estado)       q = q.eq('localidades.estado', estado)

      const { data, count } = await q
      setTrilhas((data ?? []) as TrilhaRow[])
      setTotal(count ?? 0)
      setSearching(false)
    }
    load()
  }, [ready, page, busca, estado])

  // reset page on filter change
  function handleBusca(v: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setPage(0); setBusca(v) }, 350)
  }
  function handleEstado(v: string) { setPage(0); setEstado(v) }

  const totalPages = Math.ceil(total / PER_PAGE)

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!ready) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

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
            {total} trilha{total !== 1 ? 's' : ''} no catálogo
          </p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ padding: '24px 32px 80px', maxWidth: 900, margin: '0 auto' }}>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
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
          <select
            value={estado}
            onChange={e => handleEstado(e.target.value)}
            style={{
              flex: '0 0 160px', background: '#fff', border: '1px solid #e5e5e5',
              borderRadius: 8, padding: '10px 12px', fontSize: 14,
              color: estado ? '#2a2e25' : '#888', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">Estado (todos)</option>
            {estados.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        {/* Lista */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, overflow: 'hidden', opacity: searching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {trilhas.length === 0 && !searching ? (
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
                  <th style={{ padding: '12px 20px', width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {trilhas.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: i < trilhas.length - 1 ? '0.5px solid #f4f5f0' : 'none' }}>
                    <td style={{ padding: '14px 20px', fontSize: 14, fontWeight: 600, color: '#2a2e25' }}>{t.name}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#6b7280' }}>
                      {t.localidade
                        ? `${t.localidade.estado}${t.localidade.cidade ? ` · ${t.localidade.cidade}` : ''}`
                        : t.regiao || '—'}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: t.mantenedor ? '#2a2e25' : '#d1d5db' }}>
                      {t.mantenedor ? (t.mantenedor.nome_primario ?? t.mantenedor.nome) : '—'}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <Link
                        href={`/trilhas/editar-aprovada/${t.id}`}
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
                    </td>
                  </tr>
                ))}
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
