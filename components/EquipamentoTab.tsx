'use client'

import { useEffect, useState } from 'react'
import { IconBike, IconPlus, IconTrash, IconStar, IconStarFilled } from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'
import { Bicicleta, Modalidade, TipoBicicleta, TIPOS_BICICLETA, MODALIDADES } from '@/lib/types'

const T = {
  card: '#FFFFFF', border: 'rgba(0,0,0,.07)', text: '#1A1D18', muted: '#6d745f', dim: '#9AA093', primary: '#6d745f',
}
const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)',
  borderRadius: 12, padding: '13px 16px', fontSize: 15, color: '#1A1D18', outline: 'none',
}
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }

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

export default function EquipamentoTab() {
  const [loading, setLoading] = useState(true)
  const [bikes, setBikes] = useState<Bicicleta[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [tipo, setTipo] = useState<TipoBicicleta>('MTB')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [modalidade, setModalidade] = useState<Modalidade>('XC')
  const [ativa, setAtiva] = useState(true)

  async function load() {
    const user = await getClientUser()
    if (!user) return
    setUserId(user.id)
    const { data } = await supabase.from('bicicletas').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (data) setBikes(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setTipo('MTB'); setMarca(''); setModelo(''); setModalidade('XC'); setAtiva(bikes.length === 0)
    setError(null)
  }

  async function handleAdd() {
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      if (ativa) {
        await supabase.from('bicicletas').update({ ativa: false }).eq('user_id', userId).eq('ativa', true)
      }
      const { error: insertError } = await supabase.from('bicicletas').insert({
        user_id: userId, tipo, marca: marca || null, modelo: modelo || null, modalidade, ativa,
      })
      if (insertError) throw insertError
      await load()
      setShowForm(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar a bicicleta.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('bicicletas').delete().eq('id', id)
    setBikes(prev => prev.filter(b => b.id !== id))
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
        <div key={b.id} style={{
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
              {[b.marca, b.modelo].filter(Boolean).join(' ') || tipoLabel(b.tipo)}
            </div>
            <div style={{ fontSize: 12, color: T.muted }}>
              {tipoLabel(b.tipo)} · {modalidadeLabel(b.modalidade)}
            </div>
          </div>
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
            <select style={sel} value={tipo} onChange={e => setTipo(e.target.value as TipoBicicleta)}>
              {TIPOS_BICICLETA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select style={sel} value={modalidade} onChange={e => setModalidade(e.target.value as Modalidade)}>
              {MODALIDADES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <input style={inp} type="text" placeholder="Marca (opcional)" value={marca} onChange={e => setMarca(e.target.value)} />
          <input style={inp} type="text" placeholder="Modelo (opcional)" value={modelo} onChange={e => setModelo(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={ativa} onChange={e => setAtiva(e.target.checked)} />
            Usar como bike ativa (usada nas dicas de setup)
          </label>
          {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}
              style={{ flex: 1, background: 'rgba(0,0,0,.05)', color: T.text, border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="button" onClick={handleAdd} disabled={saving}
              style={{ flex: 1, background: saving ? 'rgba(0,0,0,.15)' : T.primary, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {saving && <Spinner size={14} />}
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { resetForm(); setShowForm(true) }}
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
