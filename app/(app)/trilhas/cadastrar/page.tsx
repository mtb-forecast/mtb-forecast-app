'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'
import { getSoloTypes, getBiomas, getExposicoes, getTrailTypes } from '@/lib/domain'
import { geocodeLatLon, type GeoResult } from '@/lib/geocoding'

function extrairCoordenadas(url: string): { lat: number; lon: number } | null {
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /maps\/place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) }
  }
  return null
}

export default function CadastrarTrilhaPage() {
  const router = useRouter()
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [regiao, setRegiao] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [altitude, setAltitude] = useState('')
  const [soloType, setSoloType] = useState('')
  const [exposicao, setExposicao] = useState('')
  const [trailType, setTrailType] = useState('')
  const [bioma, setBioma] = useState('')
  const [desnivel, setDesnivel] = useState('')
  const [extensao, setExtensao] = useState('')
  const [linkRef, setLinkRef] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [geoResult, setGeoResult] = useState<GeoResult | null>(null)
  const [geoPreview, setGeoPreview] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Opções carregadas do Supabase via lib/domain.ts
  const [soloTypes, setSoloTypes] = useState<string[]>([])
  const [biomas, setBiomas] = useState<string[]>([])
  const [exposicoes, setExposicoes] = useState<{ valor: string; label: string }[]>([])
  const [trailTypes, setTrailTypes] = useState<{ valor: string; label: string }[]>([])

  useEffect(() => {
    Promise.all([getSoloTypes(), getBiomas(), getExposicoes(), getTrailTypes()])
      .then(([s, b, e, t]) => {
        setSoloTypes(s)
        setBiomas(b)
        setExposicoes(e)
        setTrailTypes(t)
      })
  }, [])

  // Geocoding automático com debounce de 800ms ao mudar lat/lon
  useEffect(() => {
    const latNum = parseFloat(lat)
    const lonNum = parseFloat(lon)
    if (!lat || !lon || isNaN(latNum) || isNaN(lonNum)) {
      setGeoPreview(null)
      setGeoResult(null)
      return
    }
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current)
    geocodeTimerRef.current = setTimeout(async () => {
      setGeocoding(true)
      const geo = await geocodeLatLon(latNum, lonNum)
      setGeocoding(false)
      if (geo) {
        setGeoResult(geo)
        const parts = [geo.localidade, geo.cidade, geo.estado].filter(Boolean)
        setGeoPreview(`📍 ${parts.join(', ')}`)
        if (!regiao) setRegiao(geo.estado)
      } else {
        setGeoResult(null)
        setGeoPreview(null)
      }
    }, 800)
    return () => { if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current) }
  }, [lat, lon]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExtract() {
    const coords = extrairCoordenadas(mapsUrl)
    if (coords) {
      setLat(coords.lat.toString())
      setLon(coords.lon.toString())
      setErro(null)
    } else {
      setErro('Não foi possível extrair as coordenadas. Cole a URL completa do Google Maps.')
    }
  }

  async function getOrCreateLocalidade(geo: GeoResult): Promise<string | null> {
    let query = supabase.from('localidades').select('id')
      .eq('estado', geo.estado)
      .eq('cidade', geo.cidade)
    if (geo.localidade) {
      query = query.eq('localidade', geo.localidade)
    } else {
      query = query.is('localidade', null)
    }
    const { data: existing } = await query.maybeSingle()
    if (existing) return (existing as { id: string }).id

    const { data: inserted } = await supabase
      .from('localidades')
      .insert({ pais: geo.pais, estado: geo.estado, cidade: geo.cidade, localidade: geo.localidade })
      .select('id')
      .single()
    return inserted ? (inserted as { id: string }).id : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!nome.trim()) { setErro('Nome da trilha é obrigatório.'); return }
    if (!regiao) { setErro('Selecione a região.'); return }
    if (!lat || !lon) { setErro('Extraia ou informe as coordenadas da trilha.'); return }
    if (!altitude) { setErro('Altitude é obrigatória.'); return }
    if (!soloType) { setErro('Tipo de solo é obrigatório.'); return }
    if (!exposicao) { setErro('Exposição é obrigatória.'); return }
    if (!trailType) { setErro('Tipo de trilha é obrigatório.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }

    // Obter localidade_id se geocoding disponível
    let localidadeId: string | null = null
    if (geoResult) localidadeId = await getOrCreateLocalidade(geoResult)

    const { error } = await supabase.from('trilhas_pendentes').insert({
      name: nome.trim(),
      regiao,
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      altitude_m: parseInt(altitude),
      solo_type: soloType,
      exposicao,
      trail_type: trailType,
      bioma: bioma || null,
      desnivel_m: desnivel ? parseFloat(desnivel) : null,
      extensao_km: extensao ? parseFloat(extensao) : null,
      link_referencia: linkRef.trim() || null,
      observacoes: observacoes.trim() || null,
      user_id: user.id,
      status: 'pendente',
      localidade_id: localidadeId,
    })

    setSaving(false)
    if (error) {
      setErro('Erro ao enviar. Tente novamente.')
      return
    }
    setSubmitted(true)
  }

  function resetForm() {
    setNome(''); setRegiao(''); setMapsUrl(''); setLat(''); setLon('')
    setAltitude(''); setSoloType(''); setExposicao(''); setTrailType('')
    setBioma(''); setDesnivel(''); setExtensao(''); setLinkRef('')
    setObservacoes(''); setErro(null); setSubmitted(false)
    setGeoPreview(null); setGeoResult(null)
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>
        <div style={{ background: '#111', padding: '40px 32px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Cadastrar trilha</h1>
          </div>
        </div>
        <div style={{ background: '#FFE000', height: 3 }} />
        <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#111', marginBottom: 8 }}>Trilha enviada!</h2>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 32 }}>
              Sua trilha foi enviada para revisão. Você pode acompanhar o status no seu perfil.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/perfil"
                style={{
                  background: '#FFE000', color: '#111',
                  border: '1.5px solid #111', borderRadius: 4,
                  padding: '10px 24px', fontSize: 13, fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Ver minhas trilhas
              </Link>
              <button
                onClick={resetForm}
                style={{
                  background: '#fff', color: '#111',
                  border: '0.5px solid #e5e5e5', borderRadius: 4,
                  padding: '10px 24px', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cadastrar outra trilha
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Cadastrar trilha</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>Envie para revisão da nossa equipe</p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {erro && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 4, padding: '10px 14px', fontSize: 13 }}>
              {erro}
            </div>
          )}

          {/* Seção 1 — Identificação */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 16 }}>
              Identificação
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                  Nome da trilha <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Trilha das Pedras — Serra da Cantareira"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                  Região <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select value={regiao} onChange={e => setRegiao(e.target.value)} className="input-field" required>
                  <option value="">Selecione o estado</option>
                  {ESTADOS_BRASIL.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Seção 2 — Localização */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>
              Localização
            </p>
            <p style={{ fontSize: 12, color: '#bbb', marginBottom: 16 }}>
              Abra o ponto de início no Google Maps, copie o link e clique em Extrair.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>URL do Google Maps</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="url"
                    value={mapsUrl}
                    onChange={e => setMapsUrl(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="input-field"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleExtract}
                    style={{
                      background: '#111', color: '#fff',
                      border: 'none', borderRadius: 4,
                      padding: '0 16px', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Extrair
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                    Latitude <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={lat}
                    onChange={e => setLat(e.target.value)}
                    placeholder="-23.5505"
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                    Longitude <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={lon}
                    onChange={e => setLon(e.target.value)}
                    placeholder="-46.6333"
                    className="input-field"
                    required
                  />
                </div>
              </div>
              {geocoding && (
                <p style={{ fontSize: 12, color: '#bbb' }}>Detectando localização...</p>
              )}
              {!geocoding && geoPreview && (
                <p style={{ fontSize: 12, color: '#22c55e', fontWeight: 500 }}>{geoPreview}</p>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                  Altitude (m) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  value={altitude}
                  onChange={e => setAltitude(e.target.value)}
                  placeholder="800"
                  className="input-field"
                  required
                />
              </div>
            </div>
          </div>

          {/* Seção 3 — Características */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 16 }}>
              Características
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                    Tipo de solo <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select value={soloType} onChange={e => setSoloType(e.target.value)} className="input-field" required>
                    <option value="">Selecione</option>
                    {soloTypes.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                    Exposição <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select value={exposicao} onChange={e => setExposicao(e.target.value)} className="input-field" required>
                    <option value="">Selecione</option>
                    {exposicoes.map(e => (
                      <option key={e.valor} value={e.valor}>{e.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
                    Tipo de trilha <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select value={trailType} onChange={e => setTrailType(e.target.value)} className="input-field" required>
                    <option value="">Selecione</option>
                    {trailTypes.map(t => (
                      <option key={t.valor} value={t.valor}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Bioma</label>
                  <select value={bioma} onChange={e => setBioma(e.target.value)} className="input-field">
                    <option value="">Não sei / outro</option>
                    {biomas.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Seção 4 — Métricas */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>
              Métricas
            </p>
            <p style={{ fontSize: 12, color: '#bbb', marginBottom: 16 }}>Opcionais — preencha se souber.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Desnível (m)</label>
                <input
                  type="number"
                  value={desnivel}
                  onChange={e => setDesnivel(e.target.value)}
                  placeholder="350"
                  className="input-field"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Extensão (km)</label>
                <input
                  type="number"
                  step="0.1"
                  value={extensao}
                  onChange={e => setExtensao(e.target.value)}
                  placeholder="12.5"
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Seção 5 — Informações extras */}
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>
              Informações extras
            </p>
            <p style={{ fontSize: 12, color: '#bbb', marginBottom: 16 }}>Opcionais — ajudam na revisão.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Link de referência</label>
                <input
                  type="url"
                  value={linkRef}
                  onChange={e => setLinkRef(e.target.value)}
                  placeholder="https://youtube.com/... ou Strava, Komoot..."
                  className="input-field"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>Observações</label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  placeholder="Informações adicionais sobre a trilha, condições, acesso..."
                  rows={4}
                  className="input-field"
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
            <Link
              href="/trilhas"
              style={{ padding: '10px 20px', fontSize: 13, color: '#888', textDecoration: 'none' }}
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '10px 28px', fontSize: 14, fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {saving && (
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #111', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              )}
              {saving ? 'Enviando...' : 'Enviar para revisão'}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
