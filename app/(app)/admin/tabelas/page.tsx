'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'
import { getSoloTypes, getExposicoes, getBiomas } from '@/lib/domain'

type TabelaSolo = {
  id: string
  solo_type: string
  bioma: string
  regiao: string
  clay_pct: number
  sand_pct: number
  texture_class: string
}

type TabelaThreshold = {
  id: string
  regiao: string
  mes: number
  threshold_descansado: number
  threshold_saturado: number
}

type TabelaMeiaVida = {
  id: string
  solo_type: string
  exposicao: string
  meia_vida_h: number
}

type Aprovacao = {
  id: string
  solicitante_id: string
  aprovador_id: string
  tabela: string
  operacao: string
  dados_anteriores: Record<string, unknown>
  dados_novos: Record<string, unknown>
  status: string
  created_at: string
  solicitante?: { nome: string | null; apelido: string | null; email: string | null }
}

type ModalState = {
  tabela: string
  operacao: 'update' | 'insert'
  dadosAnteriores: Record<string, unknown>
  dadosNovos: Record<string, unknown>
  motivo: string
  submitting: boolean
}

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const TEXTURE_OPTIONS = ['Argiloso', 'Muito argiloso', 'Argilo-arenoso', 'Franco-argiloso', 'Franco', 'Franco-arenoso', 'Arenoso']

export default function TabelasPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'solo' | 'threshold' | 'meiavida'>('solo')

  const [solo, setSolo] = useState<TabelaSolo[]>([])
  const [threshold, setThreshold] = useState<TabelaThreshold[]>([])
  const [meiaVida, setMeiaVida] = useState<TabelaMeiaVida[]>([])
  const [aprovacoes, setAprovacoes] = useState<Aprovacao[]>([])
  const [pendentesIds, setPendentesIds] = useState<Set<string>>(new Set())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, unknown>>({})
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState<Record<string, unknown>>({})

  const [modal, setModal] = useState<ModalState | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectMotivo, setRejectMotivo] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const [soloTypes, setSoloTypes] = useState<string[]>([])
  const [exposicoesVals, setExposicoesVals] = useState<string[]>([])
  const [biomaOpts, setBiomaOpts] = useState<string[]>([])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/dashboard'); return }

      setUserId(user.id)
      const [s, e, b] = await Promise.all([getSoloTypes(), getExposicoes(), getBiomas()])
      setSoloTypes(s)
      setExposicoesVals(e.map(x => x.valor))
      setBiomaOpts(b)
      await Promise.all([
        loadSolo(),
        loadThreshold(),
        loadMeiaVida(),
        loadAprovacoes(user.id),
      ])
      setLoading(false)
    }
    load()
  }, [router])

  async function loadSolo() {
    const { data } = await supabase.from('tabela_solo').select('*').order('solo_type').order('bioma').order('regiao')
    setSolo(data || [])
  }
  async function loadThreshold() {
    const { data } = await supabase.from('threshold_sazonal').select('*').order('regiao').order('mes')
    setThreshold(data || [])
  }
  async function loadMeiaVida() {
    const { data } = await supabase.from('meia_vida_secagem').select('*').order('solo_type').order('exposicao')
    setMeiaVida(data || [])
  }
  async function loadAprovacoes(uid: string) {
    const { data } = await supabase
      .from('admin_aprovacoes')
      .select('*, solicitante:solicitante_id(nome, apelido, email)')
      .eq('aprovador_id', uid)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
    const list = (data || []) as Aprovacao[]
    setAprovacoes(list)
    const { data: minhasSolic } = await supabase
      .from('admin_aprovacoes')
      .select('dados_anteriores')
      .eq('solicitante_id', uid)
      .eq('status', 'pendente')
    const ids = new Set<string>()
    for (const s of minhasSolic || []) {
      const id = (s.dados_anteriores as Record<string, unknown>)?.id as string
      if (id) ids.add(id)
    }
    setPendentesIds(ids)
  }

  function startEdit(row: Record<string, unknown>) {
    setEditingId(row.id as string)
    setEditValues({ ...row })
    setAddingRow(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValues({})
  }

  function openModal(dadosAnteriores: Record<string, unknown>, dadosNovos: Record<string, unknown>, tabela: string, operacao: 'update' | 'insert') {
    setModal({ tabela, operacao, dadosAnteriores, dadosNovos, motivo: '', submitting: false })
  }

  async function enviarParaAprovacao() {
    if (!modal || !userId) return
    if (modal.motivo.trim().length < 20) return
    setModal(m => m ? { ...m, submitting: true } : null)

    const { data: outroAdmin } = await supabase
      .from('profiles').select('id').eq('is_admin', true).neq('id', userId).single()

    if (!outroAdmin) {
      showToast('Erro: nenhum outro admin encontrado.')
      setModal(m => m ? { ...m, submitting: false } : null)
      return
    }

    await supabase.from('admin_aprovacoes').insert({
      solicitante_id: userId,
      aprovador_id: outroAdmin.id,
      tabela: modal.tabela,
      operacao: modal.operacao,
      dados_anteriores: modal.dadosAnteriores,
      dados_novos: modal.dadosNovos,
      status: 'pendente',
    })

    const editedId = modal.dadosAnteriores?.id as string | undefined
    if (editedId) setPendentesIds(prev => new Set([...prev, editedId]))
    setModal(null)
    setEditingId(null)
    setEditValues({})
    setAddingRow(false)
    setNewRow({})
    showToast('✓ Solicitação enviada! Aguardando aprovação.')
  }

  async function aprovarAprovacao(apr: Aprovacao) {
    if (apr.operacao === 'update') {
      await supabase.from(apr.tabela).update(apr.dados_novos).eq('id', (apr.dados_anteriores as Record<string, unknown>).id)
    } else {
      await supabase.from(apr.tabela).insert(apr.dados_novos)
    }
    await supabase.from('admin_aprovacoes').update({ status: 'aprovada' }).eq('id', apr.id)
    setAprovacoes(prev => prev.filter(a => a.id !== apr.id))
    if (apr.tabela === 'tabela_solo') loadSolo()
    if (apr.tabela === 'threshold_sazonal') loadThreshold()
    if (apr.tabela === 'meia_vida_secagem') loadMeiaVida()
    showToast('✓ Alteração aprovada e aplicada!')
  }

  async function rejeitarAprovacao(apr: Aprovacao) {
    if (!rejectMotivo.trim()) return
    await supabase.from('admin_aprovacoes').update({ status: 'rejeitada', motivo_rejeicao: rejectMotivo }).eq('id', apr.id)
    setAprovacoes(prev => prev.filter(a => a.id !== apr.id))
    setRejectingId(null)
    setRejectMotivo('')
    showToast('Solicitação rejeitada.')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#111', borderBottom: '0.5px solid #f0f0f0', verticalAlign: 'middle' }
  const thStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '1px', background: '#f7f7f5', borderBottom: '0.5px solid #e5e5e5', textAlign: 'left' as const, cursor: 'help' }
  const inputSm: React.CSSProperties = { border: '1px solid #e5e5e5', borderRadius: 4, padding: '4px 8px', fontSize: 13, width: '100%', outline: 'none', background: '#fff' }
  const btnSm = (bg: string, color: string): React.CSSProperties => ({
    background: bg, color, border: 'none', borderRadius: 4,
    padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  })
  const hintStyle: React.CSSProperties = { fontSize: 11, color: '#888', marginTop: 3 }

  const legendFieldStyle: React.CSSProperties = { fontSize: 11 }
  const legendKeyStyle: React.CSSProperties = { fontWeight: 600, color: '#111', fontFamily: 'monospace', fontSize: 11 }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* Header */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Tabelas Mestras</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>Alterações requerem aprovação de outro admin</p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 200, background: '#111', color: '#fff', borderRadius: 6, padding: '12px 20px', fontSize: 13, fontWeight: 500 }}>
            {toast}
          </div>
        )}

        {/* Aprovações pendentes */}
        {aprovacoes.length > 0 && (
          <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, padding: 16, marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#854d0e', marginBottom: 12 }}>⏳ Aguardando sua aprovação ({aprovacoes.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aprovacoes.map(apr => {
                const solNome = apr.solicitante?.apelido || apr.solicitante?.nome || apr.solicitante?.email || 'Admin'
                const isRejecting = rejectingId === apr.id
                return (
                  <div key={apr.id} style={{ background: '#fff', border: '0.5px solid #fde047', borderRadius: 6, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 4 }}>
                          <span style={{ color: '#854d0e' }}>{solNome}</span> quer {apr.operacao === 'insert' ? 'inserir' : 'editar'} em <code style={{ background: '#f7f7f5', borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>{apr.tabela}</code>
                        </p>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, fontSize: 12, color: '#555' }}>
                          {apr.operacao === 'update' && Object.keys(apr.dados_novos).filter(k => k !== 'id').map(k => (
                            <span key={k}><b>{k}:</b> {String(apr.dados_anteriores[k])} → <b style={{ color: '#111' }}>{String(apr.dados_novos[k])}</b></span>
                          ))}
                          {apr.operacao === 'insert' && Object.entries(apr.dados_novos).map(([k, v]) => (
                            <span key={k}><b>{k}:</b> {String(v)}</span>
                          ))}
                        </div>
                        <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{new Date(apr.created_at).toLocaleString('pt-BR')}</p>
                      </div>
                      {!isRejecting && (
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button onClick={() => aprovarAprovacao(apr)} style={{ ...btnSm('#16a34a', '#fff'), padding: '6px 14px' }}>Aprovar</button>
                          <button onClick={() => { setRejectingId(apr.id); setRejectMotivo('') }} style={{ ...btnSm('#ef4444', '#fff'), padding: '6px 14px' }}>Rejeitar</button>
                        </div>
                      )}
                    </div>
                    {isRejecting && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={rejectMotivo}
                          onChange={e => setRejectMotivo(e.target.value)}
                          placeholder="Motivo da rejeição (obrigatório)"
                          style={{ ...inputSm, flex: 1 }}
                          autoFocus
                        />
                        <button onClick={() => rejeitarAprovacao(apr)} disabled={!rejectMotivo.trim()} style={{ ...btnSm('#ef4444', '#fff'), opacity: rejectMotivo.trim() ? 1 : 0.5 }}>Confirmar</button>
                        <button onClick={() => setRejectingId(null)} style={btnSm('#e5e5e5', '#111')}>Cancelar</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid #e5e5e5', marginBottom: 20 }}>
          {([
            { key: 'solo', label: 'Solo' },
            { key: 'threshold', label: 'Thresholds Sazonais' },
            { key: 'meiavida', label: 'Meia-vida de Secagem' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); cancelEdit(); setAddingRow(false) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 20px', fontSize: 13,
                color: tab === t.key ? '#111' : '#888',
                fontWeight: tab === t.key ? 500 : 400,
                borderBottom: tab === t.key ? '2px solid #111' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Solo ──────────────────────────────────────────────── */}
        {tab === 'solo' && (
          <>
            {/* Legend card */}
            <div style={{ background: '#f7f7f5', borderRadius: 8, padding: 16, marginBottom: 16, border: '0.5px solid #e5e5e5' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#111', marginBottom: 10 }}>Como interpretar esta tabela</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>solo_type</span><br /><span style={{ color: '#555' }}>Tipo de solo da trilha definido no cadastro. Ex: terra, misto, pedra, ferro, misto_mg, preto</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>bioma</span><br /><span style={{ color: '#555' }}>Bioma onde a trilha está localizada. Use TODOS para aplicar a todos os biomas daquele solo_type</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>regiao</span><br /><span style={{ color: '#555' }}>Estado da trilha (SP, MG, RJ...). Use TODOS para aplicar a todos os estados</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>clay_pct</span><br /><span style={{ color: '#555' }}>Percentual de argila (0-100%). Quanto maior, mais o solo retém água e demora para secar</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>sand_pct</span><br /><span style={{ color: '#555' }}>Percentual de areia (0-100%). Quanto maior, mais rápido o solo drena após chuva</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>texture_class</span><br /><span style={{ color: '#555' }}>Classificação textural do solo. Opções: Argiloso, Muito argiloso, Franco-argiloso, Franco, Franco-arenoso, Arenoso</span></div>
              </div>
              <div style={{ background: '#fff', borderLeft: '3px solid #FFE000', padding: '8px 12px', marginTop: 12, fontSize: 11, color: '#555' }}>
                ⚡ Prioridade de lookup: 1º match exato (solo+bioma+regiao) → 2º match (solo+bioma+TODOS) → 3º match (solo+TODOS+TODOS)
              </div>
            </div>

            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle} title="Tipo de solo da trilha. Ex: terra, misto, pedra, ferro, misto_mg, preto">solo_type</th>
                      <th style={thStyle} title="Bioma da trilha. Use TODOS como fallback para todos os biomas deste solo_type">bioma</th>
                      <th style={thStyle} title="Estado da trilha (SP, MG, RJ...). Use TODOS como fallback para todos os estados">regiao</th>
                      <th style={thStyle} title="% de argila (0-100). Quanto maior, mais o solo retém água e demora para secar">clay_pct</th>
                      <th style={thStyle} title="% de areia (0-100). Quanto maior, mais rápido o solo drena após chuva">sand_pct</th>
                      <th style={thStyle} title="Classificação textural: Argiloso / Muito argiloso / Franco-argiloso / Franco / Franco-arenoso / Arenoso">texture_class</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {solo.map(row => {
                      const isEditing = editingId === row.id
                      const isPendente = pendentesIds.has(row.id)
                      return (
                        <tr key={row.id} style={{ background: isPendente ? '#fefce8' : isEditing ? '#f7f7f5' : '#fff' }}>
                          <td style={tdStyle}>{row.solo_type}</td>
                          <td style={tdStyle}>{row.bioma}</td>
                          <td style={tdStyle}>{row.regiao}</td>
                          <td style={tdStyle}>
                            {isEditing
                              ? <input type="number" value={editValues.clay_pct as number} onChange={e => setEditValues(v => ({ ...v, clay_pct: +e.target.value }))} style={{ ...inputSm, width: 70 }} />
                              : row.clay_pct}
                          </td>
                          <td style={tdStyle}>
                            {isEditing
                              ? <input type="number" value={editValues.sand_pct as number} onChange={e => setEditValues(v => ({ ...v, sand_pct: +e.target.value }))} style={{ ...inputSm, width: 70 }} />
                              : row.sand_pct}
                          </td>
                          <td style={tdStyle}>
                            {isEditing
                              ? <select value={editValues.texture_class as string} onChange={e => setEditValues(v => ({ ...v, texture_class: e.target.value }))} style={inputSm}>
                                  {TEXTURE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                                </select>
                              : row.texture_class}
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            {isPendente && !isEditing && <span style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', borderRadius: 3, padding: '2px 6px', marginRight: 6 }}>⏳ Pendente</span>}
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => openModal({ ...row } as unknown as Record<string, unknown>, { ...editValues }, 'tabela_solo', 'update')} style={btnSm('#FFE000', '#111')}>Salvar</button>
                                <button onClick={cancelEdit} style={btnSm('#e5e5e5', '#111')}>Cancelar</button>
                              </div>
                            ) : (
                              !isPendente && <button onClick={() => startEdit(row as unknown as Record<string, unknown>)} style={btnSm('#f7f7f5', '#111')}>Editar</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {addingRow ? (
                <div style={{ padding: 16, borderTop: '0.5px solid #e5e5e5', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>solo_type</label>
                    <select value={newRow.solo_type as string || ''} onChange={e => setNewRow(v => ({ ...v, solo_type: e.target.value }))} style={{ ...inputSm, width: 110 }}>
                      <option value="">--</option>
                      {soloTypes.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <p style={hintStyle}>Ex: terra, ferro</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>bioma</label>
                    <select value={newRow.bioma as string || ''} onChange={e => setNewRow(v => ({ ...v, bioma: e.target.value }))} style={{ ...inputSm, width: 140 }}>
                      <option value="">--</option>
                      {[...biomaOpts, 'TODOS'].map(o => <option key={o}>{o}</option>)}
                    </select>
                    <p style={hintStyle}>TODOS = todos os biomas</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>regiao</label>
                    <select value={newRow.regiao as string || ''} onChange={e => setNewRow(v => ({ ...v, regiao: e.target.value }))} style={{ ...inputSm, width: 90 }}>
                      <option value="">--</option>
                      <option value="TODOS">TODOS</option>
                      {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.value}</option>)}
                    </select>
                    <p style={hintStyle}>TODOS = todos os estados</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>clay_pct</label>
                    <input type="number" placeholder="Ex: 45" value={newRow.clay_pct as number || ''} onChange={e => setNewRow(v => ({ ...v, clay_pct: +e.target.value }))} style={{ ...inputSm, width: 70 }} />
                    <p style={hintStyle}>% argila (0–100)</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>sand_pct</label>
                    <input type="number" placeholder="Ex: 30" value={newRow.sand_pct as number || ''} onChange={e => setNewRow(v => ({ ...v, sand_pct: +e.target.value }))} style={{ ...inputSm, width: 70 }} />
                    <p style={hintStyle}>% areia (0–100)</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>texture_class</label>
                    <select value={newRow.texture_class as string || ''} onChange={e => setNewRow(v => ({ ...v, texture_class: e.target.value }))} style={{ ...inputSm, width: 150 }}>
                      <option value="">--</option>
                      {TEXTURE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <p style={hintStyle}>Classificação textural</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingTop: 16 }}>
                    <button onClick={() => openModal({}, newRow, 'tabela_solo', 'insert')} style={btnSm('#FFE000', '#111')}>Enviar</button>
                    <button onClick={() => { setAddingRow(false); setNewRow({}) }} style={btnSm('#e5e5e5', '#111')}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderTop: '0.5px solid #e5e5e5' }}>
                  <button onClick={() => { setAddingRow(true); setNewRow({}); cancelEdit() }} style={{ ...btnSm('#f7f7f5', '#111'), fontSize: 13 }}>+ Adicionar linha</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB: Threshold ─────────────────────────────────────────── */}
        {tab === 'threshold' && (
          <>
            {/* Legend card */}
            <div style={{ background: '#f7f7f5', borderRadius: 8, padding: 16, marginBottom: 16, border: '0.5px solid #e5e5e5' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#111', marginBottom: 10 }}>Como interpretar esta tabela</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>regiao</span><br /><span style={{ color: '#555' }}>Estado onde as trilhas estão localizadas. Use DEFAULT como fallback para estados não mapeados</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>mes</span><br /><span style={{ color: '#555' }}>Mês do ano (1=Janeiro ... 12=Dezembro)</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>threshold_descansado</span><br /><span style={{ color: '#555' }}>Acúmulo efetivo de chuva (mm) abaixo do qual o solo é considerado DESCANSADO. Valores típicos: 2–8 mm dependendo da estação</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>threshold_saturado</span><br /><span style={{ color: '#555' }}>Acúmulo efetivo de chuva (mm) acima do qual o bike park é considerado SATURADO. Valores típicos: 6–16 mm</span></div>
              </div>
              <div style={{ background: '#fff', borderLeft: '3px solid #FFE000', padding: '8px 12px', marginTop: 12, fontSize: 11, color: '#555' }}>
                🌧 Esses thresholds variam por estação — no inverno seco (Jun–Set) o solo aguenta mais chuva antes de saturar. No verão úmido (Nov–Mar) os limites são menores pois o solo já está mais úmido.
              </div>
              <div style={{ background: '#fff', borderLeft: '3px solid #e5e5e5', padding: '8px 12px', marginTop: 8, fontSize: 11, color: '#555' }}>
                📊 Os valores são multiplicados pelo fator ENSO automaticamente: El Niño Forte × 0.75 | El Niño × 0.85 | Neutro × 1.0 | La Niña × 1.15 | La Niña Forte × 1.25
              </div>
            </div>

            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle} title="Estado da trilha. Use DEFAULT como fallback para estados não mapeados">regiao</th>
                      <th style={thStyle} title="Mês do ano (1 = Janeiro, 12 = Dezembro)">mês</th>
                      <th style={thStyle} title="Acúmulo de chuva (mm) abaixo do qual o solo é DESCANSADO. Valores típicos: 2–8 mm">threshold_descansado</th>
                      <th style={thStyle} title="Acúmulo de chuva (mm) acima do qual o bike park é SATURADO. Valores típicos: 6–16 mm">threshold_saturado</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {threshold.map(row => {
                      const isEditing = editingId === row.id
                      const isPendente = pendentesIds.has(row.id)
                      return (
                        <tr key={row.id} style={{ background: isPendente ? '#fefce8' : isEditing ? '#f7f7f5' : '#fff' }}>
                          <td style={tdStyle}>{row.regiao}</td>
                          <td style={tdStyle}>{MESES[row.mes] || row.mes}</td>
                          <td style={tdStyle}>
                            {isEditing
                              ? <input type="number" step="0.1" value={editValues.threshold_descansado as number} onChange={e => setEditValues(v => ({ ...v, threshold_descansado: +e.target.value }))} style={{ ...inputSm, width: 90 }} />
                              : row.threshold_descansado}
                          </td>
                          <td style={tdStyle}>
                            {isEditing
                              ? <input type="number" step="0.1" value={editValues.threshold_saturado as number} onChange={e => setEditValues(v => ({ ...v, threshold_saturado: +e.target.value }))} style={{ ...inputSm, width: 90 }} />
                              : row.threshold_saturado}
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            {isPendente && !isEditing && <span style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', borderRadius: 3, padding: '2px 6px', marginRight: 6 }}>⏳ Pendente</span>}
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => openModal({ ...row } as unknown as Record<string, unknown>, { ...editValues }, 'threshold_sazonal', 'update')} style={btnSm('#FFE000', '#111')}>Salvar</button>
                                <button onClick={cancelEdit} style={btnSm('#e5e5e5', '#111')}>Cancelar</button>
                              </div>
                            ) : (
                              !isPendente && <button onClick={() => startEdit(row as unknown as Record<string, unknown>)} style={btnSm('#f7f7f5', '#111')}>Editar</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {addingRow ? (
                <div style={{ padding: 16, borderTop: '0.5px solid #e5e5e5', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>regiao</label>
                    <select value={newRow.regiao as string || ''} onChange={e => setNewRow(v => ({ ...v, regiao: e.target.value }))} style={{ ...inputSm, width: 90 }}>
                      <option value="">--</option>
                      <option value="DEFAULT">DEFAULT</option>
                      {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.value}</option>)}
                    </select>
                    <p style={hintStyle}>DEFAULT = fallback</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>mês</label>
                    <select value={newRow.mes as number || ''} onChange={e => setNewRow(v => ({ ...v, mes: +e.target.value }))} style={{ ...inputSm, width: 120 }}>
                      <option value="">--</option>
                      {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                    <p style={hintStyle}>1 = Jan, 12 = Dez</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>threshold_descansado</label>
                    <input type="number" step="0.1" placeholder="Ex: 4.0" value={newRow.threshold_descansado as number || ''} onChange={e => setNewRow(v => ({ ...v, threshold_descansado: +e.target.value }))} style={{ ...inputSm, width: 90 }} />
                    <p style={hintStyle}>mm (típico: 2–8)</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>threshold_saturado</label>
                    <input type="number" step="0.1" placeholder="Ex: 10.0" value={newRow.threshold_saturado as number || ''} onChange={e => setNewRow(v => ({ ...v, threshold_saturado: +e.target.value }))} style={{ ...inputSm, width: 90 }} />
                    <p style={hintStyle}>mm (típico: 6–16)</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingTop: 16 }}>
                    <button onClick={() => openModal({}, newRow, 'threshold_sazonal', 'insert')} style={btnSm('#FFE000', '#111')}>Enviar</button>
                    <button onClick={() => { setAddingRow(false); setNewRow({}) }} style={btnSm('#e5e5e5', '#111')}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderTop: '0.5px solid #e5e5e5' }}>
                  <button onClick={() => { setAddingRow(true); setNewRow({}); cancelEdit() }} style={{ ...btnSm('#f7f7f5', '#111'), fontSize: 13 }}>+ Adicionar</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAB: Meia-vida ─────────────────────────────────────────── */}
        {tab === 'meiavida' && (
          <>
            {/* Legend card */}
            <div style={{ background: '#f7f7f5', borderRadius: 8, padding: 16, marginBottom: 16, border: '0.5px solid #e5e5e5' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#111', marginBottom: 10 }}>Como interpretar esta tabela</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', marginBottom: 12 }}>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>solo_type</span><br /><span style={{ color: '#555' }}>Tipo de solo. Cada combinação solo+exposição tem uma taxa de secagem diferente</span></div>
                <div style={legendFieldStyle}><span style={legendKeyStyle}>exposicao</span><br /><span style={{ color: '#555' }}>aberta = sol direto, vento, sem cobertura vegetal / fechada = mata densa, sombra constante</span></div>
                <div style={{ ...legendFieldStyle, gridColumn: '1 / -1' }}><span style={legendKeyStyle}>meia_vida_h</span><br /><span style={{ color: '#555' }}>Tempo em horas para o solo perder metade da umidade acumulada. Ex: 36h significa que após 36h sem chuva, metade da água ainda está retida no solo</span></div>
              </div>
              <div style={{ background: '#f0fdf4', borderLeft: '3px solid #22c55e', padding: '8px 12px', fontSize: 11, color: '#555', marginBottom: 10 }}>
                🌡 A meia-vida é ajustada automaticamente pelo clima: temperatura alta acelera a secagem, alta umidade relativa retarda. Solo em Mata Atlântica recebe multiplicador adicional de 1.10–1.20x
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 6, padding: '10px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Escala de referência</p>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 12px', fontSize: 11, color: '#555' }}>
                  <span style={{ fontWeight: 600, color: '#111' }}>6–8h</span><span>Pedra/ferro aberto — seca muito rápido (após 1 dia ≈ seco)</span>
                  <span style={{ fontWeight: 600, color: '#111' }}>14–18h</span><span>Solo ferroso fechado / misto aberto — secagem moderada</span>
                  <span style={{ fontWeight: 600, color: '#111' }}>24–28h</span><span>Terra aberta / misto fechado — secagem lenta</span>
                  <span style={{ fontWeight: 600, color: '#111' }}>36h</span><span>Terra fechada — secagem muito lenta (referência máxima)</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle} title="Tipo de solo. Cada combinação solo+exposição tem taxa de secagem diferente">solo_type</th>
                      <th style={thStyle} title="aberta = sol direto, sem cobertura vegetal / semi-aberta = vegetação rala / fechada = mata densa, sombra constante">exposicao</th>
                      <th style={thStyle} title="Horas para o solo perder metade da umidade. Ex: 36h = após 36h sem chuva, metade da água ainda está no solo">meia_vida_h</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {meiaVida.map(row => {
                      const isEditing = editingId === row.id
                      const isPendente = pendentesIds.has(row.id)
                      return (
                        <tr key={row.id} style={{ background: isPendente ? '#fefce8' : isEditing ? '#f7f7f5' : '#fff' }}>
                          <td style={tdStyle}>{row.solo_type}</td>
                          <td style={tdStyle}>{row.exposicao}</td>
                          <td style={tdStyle}>
                            {isEditing
                              ? <input type="number" step="0.5" value={editValues.meia_vida_h as number} onChange={e => setEditValues(v => ({ ...v, meia_vida_h: +e.target.value }))} style={{ ...inputSm, width: 80 }} />
                              : row.meia_vida_h}
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                            {isPendente && !isEditing && <span style={{ fontSize: 11, background: '#fef9c3', color: '#854d0e', borderRadius: 3, padding: '2px 6px', marginRight: 6 }}>⏳ Pendente</span>}
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => openModal({ ...row } as unknown as Record<string, unknown>, { ...editValues }, 'meia_vida_secagem', 'update')} style={btnSm('#FFE000', '#111')}>Salvar</button>
                                <button onClick={cancelEdit} style={btnSm('#e5e5e5', '#111')}>Cancelar</button>
                              </div>
                            ) : (
                              !isPendente && <button onClick={() => startEdit(row as unknown as Record<string, unknown>)} style={btnSm('#f7f7f5', '#111')}>Editar</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {addingRow ? (
                <div style={{ padding: 16, borderTop: '0.5px solid #e5e5e5', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>solo_type</label>
                    <select value={newRow.solo_type as string || ''} onChange={e => setNewRow(v => ({ ...v, solo_type: e.target.value }))} style={{ ...inputSm, width: 110 }}>
                      <option value="">--</option>
                      {soloTypes.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <p style={hintStyle}>Ex: terra, ferro</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>exposicao</label>
                    <select value={newRow.exposicao as string || ''} onChange={e => setNewRow(v => ({ ...v, exposicao: e.target.value }))} style={{ ...inputSm, width: 120 }}>
                      <option value="">--</option>
                      {exposicoesVals.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <p style={hintStyle}>aberta / fechada</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>meia_vida_h</label>
                    <input type="number" step="0.5" placeholder="Ex: 24" value={newRow.meia_vida_h as number || ''} onChange={e => setNewRow(v => ({ ...v, meia_vida_h: +e.target.value }))} style={{ ...inputSm, width: 80 }} />
                    <p style={hintStyle}>horas (6–36)</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingTop: 16 }}>
                    <button onClick={() => openModal({}, newRow, 'meia_vida_secagem', 'insert')} style={btnSm('#FFE000', '#111')}>Enviar</button>
                    <button onClick={() => { setAddingRow(false); setNewRow({}) }} style={btnSm('#e5e5e5', '#111')}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', borderTop: '0.5px solid #e5e5e5' }}>
                  <button onClick={() => { setAddingRow(true); setNewRow({}); cancelEdit() }} style={{ ...btnSm('#f7f7f5', '#111'), fontSize: 13 }}>+ Adicionar</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal de confirmação */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 520, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h2 className="font-wheat" style={{ fontSize: 20, color: '#111', marginBottom: 16 }}>Confirmar alteração</h2>

            {/* Impact line */}
            {(() => {
              const get = (f: string) => String(modal.dadosNovos[f] ?? modal.dadosAnteriores[f] ?? '')
              let impact = ''
              if (modal.tabela === 'tabela_solo') {
                impact = `Esta alteração afeta todas as trilhas do tipo ${get('solo_type')} em ${get('regiao')}`
              } else if (modal.tabela === 'threshold_sazonal') {
                const mesNum = Number(get('mes'))
                impact = `Esta alteração afeta o veredicto de trilhas em ${get('regiao')} durante ${MESES[mesNum] || get('mes')}`
              } else if (modal.tabela === 'meia_vida_secagem') {
                impact = `Esta alteração afeta a taxa de secagem de todos os solos ${get('solo_type')} em exposição ${get('exposicao')}`
              }
              return impact ? (
                <div style={{ background: '#f0f9ff', borderLeft: '3px solid #3b82f6', padding: '8px 12px', borderRadius: 4, fontSize: 12, color: '#1e40af', marginBottom: 14 }}>
                  💡 {impact}
                </div>
              ) : null
            })()}

            {modal.operacao === 'update' && (
              <div style={{ marginBottom: 16 }}>
                {Object.keys(modal.dadosNovos).filter(k => k !== 'id').map(k => {
                  const antes = modal.dadosAnteriores[k]
                  const depois = modal.dadosNovos[k]
                  if (String(antes) === String(depois)) return null
                  return (
                    <div key={k} style={{ background: '#f7f7f5', borderRadius: 4, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: '#888', fontWeight: 500 }}>{k}: </span>
                      <span style={{ color: '#ef4444' }}>{String(antes)}</span>
                      <span style={{ color: '#888', margin: '0 6px' }}>→</span>
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>{String(depois)}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {modal.operacao === 'insert' && (
              <div style={{ marginBottom: 16, background: '#f7f7f5', borderRadius: 4, padding: '8px 12px', fontSize: 13 }}>
                <p style={{ color: '#888', fontWeight: 500, marginBottom: 6 }}>Nova linha:</p>
                {Object.entries(modal.dadosNovos).map(([k, v]) => (
                  <div key={k}><span style={{ color: '#888' }}>{k}: </span><b>{String(v)}</b></div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                Motivo da alteração <span style={{ color: '#ef4444' }}>*</span>
                <span style={{ marginLeft: 6, color: modal.motivo.length < 20 ? '#ef4444' : '#16a34a', fontSize: 11 }}>
                  ({modal.motivo.length}/20 mín.)
                </span>
              </label>
              <textarea
                value={modal.motivo}
                onChange={e => setModal(m => m ? { ...m, motivo: e.target.value } : null)}
                placeholder="Descreva o motivo da alteração..."
                rows={3}
                style={{ width: '100%', border: '1px solid #e5e5e5', borderRadius: 4, padding: '8px 12px', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 4, padding: '10px 14px', fontSize: 12, color: '#854d0e', marginBottom: 20 }}>
              ⚠️ Esta alteração será enviada para aprovação do outro admin antes de ser aplicada.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ ...btnSm('#e5e5e5', '#111'), padding: '9px 20px', fontSize: 13 }}>
                Cancelar
              </button>
              <button
                onClick={enviarParaAprovacao}
                disabled={modal.motivo.trim().length < 20 || modal.submitting}
                style={{
                  ...btnSm('#FFE000', '#111'),
                  padding: '9px 20px', fontSize: 13, fontWeight: 500,
                  border: '1.5px solid #111',
                  opacity: modal.motivo.trim().length < 20 || modal.submitting ? 0.5 : 1,
                  cursor: modal.motivo.trim().length < 20 || modal.submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {modal.submitting ? 'Enviando...' : 'Enviar para aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
