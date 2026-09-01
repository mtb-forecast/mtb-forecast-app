'use client'

import { useEffect, useRef, useState } from 'react'
import { IconTrash, IconSearch } from '@tabler/icons-react'
import { supabase } from '@/lib/supabase'

type Segmento = { id: string; ordem: number; trilha: { id: string; name: string } }
type Sugestao = { id: string; name: string }

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#fff', border: '1.5px solid #e5e5e5',
  borderRadius: 8, padding: '10px 14px',
  fontSize: 14, color: '#2a2e25', outline: 'none',
}

type Props = { trilhaId: string }

export default function TrilhaSegmentosEditor({ trilhaId }: Props) {
  const [segmentos, setSegmentos] = useState<Segmento[]>([])
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [buscando, setBuscando]   = useState(false)
  const [erro, setErro]           = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function carregar() {
    setLoading(true)
    const res = await fetch(`/api/admin/trilha-segmentos?trilha_composta_id=${trilhaId}`)
    const json = await res.json()
    if (res.ok) setSegmentos(json.segmentos ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [trilhaId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!busca.trim()) { setSugestoes([]); return }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      const jaAdicionadas = segmentos.map(s => s.trilha.id)
      const { data } = await supabase
        .from('trilhas')
        .select('id, name')
        .ilike('name', `%${busca.trim()}%`)
        .eq('aprovada', true)
        .neq('id', trilhaId)
        .limit(8)
      setBuscando(false)
      setSugestoes(((data ?? []) as Sugestao[]).filter(t => !jaAdicionadas.includes(t.id)))
    }, 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  async function adicionar(t: Sugestao) {
    setErro(null)
    const res = await fetch('/api/admin/trilha-segmentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilha_composta_id: trilhaId, trilha_componente_id: t.id, ordem: segmentos.length }),
    })
    const json = await res.json()
    if (!res.ok) { setErro(json.error ?? 'Erro ao adicionar trecho.'); return }
    setBusca('')
    setSugestoes([])
    carregar()
  }

  async function remover(id: string) {
    setErro(null)
    const res = await fetch('/api/admin/trilha-segmentos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { const json = await res.json(); setErro(json.error ?? 'Erro ao remover trecho.'); return }
    setSegmentos(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
        Se esta trilha for um percurso longo que passa por trechos já cadastrados como
        trilhas próprias, adicione-os aqui. O veredicto exibido nesta página passa a ser
        o pior caso entre esta trilha e os trechos abaixo.
      </p>

      {erro && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          {erro}
        </div>
      )}

      {!loading && segmentos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {segmentos.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f4f5f0', border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 10px',
            }}>
              <span style={{ flex: 1, fontSize: 13.5, color: '#2a2e25' }}>{s.trilha.name}</span>
              <button
                type="button"
                onClick={() => remover(s.id)}
                style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4, display: 'flex' }}
                title="Remover trecho"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar trilha já cadastrada para adicionar como trecho…"
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>
        {busca.trim() && (
          <div style={{
            marginTop: 6, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
            overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)',
          }}>
            {buscando && <p style={{ fontSize: 12, color: '#9ca3af', padding: '10px 14px', margin: 0 }}>Buscando…</p>}
            {!buscando && sugestoes.length === 0 && (
              <p style={{ fontSize: 12, color: '#9ca3af', padding: '10px 14px', margin: 0 }}>Nenhuma trilha encontrada.</p>
            )}
            {!buscando && sugestoes.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => adicionar(t)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                  border: 'none', borderBottom: '1px solid #f0f0f0', padding: '9px 14px',
                  fontSize: 13.5, color: '#2a2e25', cursor: 'pointer',
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
