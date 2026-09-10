'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconSearch, IconCheck, IconX } from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'

const T = {
  bg: '#F5F6F2', card: '#FFFFFF', border: 'rgba(0,0,0,.08)',
  primary: '#6d745f', text: '#1A1D18', muted: '#6d745f',
}

type TrilhaOpt = { id: string; name: string; regiao: string }

export default function NovaSelecaoPage() {
  const [nome, setNome] = useState('')
  const [data, setData] = useState('')
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<TrilhaOpt[]>([])
  const [selecionadas, setSelecionadas] = useState<TrilhaOpt[]>([])
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const hoje = new Date().toISOString().slice(0, 10)

  async function buscarTrilhas(q: string) {
    setBusca(q)
    if (q.trim().length < 2) { setResultados([]); return }
    setBuscando(true)
    const { data: rows } = await supabase
      .from('trilhas')
      .select('id, name, regiao')
      .eq('aprovada', true)
      .ilike('name', `%${q.trim()}%`)
      .limit(15)
    setResultados((rows ?? []).filter((t) => !selecionadas.some((s) => s.id === t.id)))
    setBuscando(false)
  }

  function adicionar(t: TrilhaOpt) {
    setSelecionadas((prev) => [...prev, t])
    setResultados((prev) => prev.filter((r) => r.id !== t.id))
  }

  function remover(id: string) {
    setSelecionadas((prev) => prev.filter((s) => s.id !== id))
  }

  async function salvar() {
    setErro(null)
    if (!nome.trim()) { setErro('Dê um nome pra seleção.'); return }
    if (!data) { setErro('Escolha a data.'); return }

    const user = await getClientUser()
    if (!user) { window.location.href = '/login'; return }

    setSalvando(true)
    const res = await fetch('/api/selecoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), data, trilha_ids: selecionadas.map((s) => s.id) }),
    })
    const json = await res.json()
    setSalvando(false)
    if (!res.ok) { setErro(json.error || 'Erro ao criar seleção.'); return }
    window.location.href = `/selecoes/${json.selecao.id}`
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '24px 16px 20px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link href="/selecoes" style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1px',
            color: 'rgba(154,160,147,.7)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
          }}>
            ← Seleções
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
            fontSize: 'clamp(28px, 5vw, 38px)', textTransform: 'uppercase',
            color: '#F4F3EF', lineHeight: 0.95, margin: 0,
          }}>
            Nova seleção
          </h1>
        </div>
      </div>

      <div style={{ padding: '20px 16px 100px', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>Nome</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Rolê de domingo"
            style={{
              width: '100%', boxSizing: 'border-box', marginTop: 6, marginBottom: 16,
              background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '10px 12px', fontSize: 14, color: T.text, outline: 'none',
            }}
          />

          <label style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>Data</label>
          <input
            type="date"
            value={data}
            min={hoje}
            onChange={(e) => setData(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', marginTop: 6,
              background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '10px 12px', fontSize: 14, color: T.text, outline: 'none',
            }}
          />
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>Trilhas</label>

          <div style={{ position: 'relative', marginTop: 8, marginBottom: 10 }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted }} />
            <input
              type="text"
              placeholder="Buscar trilha pelo nome…"
              value={busca}
              onChange={(e) => buscarTrilhas(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10,
                padding: '9px 12px 9px 36px', fontSize: 13, color: T.text, outline: 'none',
              }}
            />
          </div>

          {buscando && <p style={{ fontSize: 12, color: T.muted }}>Buscando…</p>}

          {resultados.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {resultados.map((t) => (
                <button key={t.id} onClick={() => adicionar(t)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#F8F9F5', border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: '9px 12px', fontSize: 13, color: T.text, cursor: 'pointer', textAlign: 'left',
                }}>
                  <span>{t.name} <span style={{ color: T.muted, fontSize: 11 }}>· {t.regiao}</span></span>
                  <IconCheck size={14} style={{ color: T.primary }} />
                </button>
              ))}
            </div>
          )}

          {selecionadas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {selecionadas.map((s) => (
                <span key={s.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'rgba(109,116,95,0.1)', border: `1px solid ${T.border}`,
                  borderRadius: 20, padding: '5px 10px', fontSize: 12, color: T.text,
                }}>
                  {s.name}
                  <button onClick={() => remover(s.id)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', display: 'flex', padding: 0 }}>
                    <IconX size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {erro && (
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', color: '#EF4444', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {erro}
          </div>
        )}

        <button
          onClick={salvar}
          disabled={salvando}
          style={{
            width: '100%', background: T.primary, color: '#fff', border: 'none', borderRadius: 14,
            padding: 14, fontSize: 15, fontWeight: 700, cursor: salvando ? 'not-allowed' : 'pointer',
            opacity: salvando ? 0.7 : 1,
          }}
        >
          {salvando ? 'Criando…' : 'Criar seleção'}
        </button>
      </div>
    </div>
  )
}
