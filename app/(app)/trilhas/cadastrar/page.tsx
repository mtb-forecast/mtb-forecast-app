'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'
import { getSoloTypes, getBiomas, getExposicoes, getTrailTypes } from '@/lib/domain'
import { geocodeLatLon, type GeoResult } from '@/lib/geocoding'
import { encodePolyline } from '@/lib/polyline'

type TipoCadastro = 'trilha' | 'pumptrack'

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

function isWikiloc(url: string): boolean {
  return /wikiloc\.com/.test(url)
}

function wikilockGpxUrl(url: string): string | null {
  // Extrai o ID numérico do final da URL: /trail-name-12345678
  const m = url.match(/[-/](\d{5,})(?:[?#]|$)/)
  if (!m) return null
  return `https://www.wikiloc.com/wikiloc/spatialArtifacts.do?event=download&id=${m[1]}&filetype=gpx`
}

const SUPERFICIE_OPTIONS = [
  'Asfalto', 'Terra', 'Terra / Saibro', 'Concreto',
  'Asfalto / Terra', 'Terra / Madeira', 'Concreto / Asfalto',
]

const ESTACIONAMENTO_OPTIONS = [
  'Sim', 'Não', 'Na Rua', 'Sim (Parque)', 'Sim (Privado)',
  'Sim (Camping)', 'Sim (Hotel)', 'Sim (Complexo)',
]

const ILUMINACAO_OPTIONS = ['Sim', 'Não']

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '2px',
  color: '#888', textTransform: 'uppercase', marginBottom: 16,
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 24 }}>
      <p style={sectionLabel}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: '#888', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export default function CadastrarTrilhaPage() {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoCadastro>('trilha')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)

  // ── Campos comuns ──────────────────────────────────────────────
  const [nome, setNome] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [linkRef, setLinkRef] = useState('')

  // ── Campos trilha MTB ──────────────────────────────────────────
  const [regiao, setRegiao] = useState('')
  const [altitude, setAltitude] = useState('')
  const [soloType, setSoloType] = useState('')
  const [exposicao, setExposicao] = useState('')
  const [trailType, setTrailType] = useState('')
  const [bioma, setBioma] = useState('')
  const [desnivel, setDesnivel] = useState('')
  const [extensao, setExtensao] = useState('')
  const [sensibilidade, setSensibilidade] = useState('1')

  // ── Campos pump track ──────────────────────────────────────────
  const [ptCidade, setPtCidade] = useState('')
  const [ptUf, setPtUf] = useState('')
  const [ptEndereco, setPtEndereco] = useState('')
  const [ptSuperficie, setPtSuperficie] = useState('')
  const [ptComprimento, setPtComprimento] = useState('')
  const [ptIluminacao, setPtIluminacao] = useState('')
  const [ptEstacionamento, setPtEstacionamento] = useState('')
  const [ptInstagram, setPtInstagram] = useState('')
  const [ptFonte, setPtFonte] = useState('')

  // ── Geocoding ──────────────────────────────────────────────────
  const [geoResult, setGeoResult] = useState<GeoResult | null>(null)
  const [geoPreview, setGeoPreview] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── GPX import ─────────────────────────────────────────────────
  const [gpxImporting, setGpxImporting] = useState(false)
  const [gpxErro, setGpxErro] = useState<string | null>(null)
  const gpxInputRef = useRef<HTMLInputElement | null>(null)
  const [polyline, setPolyline] = useState<string | null>(null)

  // ── Opções dinâmicas ───────────────────────────────────────────
  const [soloTypes, setSoloTypes] = useState<string[]>([])
  const [biomas, setBiomas] = useState<string[]>([])
  const [exposicoes, setExposicoes] = useState<{ valor: string; label: string }[]>([])
  const [trailTypes, setTrailTypes] = useState<{ valor: string; label: string }[]>([])

  useEffect(() => {
    Promise.all([getSoloTypes(), getBiomas(), getExposicoes(), getTrailTypes()])
      .then(([s, b, e, t]) => { setSoloTypes(s); setBiomas(b); setExposicoes(e); setTrailTypes(t) })
  }, [])

  // Geocoding automático com debounce de 800ms
  useEffect(() => {
    const latNum = parseFloat(lat)
    const lonNum = parseFloat(lon)
    if (!lat || !lon || isNaN(latNum) || isNaN(lonNum)) {
      setGeoPreview(null); setGeoResult(null); return
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
        if (tipo === 'trilha' && !regiao) setRegiao(geo.estado)
        if (tipo === 'pumptrack') {
          if (!ptCidade) setPtCidade(geo.cidade)
          if (!ptUf) setPtUf(geo.estado)
        }
      } else {
        setGeoResult(null); setGeoPreview(null)
      }
    }, 800)
    return () => { if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current) }
  }, [lat, lon]) // eslint-disable-line react-hooks/exhaustive-deps

  function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  async function handleGpxImport(file: File) {
    setGpxErro(null)
    setGpxImporting(true)
    try {
      const text = await file.text()
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      if (doc.querySelector('parsererror')) throw new Error('Arquivo GPX inválido ou corrompido.')

      // Aceita tanto <trkpt> (track) quanto <rtept> (route) e <wpt> (waypoints)
      const pts = [
        ...Array.from(doc.querySelectorAll('trkpt')),
        ...Array.from(doc.querySelectorAll('rtept')),
      ]
      if (pts.length === 0) throw new Error('Nenhum ponto de trilha encontrado no arquivo GPX.')

      const lats: number[] = []
      const lons: number[] = []
      const eles: number[] = []

      pts.forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat') || '')
        const lon = parseFloat(pt.getAttribute('lon') || '')
        const ele = parseFloat(pt.querySelector('ele')?.textContent || '')
        if (!isNaN(lat) && !isNaN(lon)) { lats.push(lat); lons.push(lon) }
        if (!isNaN(ele)) eles.push(ele)
      })

      if (lats.length === 0) throw new Error('Pontos de GPS sem coordenadas válidas.')

      // Polyline codificada (Google Encoded Polyline) para exibição no mapa
      setPolyline(encodePolyline(lats.map((la, i) => ({ lat: la, lng: lons[i] }))))

      // Centróide da trilha
      const centLat = lats.reduce((s, v) => s + v, 0) / lats.length
      const centLon = lons.reduce((s, v) => s + v, 0) / lons.length

      // Distância total (soma de segmentos consecutivos)
      let distKm = 0
      for (let i = 1; i < lats.length; i++) {
        distKm += haversineKm(lats[i - 1], lons[i - 1], lats[i], lons[i])
      }

      // Ganho de altitude (soma de deltas positivos) e altitude média
      let ganho = 0
      let altMedia = 0
      if (eles.length > 0) {
        altMedia = eles.reduce((s, v) => s + v, 0) / eles.length
        for (let i = 1; i < eles.length; i++) {
          const delta = eles[i] - eles[i - 1]
          if (delta > 0) ganho += delta
        }
      }

      // Preenche os campos
      setLat(centLat.toFixed(6))
      setLon(centLon.toFixed(6))
      if (eles.length > 0) {
        setAltitude(Math.round(altMedia).toString())
        if (ganho > 1) setDesnivel(Math.round(ganho).toString())
      }
      if (distKm > 0.01) setExtensao(distKm.toFixed(2))

      // Nome da trilha do GPX, se campo estiver vazio
      const gpxName = doc.querySelector('trk > name, rte > name')?.textContent?.trim()
      if (gpxName && !nome) setNome(gpxName)

    } catch (e) {
      setGpxErro(e instanceof Error ? e.message : 'Erro ao processar o arquivo GPX.')
    } finally {
      setGpxImporting(false)
      // Limpa o input para permitir reimportar o mesmo arquivo
      if (gpxInputRef.current) gpxInputRef.current.value = ''
    }
  }

  async function handleExtract() {
    if (!mapsUrl.trim()) return
    setErro(null)

    let urlParaExtrair = mapsUrl.trim()

    // URL curta: resolve server-side (CORS impede fetch direto no browser)
    if (isShortUrl(urlParaExtrair)) {
      setExtracting(true)
      try {
        const res = await fetch('/api/resolve-maps-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlParaExtrair }),
        })
        const data = await res.json()
        if (data.resolvedUrl) urlParaExtrair = data.resolvedUrl
        else { setErro('Não foi possível resolver a URL curta. Tente colar a URL completa.'); setExtracting(false); return }
      } catch {
        setErro('Erro de conexão ao resolver a URL. Tente novamente.')
        setExtracting(false)
        return
      }
      setExtracting(false)
    }

    const coords = extrairCoordenadas(urlParaExtrair)
    if (coords) { setLat(coords.lat.toString()); setLon(coords.lon.toString()) }
    else setErro('Não foi possível extrair as coordenadas. Verifique a URL e tente novamente.')
  }

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

  async function handleSubmitTrilha() {
    if (!nome.trim()) { setErro('Nome da trilha é obrigatório.'); return false }
    if (!regiao) { setErro('Selecione a região.'); return false }
    if (!lat || !lon) { setErro('Informe as coordenadas.'); return false }
    if (!altitude) { setErro('Altitude é obrigatória.'); return false }
    if (!soloType) { setErro('Tipo de solo é obrigatório.'); return false }
    if (!exposicao) { setErro('Exposição é obrigatória.'); return false }
    if (!trailType) { setErro('Tipo de trilha é obrigatório.'); return false }
    const sensNum = parseFloat(sensibilidade)
    if (!sensibilidade || isNaN(sensNum) || sensNum <= 0) { setErro('Sensibilidade é obrigatória.'); return false }

    const user = await getClientUser()
    if (!user) { window.location.href = '/login'; return false }

    let localidadeId: string | null = null
    if (geoResult) localidadeId = await getOrCreateLocalidade(geoResult)

    const { data: inserted, error } = await supabase.from('trilhas').insert({
      name: nome.trim(), regiao,
      lat: parseFloat(lat), lon: parseFloat(lon),
      altitude_m: parseInt(altitude, 10),
      solo_type: soloType, exposicao, trail_type: trailType,
      bioma: bioma || null,
      desnivel_m: desnivel ? parseFloat(desnivel) : null,
      extensao_km: extensao ? parseFloat(extensao) : null,
      sensibilidade: sensNum,
      link_referencia: linkRef.trim() || null,
      observacoes: observacoes.trim() || null,
      polyline: polyline ?? null,
      aprovada: true,
      created_by: user.id,
      localidade_id: localidadeId,
    }).select('id')
    if (error) { setErro('Erro ao publicar trilha. Tente novamente.'); return false }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = inserted as any[]
    if (rows?.[0]?.id) setLastCreatedId(rows[0].id)
    return true
  }

  async function handleSubmitPumptrack() {
    if (!nome.trim()) { setErro('Nome do pump track é obrigatório.'); return false }
    if (!lat || !lon) { setErro('Informe as coordenadas.'); return false }
    if (!ptCidade.trim()) { setErro('Cidade é obrigatória.'); return false }
    if (!ptUf) { setErro('Estado (UF) é obrigatório.'); return false }

    const user = await getClientUser()
    if (!user) { window.location.href = '/login'; return false }

    // Gera ID sequencial simples (BR-XXX) ou usa timestamp
    const ptId = `PT-${Date.now()}`

    const { error } = await supabase.from('trilhas_pumptrack').insert({
      id: ptId,
      nome: nome.trim(),
      cidade: ptCidade.trim(),
      uf: ptUf,
      endereco: ptEndereco.trim() || null,
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      tipo_superficie: ptSuperficie || null,
      comprimento_estimado: ptComprimento.trim() || null,
      iluminacao: ptIluminacao || null,
      estacionamento: ptEstacionamento || null,
      instagram: ptInstagram.trim() || null,
      fonte: ptFonte.trim() || null,
      status_validacao: 'Ativo - Base de Dados',
      user_id: user.id,
    })
    if (error) { setErro('Erro ao enviar. Tente novamente.'); return false }
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSaving(true)
    const ok = tipo === 'trilha' ? await handleSubmitTrilha() : await handleSubmitPumptrack()
    setSaving(false)
    if (ok) setSubmitted(true)
  }

  function resetForm() {
    setNome(''); setRegiao(''); setMapsUrl(''); setLat(''); setLon('')
    setAltitude(''); setSoloType(''); setExposicao(''); setTrailType('')
    setBioma(''); setDesnivel(''); setExtensao(''); setSensibilidade('1'); setLinkRef(''); setObservacoes('')
    setPolyline(null)
    setPtCidade(''); setPtUf(''); setPtEndereco(''); setPtSuperficie('')
    setPtComprimento(''); setPtIluminacao(''); setPtEstacionamento('')
    setPtInstagram(''); setPtFonte('')
    setErro(null); setSubmitted(false); setGeoPreview(null); setGeoResult(null)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    border: '1px solid #e5e5e5', borderRadius: 6,
    padding: '9px 12px', fontSize: 13,
    background: '#fff', color: '#111', outline: 'none',
    fontFamily: 'inherit',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  // ── Tela de sucesso ────────────────────────────────────────────
  if (submitted) {
    const isPt = tipo === 'pumptrack'
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>
        <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>
              {isPt ? 'Cadastrar pump track' : 'Cadastrar trilha'}
            </h1>
          </div>
        </div>
        <div style={{ background: isPt ? '#7C3AED' : '#a8b899', height: 3 }} />
        <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{isPt ? '🟣' : '✅'}</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#2a2e25', marginBottom: 8 }}>
              {isPt ? 'Pump track publicado!' : 'Trilha publicada!'}
            </h2>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 32 }}>
              {isPt
                ? 'Seu pump track já está publicado no catálogo e disponível para todos os riders!'
                : 'Sua trilha já está disponível no catálogo. O modelo vai processar as condições no próximo ciclo.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {!isPt && lastCreatedId && (
                <Link href={`/trilhas/${lastCreatedId}`} style={{
                  background: '#6d745f', color: '#fff',
                  border: 'none', borderRadius: 4, padding: '10px 24px',
                  fontSize: 13, fontWeight: 500, textDecoration: 'none',
                }}>
                  Ver minha trilha
                </Link>
              )}
              <Link href="/perfil/minhas-trilhas" style={{
                background: isPt ? '#7C3AED' : lastCreatedId ? '#fff' : '#6d745f',
                color: isPt ? '#fff' : lastCreatedId ? '#2a2e25' : '#fff',
                border: lastCreatedId ? '0.5px solid #e5e5e5' : 'none',
                borderRadius: 4, padding: '10px 24px',
                fontSize: 13, fontWeight: 500, textDecoration: 'none',
              }}>
                Minhas trilhas
              </Link>
              <button onClick={resetForm} style={{
                background: '#fff', color: '#111',
                border: '0.5px solid #e5e5e5', borderRadius: 4,
                padding: '10px 24px', fontSize: 13, cursor: 'pointer',
              }}>
                Cadastrar {isPt ? 'outro pump track' : 'outra trilha'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const hasCoords = !!(lat && lon)
  const accent = tipo === 'pumptrack' ? '#7C3AED' : '#6d745f'
  const accentText = '#fff'

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Cadastrar local</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>Trilha MTB ou pump track — publique direto no catálogo</p>
        </div>
      </div>
      <div style={{ background: tipo === 'pumptrack' ? '#7C3AED' : '#a8b899', height: 3, transition: 'background 0.2s' }} />

      <div style={{ padding: '24px 32px 48px', maxWidth: 640, margin: '0 auto' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Seletor de tipo ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {([
              { val: 'trilha',    emoji: '🏔', label: 'Trilha MTB',  sub: 'DH, Enduro, XC, Natural, Bike Park', accent: '#6d745f', accentText: '#fff' },
              { val: 'pumptrack', emoji: '🟣', label: 'Pump Track',  sub: 'Asfalto, Terra, Homologado',          accent: '#7C3AED', accentText: '#fff' },
            ] as const).map(opt => {
              const active = tipo === opt.val
              return (
                <button key={opt.val} type="button"
                  onClick={() => { setTipo(opt.val); setErro(null) }}
                  style={{
                    background: active ? '#fff' : '#f4f5f0',
                    border: active ? `2px solid ${opt.accent}` : '1.5px solid #e5e5e5',
                    borderRadius: 10, padding: '16px 14px',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 20 }}>{opt.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2a2e25' }}>{opt.label}</span>
                    {active && (
                      <span style={{ marginLeft: 'auto', background: opt.accent, color: opt.accentText, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 8px' }}>
                        Selecionado
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: '#888', margin: 0, lineHeight: 1.4 }}>{opt.sub}</p>
                </button>
              )
            })}
          </div>

          {/* Erro */}
          {erro && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>
              {erro}
            </div>
          )}

          {/* ── LOCALIZAÇÃO — sempre visível, primeiro passo ── */}
          <SectionCard title="1. Localização">

            {/* Importar GPX */}
            <div>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                Importe um arquivo GPX para preencher automaticamente as coordenadas, altitude, desnível e extensão:
              </p>
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
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: gpxImporting ? '#8a9280' : '#2a2e25',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '9px 16px', fontSize: 13, fontWeight: 600,
                  cursor: gpxImporting ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {gpxImporting ? (
                  <>
                    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    Importando…
                  </>
                ) : (
                  <>
                    <i className="ti ti-route" style={{ fontSize: 15 }} />
                    Importar arquivo GPX
                  </>
                )}
              </button>
              {gpxErro && (
                <p style={{ fontSize: 12, color: '#b91c1c', marginTop: 8, background: '#fee2e2', borderRadius: 6, padding: '6px 10px' }}>
                  {gpxErro}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#ccc', fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
              ou informe o link do Maps
              <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
            </div>

            <Field label="URL do Google Maps">
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="url" value={mapsUrl}
                  onChange={e => setMapsUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleExtract() } }}
                  placeholder="URL completa ou curta (maps.app.goo.gl/…)"
                  style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={handleExtract}
                  disabled={extracting || !mapsUrl.trim()}
                  style={{
                    background: extracting ? '#8a9280' : '#2a2e25', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '9px 14px', fontSize: 12, fontWeight: 600,
                    cursor: extracting || !mapsUrl.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap', minWidth: 72,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'background 0.15s',
                  }}>
                  {extracting
                    ? <><span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid #d0d4c6', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> Aguarde</>
                    : 'Extrair'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                Aceita URL completa ou curta (Maps). Pressione Enter ou clique em Extrair.
              </p>

              {/* Banner Wikiloc */}
              {isWikiloc(mapsUrl) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '14px 16px', marginTop: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-map-2" style={{ fontSize: 14 }} />
                    URL do Wikiloc detectada
                  </p>
                  <p style={{ fontSize: 12, color: '#78350f', margin: '0 0 12px', lineHeight: 1.6 }}>
                    O Wikiloc não tem API pública — mas você pode baixar o GPX da trilha e importar aqui para preencher todos os campos automaticamente.
                  </p>
                  <ol style={{ fontSize: 12, color: '#78350f', margin: '0 0 12px', paddingLeft: 18, lineHeight: 2 }}>
                    <li>Abra a trilha no Wikiloc (precisa estar logado)</li>
                    <li>Clique em <strong>Baixar</strong> → selecione <strong>GPX</strong></li>
                    <li>Use o botão <strong>Importar GPX</strong> acima</li>
                  </ol>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: '#f59e0b', color: '#fff', textDecoration: 'none',
                        borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <i className="ti ti-external-link" style={{ fontSize: 13 }} />
                      Abrir trilha no Wikiloc
                    </a>
                    {wikilockGpxUrl(mapsUrl) && (
                      <a
                        href={wikilockGpxUrl(mapsUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: '#fff', color: '#92400e', textDecoration: 'none',
                          border: '1px solid #fde68a', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                        }}
                      >
                        <i className="ti ti-download" style={{ fontSize: 13 }} />
                        Baixar GPX direto
                      </a>
                    )}
                  </div>
                </div>
              )}
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

            {/* Geocoding result */}
            {geocoding && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af' }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #d0d4c6', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Identificando localização…
              </div>
            )}
            {geoResult && !geocoding && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', letterSpacing: '1.5px', textTransform: 'uppercase', margin: '0 0 10px' }}>
                  ✓ Localização identificada
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 16px', fontSize: 13 }}>
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>Estado</span>
                  <span style={{ fontWeight: 600, color: '#2a2e25' }}>{geoResult.estado}</span>
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>Cidade</span>
                  <span style={{ fontWeight: 600, color: '#2a2e25' }}>{geoResult.cidade}</span>
                  {geoResult.localidade && <>
                    <span style={{ color: '#6b7280', fontWeight: 500 }}>Localidade</span>
                    <span style={{ fontWeight: 600, color: '#2a2e25' }}>{geoResult.localidade}</span>
                  </>}
                </div>
              </div>
            )}
            {hasCoords && !geoResult && !geocoding && (
              <p style={{ fontSize: 12, color: '#f59e0b', background: '#fffbeb', borderRadius: 6, padding: '6px 10px', margin: 0 }}>
                ⚠ Não foi possível identificar a localização. Preencha o estado/cidade manualmente abaixo.
              </p>
            )}
          </SectionCard>

          {/* ── Campos restantes — desbloqueados após coordenadas ── */}
          {!hasCoords && (
            <div style={{ border: '1.5px dashed #e5e7eb', borderRadius: 8, padding: '28px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>
                Preencha a <strong style={{ color: '#374151' }}>localização</strong> acima para continuar
              </p>
            </div>
          )}

          {/* ════════════ TRILHA MTB ════════════ */}
          {hasCoords && tipo === 'trilha' && (
            <>
              <SectionCard title="2. Identificação">
                <Field label="Nome da trilha" required>
                  <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                    placeholder="Ex: Trilha das Pedras — Serra da Cantareira" style={inputStyle} />
                </Field>
                <Field label="Região (estado)" required>
                  <select value={regiao} onChange={e => setRegiao(e.target.value)} style={selectStyle}>
                    <option value="">Selecione o estado</option>
                    {ESTADOS_BRASIL.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
                  </select>
                  {geoResult && regiao && (
                    <p style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✓ Preenchido automaticamente pelo geocoding</p>
                  )}
                </Field>
              </SectionCard>

              <SectionCard title="3. Altitude">
                <Field label="Altitude (m)" required>
                  <input type="number" value={altitude} onChange={e => setAltitude(e.target.value)}
                    placeholder="Ex: 900" style={inputStyle} />
                </Field>
              </SectionCard>

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
                <Field label="Sensibilidade do modelo" required>
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
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#6d745f', borderBottom: '1px solid #e5e5e5', whiteSpace: 'nowrap' }}>Valor</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#6d745f', borderBottom: '1px solid #e5e5e5' }}>Efeito</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#6d745f', borderBottom: '1px solid #e5e5e5' }}>Uso típico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { val: '0.6 – 0.7', efeito: 'BAIXA com ≈60–70% da chuva normal', uso: 'Solo muito argiloso, sem drenagem', cor: '#fef2f2' },
                        { val: '0.8 – 0.9', efeito: 'Modelo mais restritivo que o bioma',  uso: 'Solo sensível, sombra permanente', cor: '#fff7ed' },
                        { val: '1.0',       efeito: 'Padrão do bioma — sem ajuste',        uso: 'Maioria das trilhas naturais',     cor: '#f0fdf4' },
                        { val: '1.2 – 1.3', efeito: 'BAIXA precisa de 20–30% mais chuva', uso: 'Bikepark com boa drenagem',        cor: '#eff6ff' },
                        { val: '1.5 – 1.8', efeito: 'BAIXA precisa de 50–80% mais chuva', uso: 'Bikepark c/ drenagem profissional', cor: '#eff6ff' },
                        { val: '2.0 +',     efeito: 'BAIXA muito difícil de atingir',      uso: 'Bikepark com drenagem de alto nível', cor: '#eff6ff' },
                      ].map(row => (
                        <tr key={row.val} style={{ background: row.cor, borderBottom: '1px solid #e5e5e5' }}>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--font-dm-mono)', fontWeight: 700, whiteSpace: 'nowrap', color: '#2a2e25' }}>{row.val}</td>
                          <td style={{ padding: '6px 10px', color: '#374151' }}>{row.efeito}</td>
                          <td style={{ padding: '6px 10px', color: '#6b7280' }}>{row.uso}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

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

              <SectionCard title="6. Informações extras (opcional)">
                <Field label="Link de referência">
                  <input type="url" value={linkRef} onChange={e => setLinkRef(e.target.value)}
                    placeholder="Strava, Wikiloc, site do parque…" style={inputStyle} />
                </Field>
                <Field label="Observações">
                  <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                    placeholder="Acesso, taxa de entrada, cuidados especiais…"
                    rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
              </SectionCard>
            </>
          )}

          {/* ════════════ PUMP TRACK ════════════ */}
          {hasCoords && tipo === 'pumptrack' && (
            <>
              <SectionCard title="2. Identificação">
                <Field label="Nome do pump track" required>
                  <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                    placeholder="Ex: Pump Track Moema" style={inputStyle} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <Field label="Cidade" required>
                    <input type="text" value={ptCidade} onChange={e => setPtCidade(e.target.value)}
                      placeholder="Ex: São Paulo" style={inputStyle} />
                  </Field>
                  <Field label="Estado (UF)" required>
                    <select value={ptUf} onChange={e => setPtUf(e.target.value)} style={selectStyle}>
                      <option value="">UF</option>
                      {ESTADOS_BRASIL.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
                    </select>
                  </Field>
                </div>
                {geoResult && (ptCidade || ptUf) && (
                  <p style={{ fontSize: 11, color: '#16a34a', marginTop: -6 }}>✓ Cidade e estado preenchidos automaticamente</p>
                )}
                <Field label="Endereço">
                  <input type="text" value={ptEndereco} onChange={e => setPtEndereco(e.target.value)}
                    placeholder="Ex: Parque das Bicicletas, Al. Iraé, 35" style={inputStyle} />
                </Field>
              </SectionCard>

              <SectionCard title="3. Características da pista">
                <Field label="Tipo de superfície">
                  <select value={ptSuperficie} onChange={e => setPtSuperficie(e.target.value)} style={selectStyle}>
                    <option value="">Selecione (opcional)</option>
                    {SUPERFICIE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Comprimento estimado">
                  <input type="text" value={ptComprimento} onChange={e => setPtComprimento(e.target.value)}
                    placeholder="Ex: 200m" style={inputStyle} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Iluminação">
                    <select value={ptIluminacao} onChange={e => setPtIluminacao(e.target.value)} style={selectStyle}>
                      <option value="">Selecione</option>
                      {ILUMINACAO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Estacionamento">
                    <select value={ptEstacionamento} onChange={e => setPtEstacionamento(e.target.value)} style={selectStyle}>
                      <option value="">Selecione</option>
                      {ESTACIONAMENTO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                </div>
              </SectionCard>

              <SectionCard title="4. Informações extras (opcional)">
                <Field label="Instagram">
                  <input type="text" value={ptInstagram} onChange={e => setPtInstagram(e.target.value)}
                    placeholder="@nomeDoPumpTrack" style={inputStyle} />
                </Field>
                <Field label="Fonte / Referência">
                  <input type="text" value={ptFonte} onChange={e => setPtFonte(e.target.value)}
                    placeholder="Ex: Velosolutions, Prefeitura, site oficial…" style={inputStyle} />
                </Field>
                <Field label="Observações">
                  <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                    placeholder="Horário de funcionamento, taxa de entrada, acesso…"
                    rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </Field>
              </SectionCard>
            </>
          )}

          {/* ── Submit — só aparece com coordenadas ── */}
          {hasCoords && (
            <>
              {geocoding && (
                <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', margin: 0 }}>
                  Aguarde — identificando localização antes de publicar…
                </p>
              )}
              <button type="submit" disabled={saving || geocoding} style={{
                background: (saving || geocoding) ? '#e5e7eb' : accent,
                color: (saving || geocoding) ? '#9ca3af' : accentText,
                border: 'none', borderRadius: 8,
                padding: '14px', fontSize: 14, fontWeight: 700,
                cursor: (saving || geocoding) ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                {saving && <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.65s linear infinite' }} />}
                {saving ? 'Publicando…' : geocoding ? 'Aguardando geocoding…' : tipo === 'pumptrack' ? 'Publicar pump track' : 'Publicar no catálogo'}
              </button>
            </>
          )}

        </form>
      </div>
    </div>
  )
}
