'use client'

import { useEffect, useState } from 'react'
import { IconBike, IconPlus, IconTrash, IconStar, IconStarFilled, IconPencil, IconBulb, IconAlertTriangle } from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'
import { Bicicleta, Modalidade, TipoBicicleta, Aro, TIPOS_BICICLETA, MODALIDADES, AROS } from '@/lib/types'
import { analiseCadastroBicicleta } from '@/lib/setupDicas'

const T = {
  card: '#FFFFFF', border: 'rgba(0,0,0,.07)', text: '#1A1D18', muted: '#6d745f', dim: '#9AA093', primary: '#6d745f',
}
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)',
  borderRadius: 12, padding: '13px 16px', fontSize: 15, color: '#1A1D18', outline: 'none',
}
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }
const lbl: React.CSSProperties = { fontSize: 11, color: T.dim, fontWeight: 600, marginBottom: 4, display: 'block' }

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '2px solid rgba(0,0,0,0.1)', borderTopColor: T.primary, borderRadius: '50%',
      animation: 'spin 0.65s linear infinite', flexShrink: 0,
    }} />
  )
}

function modalidadeLabel(v: Modalidade) {
  return MODALIDADES.find(m => m.value === v)?.label ?? v
}
function tipoLabel(v: TipoBicicleta) {
  return TIPOS_BICICLETA.find(t => t.value === v)?.label ?? v
}

type FormState = {
  tipo: TipoBicicleta
  marca: string
  modelo: string
  anoModelo: string
  modalidade: Modalidade
  ativa: boolean
  aroDianteiro: Aro | ''
  aroTraseiro: Aro | ''
  pesoAtleta: string
  cursoDianteiro: string
  cursoTraseiro: string
  psiDianteiro: string
  psiTraseiro: string
}

function estadoVazio(ativaPadrao: boolean): FormState {
  return {
    tipo: 'MTB', marca: '', modelo: '', anoModelo: '', modalidade: 'XC', ativa: ativaPadrao,
    aroDianteiro: '', aroTraseiro: '', pesoAtleta: '', cursoDianteiro: '', cursoTraseiro: '', psiDianteiro: '', psiTraseiro: '',
  }
}

function estadoDaBike(b: Bicicleta): FormState {
  return {
    tipo: b.tipo, marca: b.marca ?? '', modelo: b.modelo ?? '', anoModelo: b.ano_modelo != null ? String(b.ano_modelo) : '', modalidade: b.modalidade, ativa: b.ativa,
    aroDianteiro: b.aro_dianteiro ?? '', aroTraseiro: b.aro_traseiro ?? '',
    pesoAtleta: b.peso_atleta_kg != null ? String(b.peso_atleta_kg) : '',
    cursoDianteiro: b.curso_dianteiro_mm != null ? String(b.curso_dianteiro_mm) : '',
    cursoTraseiro: b.curso_traseiro_mm != null ? String(b.curso_traseiro_mm) : '',
    psiDianteiro: b.psi_dianteiro != null ? String(b.psi_dianteiro) : '',
    psiTraseiro: b.psi_traseiro != null ? String(b.psi_traseiro) : '',
  }
}

function numOrNull(v: string): number | null {
  if (!v.trim()) return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function validarForm(form: FormState): string | null {
  if (!form.marca.trim()) return 'Informe a marca.'
  if (!form.modelo.trim()) return 'Informe o modelo.'
  if (!form.anoModelo.trim()) return 'Informe o ano do modelo.'
  const ano = numOrNull(form.anoModelo)
  if (ano == null || ano < 1990 || ano > 2100) return 'Ano do modelo inválido.'
  if (!form.aroDianteiro) return 'Informe o aro dianteiro.'
  if (!form.aroTraseiro) return 'Informe o aro traseiro.'
  if (!form.pesoAtleta.trim()) return 'Informe o peso do atleta.'
  if (form.tipo !== 'RIGIDA') {
    if (!form.cursoDianteiro.trim()) return 'Informe o curso de suspensão dianteira.'
    if (!form.cursoTraseiro.trim()) return 'Informe o curso de suspensão traseira.'
  }
  if (!form.psiDianteiro.trim()) return 'Informe o PSI dianteiro atual.'
  if (!form.psiTraseiro.trim()) return 'Informe o PSI traseiro atual.'
  return null
}

export default function EquipamentoTab() {
  const [loading, setLoading] = useState(true)
  const [bikes, setBikes] = useState<Bicicleta[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(estadoVazio(true))
  const [analise, setAnalise] = useState<{ bikeId: string; itens: string[]; avisos: string[] } | null>(null)

  async function load() {
    const user = await getClientUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('bicicletas').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) setBikes(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function abrirNovo() {
    setEditingId(null)
    setForm(estadoVazio(bikes.length === 0))
    setError(null)
    setAnalise(null)
    setShowForm(true)
  }

  function abrirEdicao(b: Bicicleta) {
    setEditingId(b.id)
    setForm(estadoDaBike(b))
    setError(null)
    setAnalise(null)
    setShowForm(true)
  }

  async function handleSalvar() {
    if (!userId) return
    const erroValidacao = validarForm(form)
    if (erroValidacao) {
      setError(erroValidacao)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        user_id: userId,
        tipo: form.tipo,
        marca: form.marca,
        modelo: form.modelo,
        ano_modelo: numOrNull(form.anoModelo),
        modalidade: form.modalidade,
        ativa: form.ativa,
        aro_dianteiro: form.aroDianteiro || null,
        aro_traseiro: form.aroTraseiro || null,
        peso_atleta_kg: numOrNull(form.pesoAtleta),
        curso_dianteiro_mm: form.tipo === 'RIGIDA' ? null : numOrNull(form.cursoDianteiro),
        curso_traseiro_mm: form.tipo === 'RIGIDA' ? null : numOrNull(form.cursoTraseiro),
        psi_dianteiro: numOrNull(form.psiDianteiro),
        psi_traseiro: numOrNull(form.psiTraseiro),
      }

      if (form.ativa) {
        await supabase.from('bicicletas').update({ ativa: false }).eq('user_id', userId).eq('ativa', true)
      }

      let salva: Bicicleta | null = null
      if (editingId) {
        const { data, error: updError } = await supabase.from('bicicletas').update(payload).eq('id', editingId).select('*').single()
        if (updError) throw updError
        salva = data
      } else {
        const { data, error: insertError } = await supabase.from('bicicletas').insert(payload).select('*').single()
        if (insertError) throw insertError
        salva = data
      }

      await load()
      setShowForm(false)
      if (salva) {
        const a = analiseCadastroBicicleta(salva)
        if (a.itens.length || a.avisos.length) setAnalise({ bikeId: salva.id, itens: a.itens, avisos: a.avisos })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a bicicleta.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('bicicletas').delete().eq('id', id)
    setBikes(prev => prev.filter(b => b.id !== id))
    if (analise?.bikeId === id) setAnalise(null)
  }

  async function handleSetAtiva(id: string) {
    if (!userId) return
    await supabase.from('bicicletas').update({ ativa: false }).eq('user_id', userId).eq('ativa', true)
    await supabase.from('bicicletas').update({ ativa: true }).eq('id', id)
    setBikes(prev => prev.map(b => ({ ...b, ativa: b.id === id })))
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={20} /></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bikes.map(b => (
        <div key={b.id}>
          <div style={{
            background: T.card, borderRadius: 16, border: `1px solid ${T.border}`,
            padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'rgba(0,0,0,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconBike size={20} style={{ color: T.primary }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>
                {[b.marca, b.modelo, b.ano_modelo ? String(b.ano_modelo) : null].filter(Boolean).join(' ') || tipoLabel(b.tipo)}
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>
                {tipoLabel(b.tipo)} · {modalidadeLabel(b.modalidade)}
                {b.aro_dianteiro && b.aro_traseiro && b.aro_dianteiro !== b.aro_traseiro && ' · Mullet'}
              </div>
            </div>
            <button type="button" onClick={() => abrirEdicao(b)} title="Editar"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, flexShrink: 0 }}>
              <IconPencil size={17} style={{ color: T.dim }} />
            </button>
            <button type="button" onClick={() => handleSetAtiva(b.id)} title={b.ativa ? 'Bike ativa' : 'Definir como ativa'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, flexShrink: 0 }}>
              {b.ativa
                ? <IconStarFilled size={18} style={{ color: '#D4A017' }} />
                : <IconStar size={18} style={{ color: T.dim }} />}
            </button>
            <button type="button" onClick={() => handleDelete(b.id)} title="Remover"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, flexShrink: 0 }}>
              <IconTrash size={18} style={{ color: T.dim }} />
            </button>
          </div>

          {analise?.bikeId === b.id && (
            <div style={{
              background: '#F9FAFB', border: `1px solid ${T.border}`, borderTop: 'none',
              borderRadius: '0 0 16px 16px', margin: '-6px 4px 0', padding: '12px 16px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {analise.avisos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#B45309', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <IconAlertTriangle size={13} /> Confira antes de sair pra trilha
                  </div>
                  {analise.avisos.map((aviso, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.5 }}>{aviso}</div>
                  ))}
                </div>
              )}
              {analise.itens.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <IconBulb size={13} /> Análise da bike
                  </div>
                  {analise.itens.map((item, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>{item}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {bikes.length === 0 && !showForm && (
        <p style={{ fontSize: 13, color: T.muted, padding: '4px 4px 0', lineHeight: 1.6 }}>
          Cadastre sua bicicleta para receber dicas de setup (pressão de pneu, suspensão) de acordo
          com a condição da trilha.
        </p>
      )}

      {showForm ? (
        <div style={{ background: T.card, borderRadius: 16, border: `1px solid ${T.border}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <span style={lbl}>Tipo</span>
              <select style={sel} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoBicicleta }))}>
                {TIPOS_BICICLETA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={lbl}>Modalidade</span>
              <select style={sel} value={form.modalidade} onChange={e => setForm(f => ({ ...f, modalidade: e.target.value as Modalidade }))}>
                {MODALIDADES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <input style={inp} type="text" placeholder="Marca" required value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input style={{ ...inp, flex: 2 }} type="text" placeholder="Modelo" required value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} />
            <input style={{ ...inp, flex: 1 }} type="number" inputMode="numeric" placeholder="Ano" required min={1990} max={2100} value={form.anoModelo} onChange={e => setForm(f => ({ ...f, anoModelo: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <span style={lbl}>Aro dianteiro</span>
              <select style={sel} required value={form.aroDianteiro} onChange={e => setForm(f => ({ ...f, aroDianteiro: e.target.value as Aro | '' }))}>
                <option value="">—</option>
                {AROS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={lbl}>Aro traseiro</span>
              <select style={sel} required value={form.aroTraseiro} onChange={e => setForm(f => ({ ...f, aroTraseiro: e.target.value as Aro | '' }))}>
                <option value="">—</option>
                {AROS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          {form.aroDianteiro && form.aroTraseiro && form.aroDianteiro !== form.aroTraseiro && (
            <div style={{ fontSize: 11.5, color: T.primary, fontWeight: 600 }}>Configuração Mullet identificada ✓</div>
          )}

          <div>
            <span style={lbl}>Peso do atleta (kg)</span>
            <input style={inp} type="number" inputMode="decimal" min={0} required placeholder="Ex: 78" value={form.pesoAtleta} onChange={e => setForm(f => ({ ...f, pesoAtleta: e.target.value }))} />
          </div>

          {form.tipo !== 'RIGIDA' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span style={lbl}>Curso dianteiro (mm)</span>
                <input style={inp} type="number" inputMode="numeric" min={0} required placeholder="Ex: 150" value={form.cursoDianteiro} onChange={e => setForm(f => ({ ...f, cursoDianteiro: e.target.value }))} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={lbl}>Curso traseiro (mm)</span>
                <input style={inp} type="number" inputMode="numeric" min={0} required placeholder="Ex: 140" value={form.cursoTraseiro} onChange={e => setForm(f => ({ ...f, cursoTraseiro: e.target.value }))} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <span style={lbl}>PSI dianteiro atual</span>
              <input style={inp} type="number" inputMode="decimal" min={0} required placeholder="Ex: 22" value={form.psiDianteiro} onChange={e => setForm(f => ({ ...f, psiDianteiro: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={lbl}>PSI traseiro atual</span>
              <input style={inp} type="number" inputMode="decimal" min={0} required placeholder="Ex: 24" value={form.psiTraseiro} onChange={e => setForm(f => ({ ...f, psiTraseiro: e.target.value }))} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.ativa} onChange={e => setForm(f => ({ ...f, ativa: e.target.checked }))} />
            Usar como bike ativa (usada nas dicas de setup)
          </label>

          {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setShowForm(false)}
              style={{ flex: 1, background: 'rgba(0,0,0,.05)', color: T.text, border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="button" onClick={handleSalvar} disabled={saving}
              style={{ flex: 1, background: saving ? 'rgba(0,0,0,.15)' : T.primary, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {saving && <Spinner size={14} />}
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={abrirNovo}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'transparent', border: `1px dashed ${T.dim}`, borderRadius: 16,
            padding: '14px', fontSize: 14, fontWeight: 600, color: T.muted, cursor: 'pointer',
          }}>
          <IconPlus size={16} /> Adicionar bicicleta
        </button>
      )}
    </div>
  )
}
