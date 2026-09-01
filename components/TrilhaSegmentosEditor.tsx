'use client'

import { useEffect, useRef, useState } from 'react'
import { IconTrash, IconSearch, IconSparkles } from '@tabler/icons-react'
import { supabase } from '@/lib/supabase'
import { decodePolyline } from '@/lib/polyline'

type Segmento = { id: string; ordem: number; trilha: { id: string; name: string } }
type Sugestao = { id: string; name: string }
type SugestaoAuto = Sugestao & { distM: number }

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#fff', border: '1.5px solid #e5e5e5',
  borderRadius: 8, padding: '10px 14px',
  fontSize: 14, color: '#2a2e25', outline: 'none',
}

// Raio de sugestão: trilhas cujo ponto cadastrado cai a até 300m da polyline
// da trilha composta são candidatas a trecho. Aproximação por distância até o
// vértice mais próximo (não o segmento exato) -- suficiente na prática porque
// polylines de GPX/Strava costumam ser densas; ver CLAUDE.md.
const RAIO_SUGESTAO_M = 300

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanciaAtePolyline(lat: number, lon: number, pontos: [number, number][]): number {
  let min = Infinity
  for (const [pLat, pLon] of pontos) {
    const d = haversineM(lat, lon, pLat, pLon)
    if (d < min) min = d
  }
  return min
}

type Props = { trilhaId: string; polyline: string | null }

export default function TrilhaSegmentosEditor({ trilhaId, polyline }: Props) {
  const [segmentos, setSegmentos] = useState<Segmento[]>([])
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [buscando, setBuscando]   = useState(false)
  const [erro, setErro]           = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sugestão automática por proximidade geométrica
  const [sugestoesAuto, setSugestoesAuto] = useState<SugestaoAuto[] | null>(null)
  const [sugerindo, setSugerindo]         = useState(false)
  const [sugestaoErro, setSugestaoErro]   = useState<string | null>(null)

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
    setSugestoesAuto(prev => prev?.filter(s => s.id !== t.id) ?? null)
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

  async function sugerirTrechos() {
    setSugestaoErro(null)
    if (!polyline) { setSugestaoErro('Esta trilha ainda não tem uma rota GPX importada — sem traçado não dá pra sugerir trechos.'); return }

    setSugerindo(true)
    try {
      const pontos = decodePolyline(polyline)
      const jaAdicionadas = segmentos.map(s => s.trilha.id)

      const { data, error } = await supabase
        .from('trilhas')
        .select('id, name, lat, lon')
        .eq('aprovada', true)
        .neq('id', trilhaId)

      if (error) { setSugestaoErro('Erro ao buscar trilhas do catálogo.'); return }

      const candidatas = ((data ?? []) as { id: string; name: string; lat: number; lon: number }[])
        .filter(t => !jaAdicionadas.includes(t.id))
        .map(t => ({ id: t.id, name: t.name, distM: distanciaAtePolyline(t.lat, t.lon, pontos) }))
        .filter(t => t.distM <= RAIO_SUGESTAO_M)
        .sort((a, b) => a.distM - b.distM)
        .slice(0, 15)

      setSugestoesAuto(candidatas)
    } finally {
      setSugerindo(false)
    }
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

      {/* ── Sugestão automática por proximidade da rota GPX ── */}
      <div>
        <button
          type="button"
          onClick={sugerirTrechos}
          disabled={sugerindo}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: sugerindo ? '#8a9280' : '#2a2e25', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
            cursor: sugerindo ? 'not-allowed' : 'pointer',
          }}
        >
          <IconSparkles size={14} />
          {sugerindo ? 'Analisando rota…' : 'Sugerir trechos pela rota GPX'}
        </button>

        {sugestaoErro && (
          <p style={{ fontSize: 12, color: '#dc2626', margin: '8px 0 0' }}>{sugestaoErro}</p>
        )}

        {sugestoesAuto && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sugestoesAuto.length === 0 && (
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
                Nenhuma trilha do catálogo encontrada a até {RAIO_SUGESTAO_M}m da rota.
              </p>
            )}
            {sugestoesAuto.map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 10px',
              }}>
                <span style={{ flex: 1, fontSize: 13.5, color: '#2a2e25' }}>{s.name}</span>
                <span style={{ fontSize: 11, color: '#15803d', fontFamily: 'var(--font-dm-mono)', whiteSpace: 'nowrap' }}>
                  a {Math.round(s.distM)}m da rota
                </span>
                <button
                  type="button"
                  onClick={() => adicionar(s)}
                  style={{
                    background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6,
                    padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Adicionar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Ou busque manualmente uma trilha para adicionar como trecho…"
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
