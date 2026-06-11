'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase, getClientUser } from '@/lib/supabase'
import { Mantenedor } from '@/lib/types'

const emptyForm = { nome: '', logo_url: '', site_url: '', ativo: true }

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm.nome.trim()) return
    setSaving(true)
    const res  = await fetch('/api/admin/mantenedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
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
      body: JSON.stringify({ id: editingId, ...editForm }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { flash('Erro ao salvar: ' + (json.error ?? res.status), false); return }
    setMantenedores(prev =>
      prev.map(m => m.id === editingId
        ? { ...m, ...editForm, logo_url: editForm.logo_url || null, site_url: editForm.site_url || null }
        : m
      ).sort((a, b) => a.nome.localeCompare(b.nome))
    )
    setEditingId(null)
    flash('Salvo!')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 20, textDecoration: 'none' }}>
            ← Admin
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32, margin: 0 }}>Mantenedores</h1>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', background: '#6d745f', color: '#fff', borderRadius: 2, padding: '3px 8px' }}>
              ADMIN
            </span>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            Parques, clubes e organizações que mantêm trilhas
          </p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>

        {msg && (
          <div style={{
            background: msg.ok ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${msg.ok ? '#86efac' : '#fca5a5'}`,
            color: msg.ok ? '#166534' : '#991b1b',
            borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13,
          }}>
            {msg.text}
          </div>
        )}

        {/* Botão novo */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={() => { setShowNew(v => !v); setEditingId(null) }}
            style={{
              background: showNew ? '#e5e7eb' : '#2a2e25',
              color: showNew ? '#6b7280' : '#fff',
              border: 'none', borderRadius: 8,
              padding: '10px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showNew ? 'Cancelar' : '+ Novo mantenedor'}
          </button>
        </div>

        {/* Formulário novo */}
        {showNew && (
          <form onSubmit={handleCreate} style={{
            background: '#fff', border: '0.5px solid #e5e5e5',
            borderRadius: 10, padding: 24, marginBottom: 16,
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#aaa', textTransform: 'uppercase', margin: '0 0 18px' }}>
              Novo mantenedor
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <MantenedorFields form={newForm} onChange={setNewForm} />
              <button type="submit" disabled={saving || !newForm.nome.trim()} style={{
                background: saving ? '#e5e7eb' : '#6d745f',
                color: saving ? '#9ca3af' : '#fff',
                border: 'none', borderRadius: 8,
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
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            Nenhum mantenedor cadastrado ainda.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mantenedores.map(m => (
            <div key={m.id} style={{
              background: '#fff', border: '0.5px solid #e5e5e5',
              borderRadius: 10, overflow: 'hidden',
            }}>
              {/* Row */}
              <div
                onClick={() => {
                  if (editingId === m.id) { setEditingId(null); return }
                  setEditingId(m.id)
                  setEditForm({ nome: m.nome, logo_url: m.logo_url ?? '', site_url: m.site_url ?? '', ativo: m.ativo })
                  setShowNew(false)
                }}
                style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
              >
                {/* Logo preview */}
                <div style={{
                  width: 48, height: 32, background: '#1e2018', borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {m.logo_url ? (
                    <Image src={m.logo_url} alt={m.nome} width={40} height={24} style={{ objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 10, color: '#6d745f', fontWeight: 700 }}>LOGO</span>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#2a2e25' }}>{m.nome}</div>
                  {m.site_url && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {m.site_url.replace(/^https?:\/\//, '')}
                    </div>
                  )}
                </div>

                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
                  padding: '3px 8px', borderRadius: 4,
                  background: m.ativo ? '#f0fdf4' : '#f9fafb',
                  color: m.ativo ? '#16a34a' : '#9ca3af',
                  border: `0.5px solid ${m.ativo ? '#86efac' : '#e5e7eb'}`,
                }}>
                  {m.ativo ? 'ATIVO' : 'INATIVO'}
                </span>

                <i className={`ti ${editingId === m.id ? 'ti-chevron-up' : 'ti-pencil'}`}
                  style={{ fontSize: 14, color: '#8a9480', flexShrink: 0 }} />
              </div>

              {/* Edit form inline */}
              {editingId === m.id && (
                <form onSubmit={handleUpdate} style={{
                  borderTop: '0.5px solid #e5e5e5',
                  padding: '20px 20px 16px',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  background: '#fafaf8',
                }}>
                  <MantenedorFields form={editForm} onChange={setEditForm} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setEditingId(null)} style={{
                      flex: '0 0 auto', padding: '11px 18px', borderRadius: 8,
                      background: '#fff', border: '1.5px solid #e5e5e5',
                      color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving || !editForm.nome.trim()} style={{
                      flex: 1, background: saving ? '#e5e7eb' : '#6d745f',
                      color: saving ? '#9ca3af' : '#fff', border: 'none',
                      borderRadius: 8, padding: '11px 0',
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

type FormState = { nome: string; logo_url: string; site_url: string; ativo: boolean }

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
    setUploading(true)
    setUploadErr(null)
    setUploadInfo(null)

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
    if (res.ok) {
      onChange({ ...form, logo_url: json.url })
    } else {
      setUploadErr(json.error ?? 'Erro no upload')
      setUploadInfo(null)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const inputS: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#fff', border: '1.5px solid #e5e5e5',
    borderRadius: 8, padding: '10px 14px',
    fontSize: 14, color: '#2a2e25', outline: 'none',
  }
  const label = (text: string, required?: boolean) => (
    <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 5 }}>
      {text}{required && <span style={{ color: '#ef4444' }}> *</span>}
    </label>
  )
  return (
    <>
      <div>
        {label('Nome', true)}
        <input style={inputS} value={form.nome} onChange={e => onChange({ ...form, nome: e.target.value })}
          placeholder="Ex: Parque Estadual da Serra do Mar" />
      </div>
      <div>
        {label('Logo')}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ ...inputS, flex: 1 }}
            value={form.logo_url}
            onChange={e => onChange({ ...form, logo_url: e.target.value })}
            placeholder="https://... ou use o botão para fazer upload"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              flexShrink: 0, padding: '10px 16px', borderRadius: 8,
              background: uploading ? '#e5e7eb' : '#f4f5f0',
              border: '1.5px solid #e5e5e5',
              color: uploading ? '#9ca3af' : '#2a2e25',
              fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {uploading ? 'Enviando…' : 'Fazer upload'}
          </button>
        </div>
        {uploadErr  && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{uploadErr}</p>}
        {uploadInfo && <p style={{ fontSize: 12, color: '#6d745f', marginTop: 4 }}>{uploadInfo}</p>}
        {form.logo_url && !uploading && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#1e2018', borderRadius: 6, padding: '6px 10px', display: 'inline-flex', alignItems: 'center' }}>
              <Image src={form.logo_url} alt="preview" width={80} height={20} style={{ objectFit: 'contain' }} />
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...form, logo_url: '' })}
              style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Remover
            </button>
          </div>
        )}
      </div>
      <div>
        {label('Site URL')}
        <input style={inputS} value={form.site_url} onChange={e => onChange({ ...form, site_url: e.target.value })}
          placeholder="https://..." type="url" />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
        <div
          onClick={() => onChange({ ...form, ativo: !form.ativo })}
          style={{
            width: 40, height: 22, borderRadius: 999, position: 'relative',
            background: form.ativo ? '#6d745f' : '#d1d5db',
            transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 3, left: form.ativo ? 21 : 3,
            width: 16, height: 16, borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s',
          }} />
        </div>
        <span style={{ fontSize: 14, color: '#2a2e25' }}>Ativo</span>
      </label>
    </>
  )
}
