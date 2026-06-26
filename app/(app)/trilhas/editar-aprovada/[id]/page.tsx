'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { IconCircleCheck, IconArrowLeft } from '@tabler/icons-react'
import { supabase, getClientUser } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'
import { getSoloTypes, getBiomas, getExposicoes, getTrailTypes } from '@/lib/domain'
import { geocodeLatLon, type GeoResult } from '@/lib/geocoding'
import { encodePolyline } from '@/lib/polyline'

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

// ── Main component ────────────────────────────────────────────────────────────
function EditarAprovadaContent() {
  const router      = useRouter()
  const { id }      = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const fromAdmin   = searchParams.get('from') === 'admin'
  const adminEstado = searchParams.get('estado') ?? ''
  const adminCidade = searchParams.get('cidade') ?? ''
  const backUrl     = fromAdmin
    ? `/admin/trilhas${adminEstado ? `?estado=${encodeURIComponent(adminEstado)}${adminCidade ? `&cidade=${encodeURIComponent(adminCidade)}` : ''}` : ''}`
    : '/perfil/minhas-trilhas'

  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [erro, setErro]         = useState<string | null>(null)
  const [isAdmin, setIsAdmin]   = useState(false)

  // Form fields
  const [nome, setNome]           = useState('')
  const [regiao, setRegiao]       = useState('')
  const [lat, setLat]             = useState('')
  const [lon, setLon]             = useState('')
  const [mapsUrl, setMapsUrl]     = useState('')
  const [altitude, setAltitude]   = useState('')
  const [soloType, setSoloType]   = useState('')
  const [exposicao, setExposicao] = useState('')
  const [trailType, setTrailType] = useState('')
  const [bioma, setBioma]               = useState('')
  const [desnivel, setDesnivel]         = useState('')
  const [extensao, setExtensao]         = useState('')
  const [mantenedorId, setMantenedorId] = useState<string>('')
  const [mantenedores, setMantenedores] = useState<{ id: string; nome: string }[]>([])
  const [sensibilidade, setSensibilidade] = useState('')

  // Geocoding
  const [geoResult, setGeoResult]   = useState<GeoResult | null>(null)
  const [geocoding, setGeocoding]   = useState(false)
  const [extracting, setExtracting] = useState(false)
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // GPX
  const [polyline, setPolyline]       = useState<string | null>(null)
  const [gpxImporting, setGpxImporting] = useState(false)
  const [gpxErro, setGpxErro]         = useState<string | null>(null)
  const [gpxOk, setGpxOk]             = useState<string | null>(null)
  const gpxInputRef = useRef<HTMLInputElement | null>(null)

  // Options
  const [soloTypes, setSoloTypes]   = useState<string[]>([])
  const [biomas, setBiomas]         = useState<string[]>([])
  const [exposicoes, setExposicoes] = useState<{ valor: string; label: string }[]>([])
  const [trailTypes, setTrailTypes] = useState<{ valor: string; label: string }[]>([])

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      const admin = !!profile?.is_admin
      setIsAdmin(admin)

      let trilhaQuery = supabase.from('trilhas').select('*').eq('id', id)
      if (!admin) trilhaQuery = trilhaQuery.eq('created_by', user.id)

      const [{ data: t }, sts, bio, exp, tty, { data: mants }] = await Promise.all([
        trilhaQuery.maybeSingle(),
        getSoloTypes(), getBiomas(), getExposicoes(), getTrailTypes(),
        supabase.from('mantenedores').select('id, nome').eq('ativo', true).order('nome'),
      ])

      if (!t) { setNotFound(true); setLoading(false); return }

      setNome(t.name || '')
      setRegiao(t.regiao || '')
      setLat(t.lat ? String(t.lat) : '')
      setLon(t.lon ? String(t.lon) : '')
      setAltitude(t.altitude_m ? String(t.altitude_m) : '')
      setSoloType(t.solo_type || '')
      setExposicao(t.exposicao || '')
      setTrailType(t.trail_type || '')
      setBioma(t.bioma || '')
      setDesnivel(t.desnivel_m ? String(t.desnivel_m) : '')
      setExtensao(t.extensao_km ? String(t.extensao_km) : '')
      setMantenedorId(t.mantenedor_id || '')
      setMantenedores((mants as { id: string; nome: string }[]) ?? [])
      setSensibilidade(t.sensibilidade != null ? String(t.sensibilidade) : '1')
      setPolyline(t.polyline ?? null)

      setSoloTypes(sts)
      setBiomas(bio)
      setExposicoes(exp)
      setTrailTypes(tty)
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
        if (!regiao) setRegiao(geo.estado)
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

  // ── GPX ─────────────────────────────────────────────────────────────────────
  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  async function handleGpxImport(file: File) {
    setGpxErro(null); setGpxOk(null); setGpxImporting(true)
    try {
      const text = await file.text()
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      if (doc.querySelector('parsererror')) throw new Error('Arquivo GPX inválido ou corrompido.')

      const pts = [
        ...Array.from(doc.querySelectorAll('trkpt')),
        ...Array.from(doc.querySelectorAll('rtept')),
      ]
      if (pts.length === 0) throw new Error('Nenhum ponto de trilha encontrado no arquivo GPX.')

      const lats: number[] = [], lons: number[] = [], eles: number[] = []
      pts.forEach(pt => {
        const la = parseFloat(pt.getAttribute('lat') || '')
        const lo = parseFloat(pt.getAttribute('lon') || '')
        const el = parseFloat(pt.querySelector('ele')?.textContent || '')
        if (!isNaN(la) && !isNaN(lo)) { lats.push(la); lons.push(lo) }
        if (!isNaN(el)) eles.push(el)
      })
      if (lats.length === 0) throw new Error('Pontos de GPS sem coordenadas válidas.')

      setPolyline(encodePolyline(lats.map((la, i) => ({ lat: la, lng: lons[i] }))))

      const centLat = lats.reduce((s, v) => s + v, 0) / lats.length
      const centLon = lons.reduce((s, v) => s + v, 0) / lons.length
      setLat(centLat.toFixed(6))
      setLon(centLon.toFixed(6))

      let distKm = 0
      for (let i = 1; i < lats.length; i++) distKm += haversineKm(lats[i-1], lons[i-1], lats[i], lons[i])

      let altMedia = 0, ganho = 0
      if (eles.length > 0) {
        altMedia = eles.reduce((s, v) => s + v, 0) / eles.length
        for (let i = 1; i < eles.length; i++) { const d = eles[i] - eles[i-1]; if (d > 0) ganho += d }
        setAltitude(Math.round(altMedia).toString())
        if (ganho > 1) setDesnivel(Math.round(ganho).toString())
      }
      if (distKm > 0.01) setExtensao(distKm.toFixed(2))

      const parts = [`${pts.length} pontos`]
      if (distKm > 0.01) parts.push(`${distKm.toFixed(1)} km`)
      if (ganho > 1) parts.push(`${Math.round(ganho)}m desnível`)
      setGpxOk(`✓ GPX importado — ${parts.join(' · ')}`)
    } catch (e) {
      setGpxErro(e instanceof Error ? e.message : 'Erro ao processar o arquivo GPX.')
    } finally {
      setGpxImporting(false)
      if (gpxInputRef.current) gpxInputRef.current.value = ''
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  async function getOrCreateLocalidade(geo: GeoResult): Promise<string | null> {
    let query = supabase.from('localidades').select('id')
      .eq('estado', geo.estado).eq('cidade', geo.cidade)
    if (geo.localidade) query = query.eq('localidade', geo.localidade)
    else query = query.is('localidade', null)
    const { data: existing } = await query.maybeSingle()
    if (existing) return (existing as { id: string }).id
    const { data: inserted } = await supabase
      .from('localidades')
      .insert({ pais: geo.pais, estado: geo.estado, cidade: geo.cidade, localidade: geo.localidade })
      .select('id').single()
    return inserted ? (inserted as { id: string }).id : null
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return setErro('Nome obrigatório.')
    if (!regiao)       return setErro('Região obrigatória.')
    if (!lat || !lon)  return setErro('Coordenadas obrigatórias.')
    if (!altitude || parseInt(altitude) <= 0) return setErro('Altitude obrigatória e deve ser maior que zero.')
    if (!soloType)     return setErro('Tipo de solo obrigatório.')
    if (!exposicao)    return setErro('Exposição obrigatória.')
    if (!trailType)    return setErro('Tipo de trilha obrigatório.')

    setSaving(true); setErro(null)

    let localidadeId: string | null = null
    if (geoResult) localidadeId = await getOrCreateLocalidade(geoResult)

    const payload = {
      name: nome.trim(), regiao,
      lat: parseFloat(lat), lon: parseFloat(lon),
      altitude_m: parseInt(altitude),
      solo_type: soloType, exposicao, trail_type: trailType,
      bioma: bioma || null,
      desnivel_m: desnivel ? parseFloat(desnivel) : null,
      extensao_km: extensao ? parseFloat(extensao) : null,
      mantenedor_id: mantenedorId || null,
      polyline: polyline ?? null,
      ...(localidadeId ? { localidade_id: localidadeId } : {}),
      ...(isAdmin ? { sensibilidade: sensibilidade ? parseFloat(sensibilidade) : 1.0 } : {}),
    }

    if (isAdmin) {
      const res  = await fetch('/api/admin/editar-trilha', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      })
      const json = await res.json()
      setSaving(false)
      if (!res.ok) { setErro(json.error ?? 'Erro ao salvar.'); return }
    } else {
      const { error } = await supabase.from('trilhas').update(payload).eq('id', id)
      setSaving(false)
      if (error) { setErro('Erro ao salvar. Tente novamente.'); return }
    }

    setSaved(true)
    setTimeout(() => router.push(backUrl), 1200)
  }

  // ── Loading / Not found / Saved ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32 }}>
      <p style={{ fontSize: 16, color: '#2a2e25', fontWeight: 600 }}>Trilha não encontrada</p>
      <Link href={backUrl} style={{ fontSize: 13, color: '#6d745f', textDecoration: 'underline' }}>← Voltar</Link>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (saved) return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconCircleCheck size={28} style={{ color: '#16a34a' }} />
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
          <Link href={backUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#888', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}>
            <IconArrowLeft size={14} />
            {fromAdmin ? 'Admin / Trilhas' : 'Minhas trilhas'}
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>Editar trilha</h1>
            {isAdmin && (
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', background: '#6d745f', color: '#fff', borderRadius: 2, padding: '3px 8px' }}>ADMIN</span>
            )}
          </div>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>{nome}</p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

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
                    background: extracting ? '#8a9280' : '#2a2e25', color: '#fff', border: 'none',
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
          </SectionCard>

          {/* ── Identificação ── */}
          <SectionCard title="2. Identificação">
            <Field label="Nome da trilha" required>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Ex: Trilha das Pedras" style={inputStyle} />
            </Field>
            <Field label="Região (estado)" required>
              <select value={regiao} onChange={e => setRegiao(e.target.value)} style={selectStyle}>
                <option value="">Selecione o estado</option>
                {ESTADOS_BRASIL.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
              </select>
              {geoResult && regiao && <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✓ Preenchido pelo geocoding</p>}
            </Field>
          </SectionCard>

          {/* ── Altitude ── */}
          <SectionCard title="3. Altitude">
            <Field label="Altitude (m)" required>
              <input type="number" value={altitude} onChange={e => setAltitude(e.target.value)}
                placeholder="Ex: 900" style={inputStyle} />
            </Field>
          </SectionCard>

          {/* ── Características ── */}
          <SectionCard title="4. Características do solo e trilha">
            <Field label="Tipo de solo" required>
              <select value={soloType} onChange={e => setSoloType(e.target.value)} style={selectStyle}>
                <option value="">Selecione</option>
                {soloTypes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Exposição" required>
              <select value={exposicao} onChange={e => setExposicao(e.target.value)} style={selectStyle}>
                <option value="">Selecione</option>
                {exposicoes.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
              </select>
            </Field>
            <Field label="Tipo de trilha" required>
              <select value={trailType} onChange={e => setTrailType(e.target.value)} style={selectStyle}>
                <option value="">Selecione</option>
                {trailTypes.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Bioma">
              <select value={bioma} onChange={e => setBioma(e.target.value)} style={selectStyle}>
                <option value="">Selecione (opcional)</option>
                {biomas.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            {mantenedores.length > 0 && (
              <Field label="Mantenedor">
                <select value={mantenedorId} onChange={e => setMantenedorId(e.target.value)} style={selectStyle}>
                  <option value="">Nenhum</option>
                  {mantenedores.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </Field>
            )}
          </SectionCard>

          {/* ── Métricas ── */}
          <SectionCard title="5. Métricas (opcional)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Desnível (m)">
                <input type="number" value={desnivel} onChange={e => setDesnivel(e.target.value)}
                  placeholder="Ex: 450" style={inputStyle} />
              </Field>
              <Field label="Extensão (km)">
                <input type="number" step="0.1" value={extensao} onChange={e => setExtensao(e.target.value)}
                  placeholder="Ex: 8.5" style={inputStyle} />
              </Field>
            </div>
          </SectionCard>

          {/* ── Rota GPX ── */}
          <SectionCard title={isAdmin ? '6. Rota GPX' : '6. Rota GPX (opcional)'}>
            {polyline ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✓</span>
                <span>{gpxOk ?? 'Rota disponível — importe um novo GPX para substituir'}</span>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Sem rota — importe um arquivo GPX para adicionar o traçado à trilha.</p>
            )}
            {gpxErro && (
              <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{gpxErro}</p>
            )}
            <input
              ref={gpxInputRef}
              type="file"
              accept=".gpx,application/gpx+xml"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleGpxImport(f) }}
            />
            <button
              type="button"
              disabled={gpxImporting}
              onClick={() => gpxInputRef.current?.click()}
              style={{
                background: gpxImporting ? '#8a9280' : '#2a2e25', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600,
                cursor: gpxImporting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
              }}
            >
              {gpxImporting
                ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Processando…</>
                : polyline ? 'Substituir GPX' : 'Importar arquivo GPX'
              }
            </button>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
              Ao importar, coordenadas, altitude, desnível e extensão são atualizados automaticamente a partir do arquivo.
            </p>
          </SectionCard>

          {/* ── Calibração (admin only) ── */}
          {isAdmin && (
            <SectionCard title="6. Calibração do modelo (admin)">
              <Field label="Sensibilidade (padrão 1.0)">
                <input
                  type="number" step="0.05" min="0.1" max="3.0"
                  value={sensibilidade}
                  onChange={e => setSensibilidade(e.target.value)}
                  placeholder="1.0"
                  style={inputStyle}
                />
              </Field>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f4f5f0' }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#6d745f', borderBottom: '1px solid #e5e5e5', whiteSpace: 'nowrap' }}>Valor</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#6d745f', borderBottom: '1px solid #e5e5e5' }}>Efeito</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#6d745f', borderBottom: '1px solid #e5e5e5' }}>Uso típico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { val: '0.6 – 0.7', efeito: 'BAIXA com ≈60–70% da chuva normal', uso: 'Solo muito argiloso, sem drenagem', cor: '#fef2f2' },
                      { val: '0.8 – 0.9', efeito: 'Modelo mais restritivo que o bioma',  uso: 'Solo sensível, sombra permanente', cor: '#fff7ed' },
                      { val: '1.0',       efeito: 'Padrão do bioma — sem ajuste',        uso: 'Maioria das trilhas naturais',     cor: '#f0fdf4' },
                      { val: '1.2 – 1.3', efeito: 'BAIXA precisa de 20–30% mais chuva', uso: 'Bikepark com boa drenagem',        cor: '#eff6ff' },
                      { val: '1.5 – 1.8', efeito: 'BAIXA precisa de 50–80% mais chuva', uso: 'Bikepark com drenagem profissional', cor: '#eff6ff' },
                      { val: '2.0 +',     efeito: 'BAIXA muito difícil de atingir',      uso: 'Bikepark com drenagem de alto nível', cor: '#eff6ff' },
                    ].map(row => (
                      <tr key={row.val} style={{ background: row.cor, borderBottom: '1px solid #e5e5e5' }}>
                        <td style={{ padding: '7px 10px', fontFamily: 'var(--font-dm-mono)', fontWeight: 700, whiteSpace: 'nowrap', color: '#2a2e25' }}>{row.val}</td>
                        <td style={{ padding: '7px 10px', color: '#374151' }}>{row.efeito}</td>
                        <td style={{ padding: '7px 10px', color: '#6b7280' }}>{row.uso}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={backUrl} style={{
              flex: '0 0 auto', padding: '13px 20px', borderRadius: 10,
              background: '#fff', border: '1.5px solid #e5e5e5', color: '#555',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center',
            }}>
              Cancelar
            </Link>
            <button type="submit" disabled={saving} style={{
              flex: 1, background: saving ? '#e5e7eb' : '#6d745f',
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

export default function EditarAprovadaPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f4f5f0' }} />}>
      <EditarAprovadaContent />
    </Suspense>
  )
}
