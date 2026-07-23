'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IconChevronUp, IconPencil } from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'
import { Mantenedor } from '@/lib/types'
import { LogoMantenedor } from '@/components/LogoMantenedor'

const emptyForm = {
  nome: '',
  nome_primario: '',
  nome_secundario: '',
  cor_primaria: '#ffffff',
  cor_secundaria: '',
  logo_url: '',
  site_url: '',
  ativo: true,
}

export default function MantenedoresAdminPage() {
  const router = useRouter()
  const [loading, setLoading]               = useState(true)
  const [mantenedores, setMantenedores]     = useState<Mantenedor[]>([])
  const [showNew, setShowNew]               = useState(false)
  const [newForm, setNewForm]               = useState(emptyForm)
  const [saving, setSaving]                 = useState(false)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [editForm, setEditForm]             = useState(emptyForm)
  const [msg, setMsg]                       = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.replace('/dashboard'); return }

      const { data } = await supabase
        .from('mantenedores').select('*').order('nome')
      setMantenedores((data as Mantenedor[]) ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  function flash(text: string, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  function toPayload(form: typeof emptyForm) {
    return {
      nome:           form.nome.trim(),
      nome_primario:  form.nome_primario.trim() || null,
      nome_secundario:form.nome_secundario.trim() || null,
      cor_primaria:   form.cor_primaria || '#ffffff',
      cor_secundaria: form.cor_secundaria || null,
      logo_url:       form.logo_url.trim() || null,
      site_url:       form.site_url.trim() || null,
      ativo:          form.ativo,
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm.nome.trim()) return
    setSaving(true)
    const res  = await fetch('/api/admin/mantenedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toPayload(newForm)),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { flash('Erro ao criar: ' + (json.error ?? res.status), false); return }
    setMantenedores(prev => [...prev, json as Mantenedor].sort((a, b) => a.nome.localeCompare(b.nome)))
    setNewForm(emptyForm)
    setShowNew(false)
    flash('Mantenedor criado!')
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editForm.nome.trim()) return
    setSaving(true)
    const res  = await fetch('/api/admin/mantenedores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...toPayload(editForm) }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { flash('Erro ao salvar: ' + (json.error ?? res.status), false); return }
    const updated = toPayload(editForm)
    setMantenedores(prev =>
      prev.map(m => m.id === editingId ? { ...m, ...updated } : m)
        .sort((a, b) => a.nome.localeCompare(b.nome))
    )
    setEditingId(null)
    flash('Salvo!')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F5F6F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(0,0,0,.08)', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                fontSize: 'clamp(28px, 4vw, 38px)', textTransform: 'uppercase',
                color: '#F4F3EF', lineHeight: 0.95, margin: 0,
              }}>
                Mantenedores
              </h1>
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', marginTop: 8 }}>
                Parques e clubes mantendo trilhas
              </p>
            </div>
            <button
              onClick={() => { setShowNew(v => !v); setEditingId(null) }}
              style={{
                background: showNew ? 'rgba(244,243,239,.1)' : '#F4F3EF',
                color: showNew ? '#F4F3EF' : '#0E0F0D',
                border: showNew ? '1px solid rgba(244,243,239,.2)' : 'none',
                borderRadius: 999, padding: '9px 18px',
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700,
                fontSize: 14, textTransform: 'uppercase', letterSpacing: '.5px',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {showNew ? 'Cancelar' : '+ Novo'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 32px 80px', maxWidth: 900, margin: '0 auto' }}>

        {msg && (
          <div style={{
            background: msg.ok ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
            border: `1px solid ${msg.ok ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
            color: msg.ok ? '#166534' : '#DC2626',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13,
          }}>
            {msg.text}
          </div>
        )}

        {/* Formulário novo */}
        {showNew && (
          <form onSubmit={handleCreate} style={{
            background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)',
            borderRadius: 12, padding: 20, marginBottom: 16,
          }}>
            <p style={{
              fontFamily: 'var(--font-dm-mono)', fontSize: 10, textTransform: 'uppercase',
              letterSpacing: '1.5px', color: '#9AA093', margin: '0 0 14px',
            }}>
              Novo mantenedor
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <MantenedorFields form={newForm} onChange={setNewForm} />
              <button type="submit" disabled={saving || !newForm.nome.trim()} style={{
                background: saving ? 'rgba(0,0,0,.08)' : '#6d745f',
                color: saving ? '#9AA093' : '#fff',
                border: 'none', borderRadius: 999,
                padding: '11px 0', fontSize: 14, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', width: '100%',
              }}>
                {saving ? 'Criando…' : 'Criar mantenedor'}
              </button>
            </div>
          </form>
        )}

        {/* Lista */}
        {mantenedores.length === 0 && !showNew && (
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, padding: 32, textAlign: 'center', color: '#9AA093', fontSize: 14 }}>
            Nenhum mantenedor cadastrado ainda.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mantenedores.map(m => (
            <div key={m.id} style={{
              background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {/* Row */}
              <div
                onClick={() => {
                  if (editingId === m.id) { setEditingId(null); return }
                  setEditingId(m.id)
                  setEditForm({
                    nome:           m.nome,
                    nome_primario:  m.nome_primario ?? '',
                    nome_secundario:m.nome_secundario ?? '',
                    cor_primaria:   m.cor_primaria ?? '#ffffff',
                    cor_secundaria: m.cor_secundaria ?? '',
                    logo_url:       m.logo_url ?? '',
                    site_url:       m.site_url ?? '',
                    ativo:          m.ativo,
                  })
                  setShowNew(false)
                }}
                style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
              >
                {/* Logo preview */}
                <div style={{
                  background: '#1e2018', borderRadius: 4,
                  padding: '4px 8px', display: 'inline-flex', alignItems: 'center',
                  flexShrink: 0, minWidth: 80,
                }}>
                  <LogoMantenedor
                    mantenedor={{
                      nome: m.nome,
                      nome_primario: m.nome_primario ?? null,
                      nome_secundario: m.nome_secundario ?? null,
                      cor_primaria: m.cor_primaria ?? '#ffffff',
                      cor_secundaria: m.cor_secundaria ?? null,
                    }}
                    contexto="card"
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700, fontSize: 18,
                    textTransform: 'uppercase', color: '#1A1D18',
                  }}>
                    {m.nome_primario ?? m.nome}
                  </div>
                  {m.site_url && (
                    <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: '#6d745f', marginTop: 2 }}>
                      {m.site_url.replace(/^https?:\/\//, '')}
                    </div>
                  )}
                </div>

                <span style={{
                  fontFamily: 'var(--font-dm-mono)', fontSize: 9, letterSpacing: '0.5px',
                  padding: '3px 8px', borderRadius: 999,
                  background: m.ativo ? 'rgba(34,197,94,.1)' : 'rgba(0,0,0,.06)',
                  color: m.ativo ? '#22C55E' : '#9AA093',
                }}>
                  {m.ativo ? 'ATIVO' : 'INATIVO'}
                </span>

                {editingId === m.id
                  ? <IconChevronUp size={14} style={{ color: '#9AA093', flexShrink: 0 }} />
                  : <IconPencil size={14} style={{ color: '#9AA093', flexShrink: 0 }} />}
              </div>

              {/* Edit form inline */}
              {editingId === m.id && (
                <form onSubmit={handleUpdate} style={{
                  borderTop: '1px solid rgba(0,0,0,.07)',
                  padding: 16,
                  display: 'flex', flexDirection: 'column', gap: 12,
                  background: 'rgba(248,249,245,.8)',
                  margin: 12, marginTop: 0, borderRadius: 10,
                  border: '1px solid rgba(109,116,95,.15)',
                }}>
                  <MantenedorFields form={editForm} onChange={setEditForm} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setEditingId(null)} style={{
                      flex: '0 0 auto', padding: '11px 18px', borderRadius: 999,
                      background: 'transparent', border: '1px solid rgba(0,0,0,.1)',
                      color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving || !editForm.nome.trim()} style={{
                      flex: 1, background: saving ? 'rgba(0,0,0,.08)' : '#6d745f',
                      color: saving ? '#9AA093' : '#fff', border: 'none',
                      borderRadius: 999, padding: '11px 0',
                      fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                    }}>
                      {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type FormState = typeof emptyForm

async function compressToWebP(file: File, maxW = 600, maxH = 300, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxW || height > maxH) {
        const ratio = Math.min(maxW / width, maxH / height)
        width  = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => resolve(
          blob
            ? new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' })
            : file
        ),
        'image/webp',
        quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

function MantenedorFields({ form, onChange }: { form: FormState; onChange: (f: FormState) => void }) {
  const [uploading, setUploading]   = useState(false)
  const [uploadInfo, setUploadInfo] = useState<string | null>(null)
  const [uploadErr, setUploadErr]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadErr(null); setUploadInfo(null)
    const isSvg    = file.type === 'image/svg+xml'
    const toUpload = isSvg ? file : await compressToWebP(file)
    if (!isSvg) {
      const pct = Math.round((1 - toUpload.size / file.size) * 100)
      setUploadInfo(`${(file.size / 1024).toFixed(0)} KB → ${(toUpload.size / 1024).toFixed(0)} KB (−${pct}%)`)
    }
    const fd = new FormData()
    fd.append('file', toUpload)
    const res  = await fetch('/api/admin/upload-logo', { method: 'POST', body: fd })
    const json = await res.json()
    setUploading(false)
    if (res.ok) { onChange({ ...form, logo_url: json.url }) }
    else { setUploadErr(json.error ?? 'Erro no upload'); setUploadInfo(null) }
    if (fileRef.current) fileRef.current.value = ''
  }

  const inputS: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#FFFFFF', border: '1px solid rgba(0,0,0,.1)',
    borderRadius: 8, padding: '9px 12px',
    fontSize: 13, color: '#1A1D18', outline: 'none',
  }
  const lbl = (text: string, required?: boolean) => (
    <label style={{
      display: 'block', fontFamily: 'var(--font-dm-mono)', fontSize: 11,
      letterSpacing: '.5px', textTransform: 'uppercase', color: '#9AA093', marginBottom: 5,
    }}>
      {text}{required && <span style={{ color: '#EF4444' }}> *</span>}
    </label>
  )

  const previewMant = {
    nome:           form.nome || 'Nome',
    nome_primario:  form.nome_primario || null,
    nome_secundario:form.nome_secundario || null,
    cor_primaria:   form.cor_primaria || '#ffffff',
    cor_secundaria: form.cor_secundaria || null,
  }

  return (
    <>
      {/* Preview ao vivo */}
      <div>
        {lbl('Preview')}
        <div style={{ background: '#141612', borderRadius: 8, padding: '14px 18px' }}>
          <LogoMantenedor mantenedor={previewMant} contexto="pagina" />
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,.07)', borderRadius: 8, padding: '10px 16px', marginTop: 4 }}>
          <LogoMantenedor mantenedor={previewMant} contexto="card" />
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(0,0,0,.07)', margin: '4px 0' }} />

      {/* Nome (identificação interna) */}
      <div>
        {lbl('Nome interno', true)}
        <input style={inputS} value={form.nome}
          onChange={e => onChange({ ...form, nome: e.target.value })}
          placeholder="Ex: Parque Estadual da Serra do Mar" />
        <p style={{ fontSize: 11, color: '#9AA093', marginTop: 4 }}>Usado internamente. O que aparece para o usuário é o Nome primário.</p>
      </div>

      {/* Nome primário e secundário */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          {lbl('Nome primário')}
          <input style={inputS} value={form.nome_primario}
            onChange={e => onChange({ ...form, nome_primario: e.target.value })}
            placeholder="SHIMANO" />
          <p style={{ fontSize: 11, color: '#9AA093', marginTop: 4 }}>Fallback: Nome interno</p>
        </div>
        <div>
          {lbl('Nome secundário')}
          <input style={inputS} value={form.nome_secundario}
            onChange={e => onChange({ ...form, nome_secundario: e.target.value })}
            placeholder="Trailborn (opcional)" />
        </div>
      </div>

      {/* Cores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          {lbl('Cor primária')}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={form.cor_primaria}
              onChange={e => onChange({ ...form, cor_primaria: e.target.value })}
              style={{ width: 40, height: 40, padding: 2, borderRadius: 6, border: '1px solid rgba(0,0,0,.1)', cursor: 'pointer', flexShrink: 0 }} />
            <input style={{ ...inputS, flex: 1 }} value={form.cor_primaria}
              onChange={e => onChange({ ...form, cor_primaria: e.target.value })}
              placeholder="#ffffff" />
          </div>
        </div>
        <div>
          {lbl('Cor secundária')}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={form.cor_secundaria || '#ffffff'}
              onChange={e => onChange({ ...form, cor_secundaria: e.target.value })}
              style={{ width: 40, height: 40, padding: 2, borderRadius: 6, border: '1px solid rgba(0,0,0,.1)', cursor: 'pointer', flexShrink: 0 }} />
            <input style={{ ...inputS, flex: 1 }} value={form.cor_secundaria}
              onChange={e => onChange({ ...form, cor_secundaria: e.target.value })}
              placeholder="#c9a010 (opcional)" />
          </div>
          {form.cor_secundaria && (
            <button type="button" onClick={() => onChange({ ...form, cor_secundaria: '' })}
              style={{ fontSize: 11, color: '#9AA093', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
              Remover cor secundária
            </button>
          )}
        </div>
      </div>

      {/* Logo */}
      <div>
        {lbl('Logo URL (opcional)')}
        <input
          ref={fileRef} type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: 'none' }} onChange={handleFile}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={{ ...inputS, flex: 1 }} value={form.logo_url}
            onChange={e => onChange({ ...form, logo_url: e.target.value })}
            placeholder="https://... ou faça upload" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{
              flexShrink: 0, padding: '9px 14px', borderRadius: 8,
              background: uploading ? 'rgba(0,0,0,.06)' : '#F8F9F5', border: '1px solid rgba(0,0,0,.1)',
              color: uploading ? '#9AA093' : '#1A1D18',
              fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer',
            }}>
            {uploading ? 'Enviando…' : 'Upload'}
          </button>
          {form.logo_url && (
            <button type="button" onClick={() => onChange({ ...form, logo_url: '' })}
              style={{ fontSize: 12, color: '#9AA093', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
              ✕
            </button>
          )}
        </div>
        {uploadErr  && <p style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>{uploadErr}</p>}
        {uploadInfo && <p style={{ fontSize: 12, color: '#6d745f', marginTop: 4 }}>{uploadInfo}</p>}
      </div>

      {/* Site URL */}
      <div>
        {lbl('Site URL')}
        <input style={inputS} value={form.site_url}
          onChange={e => onChange({ ...form, site_url: e.target.value })}
          placeholder="https://..." type="url" />
      </div>

      {/* Ativo toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
        <div onClick={() => onChange({ ...form, ativo: !form.ativo })}
          style={{
            width: 40, height: 22, borderRadius: 999, position: 'relative',
            background: form.ativo ? '#6d745f' : '#d1d5db',
            transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
          }}>
          <div style={{
            position: 'absolute', top: 3, left: form.ativo ? 21 : 3,
            width: 16, height: 16, borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s',
          }} />
        </div>
        <span style={{ fontSize: 14, color: '#1A1D18' }}>Ativo</span>
      </label>
    </>
  )
}
