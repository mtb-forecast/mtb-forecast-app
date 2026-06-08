'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { supabase, getClientUser } from '@/lib/supabase'
import { ESTADOS_BRASIL } from '@/lib/types'
import { getSoloTypes, getBiomas, getExposicoes, getTrailTypes } from '@/lib/domain'
import { geocodeLatLon, type GeoResult } from '@/lib/geocoding'

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'recording' | 'paused' | 'trimming' | 'finished' | 'success'
interface Pt { lat: number; lng: number; alt: number | null; ts: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversine(a: Pt, b: Pt): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function totalDistance(pts: Pt[]): number {
  return pts.reduce((acc, p, i) => (i === 0 ? acc : acc + haversine(pts[i - 1], p)), 0)
}

function encodePolyline(pts: Pt[]): string {
  let out = '', pLat = 0, pLng = 0
  for (const p of pts) {
    const lat = Math.round(p.lat * 1e5)
    const lng = Math.round(p.lng * 1e5)
    out += encCoord(lat - pLat) + encCoord(lng - pLng)
    pLat = lat; pLng = lng
  }
  return out
}

function encCoord(v: number): string {
  v = v < 0 ? ~(v << 1) : v << 1
  let s = ''
  while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5 }
  return s + String.fromCharCode(v + 63)
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function divIcon(color: string) {
  return `<div style="width:14px;height:14px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GravarTrilhaPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const setPhaseSync = (p: Phase) => { phaseRef.current = p; setPhase(p) }

  const [points, setPoints] = useState<Pt[]>([])
  const pointsRef = useRef<Pt[]>([])

  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [gpsError, setGpsError] = useState<string | null>(null)

  // Trim
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)

  // Form
  const [nome, setNome] = useState('')
  const [regiao, setRegiao] = useState('')
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
  const [formErro, setFormErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [soloTypes, setSoloTypes] = useState<string[]>([])
  const [biomas, setBiomas] = useState<string[]>([])
  const [exposicoes, setExposicoes] = useState<{ valor: string; label: string }[]>([])
  const [trailTypes, setTrailTypes] = useState<{ valor: string; label: string }[]>([])

  // Leaflet refs
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const LRef = useRef<typeof import('leaflet') | null>(null)
  const polyRef = useRef<import('leaflet').Polyline | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)
  const fullPolyRef = useRef<import('leaflet').Polyline | null>(null)
  const trimPolyRef = useRef<import('leaflet').Polyline | null>(null)
  const trimStartMarkerRef = useRef<import('leaflet').Marker | null>(null)
  const trimEndMarkerRef = useRef<import('leaflet').Marker | null>(null)
  const mapInitRef = useRef(false)

  // Timer
  const watchIdRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const elapsedBaseRef = useRef(0)

  // ── Form options ──
  useEffect(() => {
    Promise.all([getSoloTypes(), getBiomas(), getExposicoes(), getTrailTypes()])
      .then(([s, b, e, t]) => { setSoloTypes(s); setBiomas(b); setExposicoes(e); setTrailTypes(t) })
  }, [])

  // ── Leaflet init ──
  useEffect(() => {
    if (mapInitRef.current || !mapDivRef.current) return
    mapInitRef.current = true

    import('leaflet').then(mod => {
      const L = mod.default
      LRef.current = L
      if (!mapDivRef.current) return

      const map = L.map(mapDivRef.current, { zoomControl: true, attributionControl: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      mapRef.current = map

      navigator.geolocation?.getCurrentPosition(
        ({ coords }) => {
          map.setView([coords.latitude, coords.longitude], 16)
          const icon = L.divIcon({ html: divIcon('#6d745f'), iconSize: [14, 14], className: '' })
          markerRef.current = L.marker([coords.latitude, coords.longitude], { icon }).addTo(map)
        },
        () => map.setView([-23.5505, -46.6333], 12),
        { enableHighAccuracy: true, timeout: 8000 }
      )
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      mapInitRef.current = false
    }
  }, [])

  // ── Trim markers update ──
  useEffect(() => {
    if (phase !== 'trimming') return
    const pts = pointsRef.current
    if (!pts.length || !LRef.current) return
    const trimmed = pts.slice(trimStart, trimEnd + 1).map(p => [p.lat, p.lng] as [number, number])
    trimPolyRef.current?.setLatLngs(trimmed)
    if (trimStartMarkerRef.current) trimStartMarkerRef.current.setLatLng([pts[trimStart].lat, pts[trimStart].lng])
    if (trimEndMarkerRef.current) trimEndMarkerRef.current.setLatLng([pts[trimEnd].lat, pts[trimEnd].lng])
  }, [trimStart, trimEnd, phase])

  // ── GPS ──
  function startGpsWatch() {
    if (!navigator.geolocation) { setGpsError('GPS não suportado neste dispositivo.'); return }
    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (phaseRef.current !== 'recording') return
        const newPt: Pt = { lat: coords.latitude, lng: coords.longitude, alt: coords.altitude, ts: Date.now() }
        const prev = pointsRef.current[pointsRef.current.length - 1]
        pointsRef.current = [...pointsRef.current, newPt]
        setPoints([...pointsRef.current])
        if (prev) setDistance(d => d + haversine(prev, newPt))

        const L = LRef.current
        if (L && mapRef.current) {
          markerRef.current?.setLatLng([coords.latitude, coords.longitude])
          const lls = pointsRef.current.map(p => [p.lat, p.lng] as [number, number])
          if (polyRef.current) { polyRef.current.setLatLngs(lls) }
          else { polyRef.current = L.polyline(lls, { color: '#6d745f', weight: 5, opacity: 0.9 }).addTo(mapRef.current) }
          mapRef.current.panTo([coords.latitude, coords.longitude])
        }
      },
      err => setGpsError(`GPS: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
  }

  function stopGpsWatch() {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null }
  }

  // ── Timer ──
  function startTimer() {
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(elapsedBaseRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }

  function pauseTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    elapsedBaseRef.current += Math.floor((Date.now() - startTimeRef.current) / 1000)
  }

  // ── Phase handlers ──
  function handleStart() {
    setPhaseSync('recording')
    pointsRef.current = []; setPoints([]); setDistance(0)
    elapsedBaseRef.current = 0; setElapsed(0)
    polyRef.current?.remove(); polyRef.current = null
    startGpsWatch(); startTimer()
  }

  function handlePause() {
    setPhaseSync('paused'); stopGpsWatch(); pauseTimer()
  }

  function handleContinue() {
    setPhaseSync('recording'); startGpsWatch(); startTimer()
  }

  function handleEnd() {
    stopGpsWatch(); pauseTimer()
    const pts = pointsRef.current
    if (pts.length < 2) { setPhaseSync('finished'); fillForm(pts); return }

    setTrimStart(0); setTrimEnd(pts.length - 1)
    setPhaseSync('trimming')

    const L = LRef.current
    if (L && mapRef.current) {
      polyRef.current?.remove(); polyRef.current = null
      markerRef.current?.remove(); markerRef.current = null

      const lls = pts.map(p => [p.lat, p.lng] as [number, number])
      fullPolyRef.current = L.polyline(lls, { color: '#d0d4c6', weight: 3, opacity: 0.7, dashArray: '4 4' }).addTo(mapRef.current)
      trimPolyRef.current = L.polyline(lls, { color: '#6d745f', weight: 5 }).addTo(mapRef.current)

      const startIcon = L.divIcon({ html: divIcon('#2a6b1e'), iconSize: [14, 14], className: '' })
      const endIcon   = L.divIcon({ html: divIcon('#8a1a1a'), iconSize: [14, 14], className: '' })
      trimStartMarkerRef.current = L.marker(lls[0], { icon: startIcon }).addTo(mapRef.current)
      trimEndMarkerRef.current   = L.marker(lls[lls.length - 1], { icon: endIcon }).addTo(mapRef.current)

      mapRef.current.fitBounds(L.latLngBounds(lls), { padding: [30, 30] })
    }
  }

  async function confirmTrim() {
    const trimmed = pointsRef.current.slice(trimStart, trimEnd + 1)
    pointsRef.current = trimmed; setPoints(trimmed)
    await fillForm(trimmed)
    setPhaseSync('finished')
  }

  async function fillForm(pts: Pt[]) {
    if (!pts.length) return
    const dist = totalDistance(pts)
    setExtensao(dist.toFixed(2)); setDistance(dist)

    const alts = pts.map(p => p.alt).filter((a): a is number => a !== null)
    if (alts.length > 0) {
      setAltitude(String(Math.round(alts.reduce((a, b) => a + b) / alts.length)))
      const gain = alts.reduce((g, a, i) => (i === 0 ? g : a > alts[i - 1] ? g + (a - alts[i - 1]) : g), 0)
      setDesnivel(String(Math.round(gain)))
    }

    // Geocode do INÍCIO da trilha (trimmed[0])
    const start = pts[0]
    const geo = await geocodeLatLon(start.lat, start.lng)
    if (geo) { setGeoResult(geo); setRegiao(geo.estado) }
  }

  async function handleSave() {
    if (!nome.trim())  { setFormErro('Nome da trilha é obrigatório.'); return }
    if (!regiao)       { setFormErro('Selecione a região.'); return }
    if (!altitude)     { setFormErro('Altitude é obrigatória.'); return }
    if (!soloType)     { setFormErro('Tipo de solo é obrigatório.'); return }
    if (!exposicao)    { setFormErro('Exposição é obrigatória.'); return }
    if (!trailType)    { setFormErro('Tipo de trilha é obrigatório.'); return }

    setFormErro(null); setSaving(true)
    const user = await getClientUser()
    if (!user) { window.location.href = '/login'; return }

    const pts   = pointsRef.current
    const start = pts[0]

    let localidadeId: string | null = null
    if (geoResult) {
      let q = supabase.from('localidades').select('id')
        .eq('estado', geoResult.estado).eq('cidade', geoResult.cidade)
      q = geoResult.localidade ? q.eq('localidade', geoResult.localidade) : q.is('localidade', null)
      const { data: existing } = await q.maybeSingle()
      if (existing) {
        localidadeId = (existing as { id: string }).id
      } else {
        const { data: ins } = await supabase
          .from('localidades')
          .insert({ pais: geoResult.pais, estado: geoResult.estado, cidade: geoResult.cidade, localidade: geoResult.localidade })
          .select('id').single()
        localidadeId = ins ? (ins as { id: string }).id : null
      }
    }

    const { error } = await supabase.from('trilhas_pendentes').insert({
      name: nome.trim(), regiao,
      lat: start.lat, lon: start.lng,
      altitude_m: parseInt(altitude),
      solo_type: soloType, exposicao, trail_type: trailType,
      bioma: bioma || null,
      desnivel_m:  desnivel  ? parseFloat(desnivel)  : null,
      extensao_km: extensao  ? parseFloat(extensao)  : null,
      link_referencia: linkRef.trim() || null,
      observacoes: observacoes.trim() || null,
      user_id: user.id, status: 'pendente',
      localidade_id: localidadeId,
      polyline: pts.length >= 2 ? encodePolyline(pts) : null,
    })

    setSaving(false)
    if (error) { setFormErro('Erro ao salvar. Tente novamente.'); return }
    setPhaseSync('success')
  }

  // ── Styles ──
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    border: '1px solid #d0d4c6', borderRadius: 6,
    padding: '9px 12px', fontSize: 13,
    background: '#fff', color: '#2a2e25', outline: 'none', fontFamily: 'inherit',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  const showMap = phase === 'idle' || phase === 'recording' || phase === 'paused' || phase === 'trimming'

  // ── Tela de sucesso ──
  if (phase === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', border: '0.5px solid #d0d4c6', borderRadius: 14, padding: '48px 32px', textAlign: 'center', maxWidth: 400, width: '100%' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2a2e25', margin: '0 0 8px' }}>Trilha enviada!</h2>
          <p style={{ fontSize: 14, color: '#6d745f', margin: '0 0 32px' }}>
            Sua trilha foi enviada para revisão. Acompanhe o status no seu perfil.
          </p>
          <a href="/perfil/minhas-trilhas" style={{
            display: 'inline-block', background: '#6d745f', color: '#fff',
            borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>
            Ver minhas trilhas
          </a>
        </div>
      </div>
    )
  }

  const trimmedPts   = phase === 'trimming' ? pointsRef.current.slice(trimStart, trimEnd + 1) : []
  const trimmedDist  = phase === 'trimming' ? totalDistance(trimmedPts) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.45 } }
        .leaflet-container { font: inherit; }
        input[type=range] { -webkit-appearance: none; height: 4px; border-radius: 4px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); cursor: pointer; }
      `}</style>

      {/* ── MAP ───────────────────────────────────────────────────── */}
      {showMap && (
        <div style={{ position: 'relative', flex: 1 }}>
          <div ref={mapDivRef} style={{ height: 'calc(100vh - 210px)', width: '100%', background: '#eaece4' }} />

          {gpsError && (
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: '10px 14px', fontSize: 13, zIndex: 1000 }}>
              {gpsError}
            </div>
          )}

          {(phase === 'recording' || phase === 'paused') && (
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: '12px 16px', zIndex: 1000, display: 'flex', justifyContent: 'space-around', alignItems: 'center', boxShadow: '0 2px 12px rgba(0,0,0,.12)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 22, fontWeight: 700, color: '#2a2e25', lineHeight: 1 }}>{fmtTime(elapsed)}</div>
                <div style={{ fontSize: 10, color: '#8a9280', marginTop: 3 }}>TEMPO</div>
              </div>
              <div style={{ width: 1, height: 32, background: '#d0d4c6' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 22, fontWeight: 700, color: '#2a2e25', lineHeight: 1 }}>{distance.toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#8a9280', marginTop: 3 }}>KM</div>
              </div>
              <div style={{ width: 1, height: 32, background: '#d0d4c6' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 22, fontWeight: 700, color: '#2a2e25', lineHeight: 1 }}>{points.length}</div>
                <div style={{ fontSize: 10, color: '#8a9280', marginTop: 3 }}>PONTOS</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONTROLS ──────────────────────────────────────────────── */}
      <div style={{ background: '#2a2e25', flexShrink: 0 }}>

        {/* IDLE */}
        {phase === 'idle' && (
          <div style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h2 style={{ color: '#f4f5f0', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Gravar trilha</h2>
              <p style={{ color: '#8a9280', fontSize: 12, margin: 0 }}>Posicione-se no início e pressione Iniciar</p>
            </div>
            <button onClick={handleStart} style={{ background: '#6d745f', color: '#fff', border: 'none', borderRadius: 12, padding: '18px', fontSize: 17, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <i className="ti ti-player-play-filled" style={{ fontSize: 20 }} />
              INICIAR GRAVAÇÃO
            </button>
          </div>
        )}

        {/* RECORDING */}
        {phase === 'recording' && (
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, background: '#ef4444', borderRadius: '50%', display: 'inline-block', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ color: '#f4f5f0', fontSize: 14, fontWeight: 600 }}>Gravando…</span>
            </div>
            <button onClick={handlePause} style={{ background: '#eaece4', color: '#2a2e25', border: 'none', borderRadius: 12, padding: '16px', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <i className="ti ti-player-pause-filled" style={{ fontSize: 18 }} />
              PAUSAR
            </button>
          </div>
        )}

        {/* PAUSED */}
        {phase === 'paused' && (
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: '#a8b899', fontSize: 13, margin: 0, fontWeight: 600 }}>Gravação pausada</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleContinue} style={{ flex: 1, background: '#6d745f', color: '#fff', border: 'none', borderRadius: 12, padding: '16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <i className="ti ti-player-play-filled" style={{ fontSize: 16 }} />
                CONTINUAR
              </button>
              <button onClick={handleEnd} style={{ flex: 1, background: '#3a4035', color: '#f4f5f0', border: 'none', borderRadius: 12, padding: '16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <i className="ti ti-flag-filled" style={{ fontSize: 16 }} />
                ENCERRAR
              </button>
            </div>
          </div>
        )}

        {/* TRIMMING */}
        {phase === 'trimming' && (
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h3 style={{ color: '#f4f5f0', fontSize: 15, fontWeight: 700, margin: '0 0 3px' }}>Ajustar início e fim</h3>
              <p style={{ color: '#8a9280', fontSize: 11, margin: 0 }}>
                Arraste para definir o trecho a cadastrar · {trimmedDist.toFixed(2)} km selecionados
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, background: '#2a6b1e', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ color: '#a8b899', fontSize: 11, fontWeight: 600 }}>INÍCIO — ponto {trimStart + 1}</span>
              </div>
              <input type="range" min={0} max={Math.max(trimEnd - 1, 0)} value={trimStart}
                onChange={e => setTrimStart(parseInt(e.target.value))}
                style={{ width: '100%', background: '#3a4035', accentColor: '#2a6b1e' }} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, background: '#8a1a1a', borderRadius: '50%', display: 'inline-block' }} />
                <span style={{ color: '#a8b899', fontSize: 11, fontWeight: 600 }}>FIM — ponto {trimEnd + 1} de {pointsRef.current.length}</span>
              </div>
              <input type="range" min={Math.min(trimStart + 1, pointsRef.current.length - 1)} max={pointsRef.current.length - 1} value={trimEnd}
                onChange={e => setTrimEnd(parseInt(e.target.value))}
                style={{ width: '100%', background: '#3a4035', accentColor: '#8a1a1a' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setTrimStart(0); setTrimEnd(pointsRef.current.length - 1) }}
                style={{ background: '#3a4035', color: '#d0d4c6', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Resetar
              </button>
              <button onClick={confirmTrim}
                style={{ flex: 1, background: '#6d745f', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Confirmar recorte
                <i className="ti ti-arrow-right" style={{ fontSize: 14 }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── FORM ──────────────────────────────────────────────────── */}
      {phase === 'finished' && (
        <div>
          {/* Summary header */}
          <div style={{ background: '#2a2e25', padding: '24px 20px 20px' }}>
            <h2 style={{ color: '#f4f5f0', fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Trilha gravada</h2>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 16, fontWeight: 700, color: '#a8b899' }}>{fmtTime(elapsed)}</div>
                <div style={{ fontSize: 10, color: '#6d745f', marginTop: 2 }}>TEMPO</div>
              </div>
              <div style={{ width: 1, height: 28, background: '#3a4035' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 16, fontWeight: 700, color: '#a8b899' }}>{distance.toFixed(2)} km</div>
                <div style={{ fontSize: 10, color: '#6d745f', marginTop: 2 }}>DISTÂNCIA</div>
              </div>
              <div style={{ width: 1, height: 28, background: '#3a4035' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 16, fontWeight: 700, color: '#a8b899' }}>{points.length}</div>
                <div style={{ fontSize: 10, color: '#6d745f', marginTop: 2 }}>PONTOS GPS</div>
              </div>
            </div>
          </div>
          <div style={{ height: 3, background: '#6d745f' }} />

          <div style={{ padding: '20px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {formErro && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>
                {formErro}
              </div>
            )}

            {/* 1. Identificação */}
            <div style={{ background: '#fff', border: '0.5px solid #d0d4c6', borderRadius: 8, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#8a9280', textTransform: 'uppercase', margin: '0 0 14px' }}>1. Identificação</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Nome da trilha <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Trilha das Pedras" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Região (estado) <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={regiao} onChange={e => setRegiao(e.target.value)} style={selectStyle}>
                    <option value="">Selecione o estado</option>
                    {ESTADOS_BRASIL.map(est => <option key={est.value} value={est.value}>{est.label}</option>)}
                  </select>
                  {geoResult && regiao && <p style={{ fontSize: 11, color: '#16a34a', margin: '4px 0 0' }}>✓ Detectado pelo GPS — início da trilha</p>}
                </div>
              </div>
            </div>

            {/* 2. Altitude */}
            <div style={{ background: '#fff', border: '0.5px solid #d0d4c6', borderRadius: 8, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#8a9280', textTransform: 'uppercase', margin: '0 0 14px' }}>2. Altitude</p>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Altitude média (m) <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="number" value={altitude} onChange={e => setAltitude(e.target.value)} placeholder="Ex: 900" style={inputStyle} />
                {altitude && <p style={{ fontSize: 11, color: '#16a34a', margin: '4px 0 0' }}>✓ Calculado pelo GPS</p>}
              </div>
            </div>

            {/* 3. Características */}
            <div style={{ background: '#fff', border: '0.5px solid #d0d4c6', borderRadius: 8, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#8a9280', textTransform: 'uppercase', margin: '0 0 14px' }}>3. Características</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Tipo de solo <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={soloType} onChange={e => setSoloType(e.target.value)} style={selectStyle}>
                    <option value="">Selecione</option>
                    {soloTypes.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Exposição <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={exposicao} onChange={e => setExposicao(e.target.value)} style={selectStyle}>
                    <option value="">Selecione</option>
                    {exposicoes.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Tipo de trilha <span style={{ color: '#ef4444' }}>*</span></label>
                  <select value={trailType} onChange={e => setTrailType(e.target.value)} style={selectStyle}>
                    <option value="">Selecione</option>
                    {trailTypes.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Bioma</label>
                  <select value={bioma} onChange={e => setBioma(e.target.value)} style={selectStyle}>
                    <option value="">Selecione (opcional)</option>
                    {biomas.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* 4. Métricas */}
            <div style={{ background: '#fff', border: '0.5px solid #d0d4c6', borderRadius: 8, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#8a9280', textTransform: 'uppercase', margin: '0 0 14px' }}>4. Métricas</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Desnível (m)</label>
                  <input type="number" value={desnivel} onChange={e => setDesnivel(e.target.value)} placeholder="Ex: 450" style={inputStyle} />
                  {desnivel && <p style={{ fontSize: 10, color: '#16a34a', margin: '3px 0 0' }}>✓ GPS</p>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Extensão (km)</label>
                  <input type="number" step="0.01" value={extensao} onChange={e => setExtensao(e.target.value)} placeholder="Ex: 8.5" style={inputStyle} />
                  {extensao && <p style={{ fontSize: 10, color: '#16a34a', margin: '3px 0 0' }}>✓ GPS</p>}
                </div>
              </div>
            </div>

            {/* 5. Extras */}
            <div style={{ background: '#fff', border: '0.5px solid #d0d4c6', borderRadius: 8, padding: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '2px', color: '#8a9280', textTransform: 'uppercase', margin: '0 0 14px' }}>5. Informações extras</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Link de referência</label>
                  <input type="url" value={linkRef} onChange={e => setLinkRef(e.target.value)} placeholder="Strava, Wikiloc, site do parque…" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6d745f', marginBottom: 5 }}>Observações</label>
                  <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
                    placeholder="Acesso, taxa de entrada, cuidados especiais…"
                    rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>
            </div>

            {/* Submit */}
            <button onClick={handleSave} disabled={saving} style={{
              background: saving ? '#d0d4c6' : '#6d745f', color: saving ? '#8a9280' : '#fff',
              border: 'none', borderRadius: 12, padding: '16px', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {saving && <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.65s linear infinite' }} />}
              {saving ? 'Enviando…' : 'Enviar trilha para revisão'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
