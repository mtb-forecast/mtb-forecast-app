'use client'

import { useState } from 'react'

export type TrilhaPendente = {
  id: string
  name: string
  regiao: string
  lat: number
  lon: number
  altitude_m: number
  solo_type: string
  exposicao: string
  trail_type: string
  bioma?: string | null
  desnivel_m?: number | null
  extensao_km?: number | null
  link_referencia?: string | null
  observacoes?: string | null
  user_id: string
  status: string
  motivo_rejeicao?: string | null
  created_at: string
}

type Props = {
  trilhas: TrilhaPendente[]
  onAprovar: (p: TrilhaPendente) => Promise<void>
  onRejeitar: (id: string, motivo: string) => Promise<void>
}

export default function AdminPanel({ trilhas, onAprovar, onRejeitar }: Props) {
  const [rejeicao, setRejeicao] = useState<{ id: string; motivo: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function confirmarRejeicao() {
    if (!rejeicao) return
    setSaving(true)
    await onRejeitar(rejeicao.id, rejeicao.motivo)
    setSaving(false)
    setRejeicao(null)
  }

  if (trilhas.length === 0) {
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#888' }}>Nenhuma trilha pendente de aprovação.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Trilhas pendentes de cadastro</h2>
        <span style={{ fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e', borderRadius: 2, padding: '2px 8px' }}>
          {trilhas.length} pendente{trilhas.length > 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {trilhas.map(trilha => (
          <div key={trilha.id} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{trilha.name}</p>
                <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {trilha.regiao} · {new Date(trilha.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e', borderRadius: 2, padding: '2px 8px', flexShrink: 0 }}>
                PENDENTE
              </span>
            </div>

            {/* Dados */}
            <div style={{ padding: 20 }}>

              {/* Grid de campos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Solo', value: trilha.solo_type },
                  { label: 'Exposição', value: trilha.exposicao },
                  { label: 'Tipo', value: trilha.trail_type },
                  { label: 'Altitude', value: `${trilha.altitude_m}m` },
                  { label: 'Bioma', value: trilha.bioma || '—' },
                  { label: 'Desnível', value: trilha.desnivel_m ? `${trilha.desnivel_m}m` : '—' },
                  { label: 'Extensão', value: trilha.extensao_km ? `${trilha.extensao_km}km` : '—' },
                  { label: 'Lat', value: trilha.lat.toFixed(5) },
                  { label: 'Lon', value: trilha.lon.toFixed(5) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '8px 12px' }}>
                    <p style={{ fontSize: 10, color: '#888', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 3 }}>{label}</p>
                    <p style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Mapa */}
              <div style={{ marginBottom: 16 }}>
                <a
                  href={`https://www.google.com/maps?q=${trilha.lat},${trilha.lon}&z=15`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: '#f7f7f5', border: '0.5px solid #e5e5e5',
                    borderRadius: 4, padding: '8px 14px',
                    fontSize: 13, color: '#111', textDecoration: 'none',
                  }}
                >
                  📍 Ver localização no Google Maps ↗
                </a>
              </div>

              {/* Link de referência */}
              {trilha.link_referencia && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: '#888', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 }}>Link de referência</p>
                  <a
                    href={trilha.link_referencia}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: '#2563eb', wordBreak: 'break-all' }}
                  >
                    {trilha.link_referencia}
                  </a>
                </div>
              )}

              {/* Observações */}
              {trilha.observacoes && (
                <div style={{ background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 10, color: '#888', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Observações</p>
                  <p style={{ fontSize: 13, color: '#111' }}>{trilha.observacoes}</p>
                </div>
              )}

              {/* Ações */}
              <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '0.5px solid #e5e5e5' }}>
                <button
                  onClick={() => onAprovar(trilha)}
                  style={{
                    flex: 1, background: '#FFE000', color: '#111',
                    border: '1.5px solid #111', borderRadius: 4,
                    padding: '9px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  ✓ Aprovar
                </button>
                <button
                  onClick={() => setRejeicao({ id: trilha.id, motivo: '' })}
                  style={{
                    flex: 1, background: '#fff', color: '#ef4444',
                    border: '1px solid #ef4444', borderRadius: 4,
                    padding: '9px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  ✕ Rejeitar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de rejeição */}
      {rejeicao && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 24,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 440, width: '100%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111', marginBottom: 8 }}>Rejeitar trilha</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Informe o motivo para o usuário saber como corrigir.</p>
            <textarea
              value={rejeicao.motivo}
              onChange={e => setRejeicao(r => r ? { ...r, motivo: e.target.value } : null)}
              placeholder="Ex: coordenadas incorretas, trilha duplicada, informações insuficientes..."
              rows={4}
              className="input-field"
              style={{ width: '100%', resize: 'vertical', marginBottom: 16, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setRejeicao(null)}
                style={{ flex: 1, background: '#fff', color: '#888', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '10px 0', fontSize: 13, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRejeicao}
                disabled={saving || !rejeicao.motivo.trim()}
                style={{
                  flex: 1, background: '#ef4444', color: '#fff',
                  border: 'none', borderRadius: 4, padding: '10px 0',
                  fontSize: 13, fontWeight: 500,
                  cursor: saving || !rejeicao.motivo.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving || !rejeicao.motivo.trim() ? 0.6 : 1,
                }}
              >
                {saving ? 'Rejeitando...' : 'Confirmar rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
