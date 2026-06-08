'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import { geocodeLatLon, type GeoResult } from '@/lib/geocoding'
import { ESTADOS_BRASIL } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────
function extrairCoordenadas(url: string): { lat: number; lon: number } | null {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /maps\/place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) }
  }
  return null
}

function isShortUrl(url: string): boolean {
  return /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/maps/.test(url)
}

// ── Design ────────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#fff', border: '1.5px solid #e5e5e5',
  borderRadius: 8, padding: '10px 14px',
  fontSize: 14, color: '#2a2e25', outline: 'none',
}
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 10, padding: 24 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#aaa', textTransform: 'uppercase', margin: '0 0 18px' }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const SUPERFICIE_OPTIONS = ['Concreto', 'Asfalto', 'Madeira', 'Terra compactada', 'Borracha', 'Misto', 'Outro']
const SIM_NAO_OPTIONS = ['Sim', 'Não', 'Parcial']

// ── Main component ────────────────────────────────────────────────────────────
export default function EditarPumptrackPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [erro, setErro]         = useState<string | null>(null)

  // Form fields
  const [nome, setNome]                         = useState('')
  const [mapsUrl, setMapsUrl]                   = useState('')
  const [lat, setLat]                           = useState('')
  const [lon, setLon]                           = useState('')
  const [uf, setUf]                             = useState('')
  const [cidade, setCidade]                     = useState('')
  const [endereco, setEndereco]                 = useState('')
  const [tipoSuperficie, setTipoSuperficie]     = useState('')
  const [comprimento, setComprimento]           = useState('')
  const [iluminacao, setIluminacao]             = useState('')
  const [estacionamento, setEstacionamento]     = useState('')
  const [instagram, setInstagram]               = useState('')
  const [fonte, setFonte]                       = useState('')

  // Geocoding
  const [geoResult, setGeoResult]   = useState<GeoResult | null>(null)
  const [geocoding, setGeocoding]   = useState(false)
  const [extracting, setExtracting] = useState(false)
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: p } = await supabase
        .from('trilhas_pumptrack')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!p) { setNotFound(true); setLoading(false); return }

      setNome(p.nome || '')
      setLat(p.latitude ? String(p.latitude) : '')
      setLon(p.longitude ? String(p.longitude) : '')
      setMapsUrl(p.google_maps_url || '')
      setUf(p.uf || '')
      setCidade(p.cidade || '')
      setEndereco(p.endereco || '')
      setTipoSuperficie(p.tipo_superficie || '')
      setComprimento(p.comprimento_estimado || '')
      setIluminacao(p.iluminacao || '')
      setEstacionamento(p.estacionamento || '')
      setInstagram(p.instagram || '')
      setFonte(p.fonte || '')
      setLoading(false)
    }
    load()
  }, [id])

  // ── Geocoding on lat/lon change ─────────────────────────────────────────────
  useEffect(() => {
    if (!lat || !lon) { setGeoResult(null); return }
    const latN = parseFloat(lat), lonN = parseFloat(lon)
    if (isNaN(latN) || isNaN(lonN)) return
    if (geoTimer.current) clearTimeout(geoTimer.current)
    geoTimer.current = setTimeout(async () => {
      setGeocoding(true)
      const geo = await geocodeLatLon(latN, lonN)
      setGeocoding(false)
      if (geo) {
        setGeoResult(geo)
        if (!uf) setUf(geo.estado)
        if (!cidade) setCidade(geo.cidade)
      }
    }, 800)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon])

  // ── Extract coords from Maps URL ────────────────────────────────────────────
  async function handleExtract() {
    if (!mapsUrl.trim()) return
    setErro(null)
    let url = mapsUrl.trim()
    if (isShortUrl(url)) {
      setExtracting(true)
      try {
        const res = await fetch('/api/resolve-maps-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
        const data = await res.json()
        if (data.resolvedUrl) url = data.resolvedUrl
        else { setErro('Não foi possível resolver a URL encurtada.'); setExtracting(false); return }
      } catch { setErro('Erro ao resolver URL.'); setExtracting(false); return }
      setExtracting(false)
    }
    const coords = extrairCoordenadas(url)
    if (coords) { setLat(coords.lat.toString()); setLon(coords.lon.toString()) }
    else setErro('Não foi possível extrair as coordenadas.')
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return setErro('Nome obrigatório.')
    if (!lat || !lon)  return setErro('Coordenadas obrigatórias.')
    if (!uf)           return setErro('Estado obrigatório.')
    if (!cidade.trim()) return setErro('Cidade obrigatória.')

    setSaving(true); setErro(null)
    const { error } = await supabase.from('trilhas_pumptrack').update({
      nome: nome.trim(),
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      google_maps_url: mapsUrl.trim() || null,
      uf: uf || null,
      cidade: cidade.trim() || null,
      endereco: endereco.trim() || null,
      tipo_superficie: tipoSuperficie || null,
      comprimento_estimado: comprimento.trim() || null,
      iluminacao: iluminacao || null,
      estacionamento: estacionamento || null,
      instagram: instagram.trim() || null,
      fonte: fonte.trim() || null,
    }).eq('id', id)

    setSaving(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); return }
    setSaved(true)
    setTimeout(() => router.push('/perfil/minhas-trilhas'), 1200)
  }

  // ── Loading / Not found / Saved ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #e5e5e5', borderTopColor: '#7C3AED', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32 }}>
      <p style={{ fontSize: 16, color: '#2a2e25', fontWeight: 600 }}>Pump track não encontrado</p>
      <p style={{ fontSize: 13, color: '#888' }}>Este pump track não pertence à sua conta.</p>
      <Link href="/perfil/minhas-trilhas" style={{ fontSize: 13, color: '#6d745f', textDecoration: 'underline' }}>← Voltar</Link>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (saved) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className="ti ti-circle-check" style={{ fontSize: 28, color: '#16a34a' }} />
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#2a2e25' }}>Alterações salvas!</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '32px 20px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link href="/perfil/minhas-trilhas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#888', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 14 }} />
            Minhas trilhas
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🟣</span>
            <div>
              <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>Editar pump track</h1>
              <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>{nome}</p>
            </div>
          </div>
        </div>
      </div>
      <div style={{ background: '#a78bfa', height: 3 }} />

      <div style={{ padding: '24px 20px 80px', maxWidth: 640, margin: '0 auto' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {erro && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              {erro}
            </div>
          )}

          {/* ── Localização ── */}
          <SectionCard title="1. Localização">
            <Field label="URL do Google Maps">
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="url" value={mapsUrl} onChange={e => setMapsUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleExtract() } }}
                  placeholder="URL completa ou curta (maps.app.goo.gl/…)"
                  style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={handleExtract} disabled={extracting || !mapsUrl.trim()}
                  style={{
                    background: extracting ? '#8a9280' : '#7C3AED', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 600,
                    cursor: extracting || !mapsUrl.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap', minWidth: 72,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  {extracting
                    ? <><span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Aguarde</>
                    : 'Extrair'}
                </button>
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Latitude" required>
                <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)}
                  placeholder="-23.5992" style={inputStyle} />
              </Field>
              <Field label="Longitude" required>
                <input type="number" step="any" value={lon} onChange={e => setLon(e.target.value)}
                  placeholder="-46.6575" style={inputStyle} />
              </Field>
            </div>

            {geocoding && <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>📍 Identificando localização…</p>}
            {geoResult && !geocoding && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 8px' }}>✓ Localização identificada</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>Estado</span><span style={{ fontWeight: 600 }}>{geoResult.estado}</span>
                  <span style={{ color: '#6b7280' }}>Cidade</span><span style={{ fontWeight: 600 }}>{geoResult.cidade}</span>
                  {geoResult.localidade && <><span style={{ color: '#6b7280' }}>Localidade</span><span style={{ fontWeight: 600 }}>{geoResult.localidade}</span></>}
                </div>
              </div>
            )}

            <Field label="Endereço">
              <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)}
                placeholder="Rua, número, bairro…" style={inputStyle} />
            </Field>
          </SectionCard>

          {/* ── Identificação ── */}
          <SectionCard title="2. Identificação">
            <Field label="Nome do pump track" required>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Ex: Pump Track Mairiporã" style={inputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Estado (UF)" required>
                <select value={uf} onChange={e => setUf(e.target.value)} style={selectStyle}>
                  <option value="">Selecione</option>
                  {ESTADOS_BRASIL.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
                </select>
              </Field>
              <Field label="Cidade" required>
                <input type="text" value={cidade} onChange={e => setCidade(e.target.value)}
                  placeholder="Nome da cidade" style={inputStyle} />
              </Field>
            </div>
          </SectionCard>

          {/* ── Características ── */}
          <SectionCard title="3. Características">
            <Field label="Tipo de superfície">
              <select value={tipoSuperficie} onChange={e => setTipoSuperficie(e.target.value)} style={selectStyle}>
                <option value="">Selecione (opcional)</option>
                {SUPERFICIE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Comprimento estimado">
              <input type="text" value={comprimento} onChange={e => setComprimento(e.target.value)}
                placeholder="Ex: 200m, 500m…" style={inputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Iluminação">
                <select value={iluminacao} onChange={e => setIluminacao(e.target.value)} style={selectStyle}>
                  <option value="">Selecione</option>
                  {SIM_NAO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Estacionamento">
                <select value={estacionamento} onChange={e => setEstacionamento(e.target.value)} style={selectStyle}>
                  <option value="">Selecione</option>
                  {SIM_NAO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>

          {/* ── Extras ── */}
          <SectionCard title="4. Redes e referências (opcional)">
            <Field label="Instagram">
              <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)}
                placeholder="@perfil ou URL do Instagram" style={inputStyle} />
            </Field>
            <Field label="Fonte / link de referência">
              <input type="url" value={fonte} onChange={e => setFonte(e.target.value)}
                placeholder="https://…" style={inputStyle} />
            </Field>
          </SectionCard>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/perfil/minhas-trilhas" style={{
              flex: '0 0 auto', padding: '13px 20px', borderRadius: 10,
              background: '#fff', border: '1.5px solid #e5e5e5', color: '#555',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center',
            }}>
              Cancelar
            </Link>
            <button type="submit" disabled={saving} style={{
              flex: 1, background: saving ? '#e5e7eb' : '#a78bfa',
              color: saving ? '#9ca3af' : '#fff', border: 'none',
              borderRadius: 10, padding: '13px 24px',
              fontSize: 14, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.15s',
            }}>
              {saving && <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.65s linear infinite' }} />}
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
