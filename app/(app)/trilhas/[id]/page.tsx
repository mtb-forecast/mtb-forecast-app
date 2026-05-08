'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Trilha, Condicao, VEREDICTO_CONFIG, SEM_DADOS_STYLE } from '@/lib/types'

type TrilhaDetalhada = Trilha & { condicoes?: Condicao[] }

// ─── helpers ────────────────────────────────────────────────────────────────

function Pill({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${className}`}>
      {text}
    </span>
  )
}

function MetricBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-700/50 rounded-lg p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-white font-semibold text-sm">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function parseHorarios(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.join(', ')
    return String(parsed)
  } catch {
    return raw
  }
}

function fdsVcfg(v: string | null | undefined) {
  if (!v) return null
  return VEREDICTO_CONFIG[v] ?? null
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function TrilhaDetalhe() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [trilha, setTrilha] = useState<Trilha | null>(null)
  const [c, setC] = useState<Condicao | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorito, setIsFavorito] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)

      const [{ data: trilhaData }, { data: favData }] = await Promise.all([
        supabase
          .from('trilhas')
          .select(`*, condicoes(*)`)
          .eq('id', id)
          .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
          .single(),
        supabase.from('favoritos').select('id').eq('user_id', user.id).eq('trilha_id', id).maybeSingle(),
      ])

      if (!trilhaData) { router.replace('/trilhas'); return }

      const t = trilhaData as TrilhaDetalhada
      const condicoes = Array.isArray(t.condicoes) ? t.condicoes : []
      setTrilha(t)
      setC(condicoes[0] ?? null)
      setIsFavorito(!!favData)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function toggleFavorito() {
    if (!userId) return
    if (isFavorito) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', id)
      setIsFavorito(false)
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: id })
      setIsFavorito(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!trilha) return null

  const veredictoText = c?.veredicto_12h?.trim() || c?.veredicto?.trim() || null
  const vcfg = veredictoText ? (VEREDICTO_CONFIG[veredictoText] ?? null) : null
  const style = vcfg ?? SEM_DADOS_STYLE
  const isQuadrilatero = trilha.solo_type === 'ferro' || trilha.solo_type === 'misto_mg'
  const horarios = parseHorarios(c?.horarios_chuva)

  return (
    <div className="min-h-screen bg-slate-900 px-4 sm:px-6 py-6 max-w-3xl mx-auto">

      {/* Breadcrumb / back */}
      <Link
        href="/trilhas"
        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-6 transition-colors"
      >
        <span>←</span>
        <span>Voltar para trilhas</span>
      </Link>

      {/* ── SEÇÃO 1 — Header ─────────────────────────────────────────────── */}
      <div className={`bg-slate-800 border-l-4 ${style.leftBorder} border border-slate-700 rounded-xl p-5 mb-5`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <a
              href={`https://www.google.com/maps?q=${trilha.lat},${trilha.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-extrabold text-white hover:text-green-400 transition-colors leading-tight block mb-1"
            >
              {trilha.name} <span className="text-base">📍</span>
            </a>
            <p className="text-xs text-slate-500">
              {trilha.lat.toFixed(5)}, {trilha.lon.toFixed(5)} · {trilha.altitude_m}m alt.
            </p>
          </div>
          <button
            onClick={toggleFavorito}
            className={`flex-shrink-0 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              isFavorito
                ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10'
                : 'border-slate-600 text-slate-400 hover:border-yellow-500 hover:text-yellow-400'
            }`}
          >
            {isFavorito ? '★' : '☆'}
          </button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="text-xs px-2.5 py-1 bg-slate-700 text-slate-300 rounded-full">
            {trilha.trail_type === 'bikepark' ? '🏟 Bike Park' : '🌲 Trilha Natural'}
          </span>
          {trilha.bioma && (
            <span className="text-xs px-2.5 py-1 bg-slate-700 text-slate-300 rounded-full">
              🌿 {trilha.bioma}
            </span>
          )}
          {isQuadrilatero && (
            <span className="text-xs px-2.5 py-1 bg-orange-900/40 text-orange-300 border border-orange-800/50 rounded-full">
              ⛏ Quadrilátero Ferrífero
            </span>
          )}
          <span className="text-xs px-2.5 py-1 bg-slate-700 text-slate-300 rounded-full">
            {trilha.regiao}
          </span>
        </div>

        {/* Métricas da trilha */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricBox
            label="Desnível"
            value={trilha.desnivel_m ? `${trilha.desnivel_m}m` : '—'}
          />
          <MetricBox
            label="Extensão"
            value={trilha.extensao_km ? `${trilha.extensao_km}km` : '—'}
          />
          <MetricBox
            label="Inclinação"
            value={c?.inclinacao != null ? `${c.inclinacao.toFixed(1)}%` : '—'}
          />
          <MetricBox
            label="Exposição"
            value={trilha.exposicao || '—'}
          />
        </div>

        {/* Solo */}
        {(c?.texture_class || c?.clay_pct != null || c?.sand_pct != null) && (
          <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            {c?.texture_class && <span>Solo: <span className="text-slate-200">{c.texture_class}</span></span>}
            {c?.clay_pct != null && <span>Argila: <span className="text-slate-200">{c.clay_pct.toFixed(0)}%</span></span>}
            {c?.sand_pct != null && <span>Areia: <span className="text-slate-200">{c.sand_pct.toFixed(0)}%</span></span>}
          </div>
        )}
      </div>

      {/* ── SEÇÃO 2 — Veredicto atual ─────────────────────────────────────── */}
      <Section title="Veredicto atual">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Pill
            text={veredictoText ?? 'SEM DADOS'}
            className={`text-sm ${style.pill}`}
          />
          {c?.aderencia_status && (
            <Pill text={c.aderencia_status} className="bg-slate-700 text-slate-300 border border-slate-600" />
          )}
        </div>
        {c?.aderencia_desc && (
          <p className="text-slate-400 text-sm mb-2">{c.aderencia_desc}</p>
        )}
        {c?.gerado_em && (
          <p className="text-xs text-slate-500">
            Atualizado em {new Date(c.gerado_em).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
        {!c && (
          <p className="text-slate-500 text-sm">Nenhuma condição calculada ainda para esta trilha.</p>
        )}
      </Section>

      {/* ── SEÇÃO 3 — Condição do Solo ───────────────────────────────────── */}
      {c && (
        <Section title="Condição do Solo">
          {/* Frase secagem */}
          {c.frase_secagem && (
            <p className={`text-sm font-medium mb-4 ${style.color}`}>{c.frase_secagem}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <MetricBox
              label="Chuva 48h (bruto)"
              value={`${c.acumulo_48h?.toFixed(1) ?? '—'} mm`}
            />
            <MetricBox
              label="Chuva efetiva"
              value={`${c.acumulo_ef?.toFixed(1) ?? '—'} mm`}
            />
            <MetricBox
              label="Última chuva"
              value={c.ultima_chuva_h != null ? `${c.ultima_chuva_h}h atrás` : '—'}
            />
            <MetricBox
              label="Meia-vida secagem"
              value={`${c.meia_vida_h ?? '—'}h`}
            />
            {c.thresh_desc && (
              <MetricBox label="Limiar" value={c.thresh_desc} />
            )}
          </div>

          {/* Solo descansado */}
          {c.solo_descansado != null && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium mb-4 ${
              c.solo_descansado
                ? 'bg-green-600/15 text-green-300'
                : 'bg-orange-600/15 text-orange-300'
            }`}>
              {c.solo_descansado ? '🟢 Solo descansado' : '🟠 Solo úmido'}
            </div>
          )}

          {/* ENSO */}
          {(c.enso_fase || c.enso_oni != null) && (
            <div className="bg-slate-700/40 rounded-lg px-4 py-3 text-sm">
              <span className="text-slate-400">ENSO: </span>
              {c.enso_fase && <span className="text-slate-200 font-medium">{c.enso_fase}</span>}
              {c.enso_oni != null && (
                <span className="text-slate-400"> · ONI: <span className="text-slate-200">{c.enso_oni.toFixed(2)}</span></span>
              )}
            </div>
          )}
        </Section>
      )}

      {/* ── SEÇÃO 4 — Previsão 48h ───────────────────────────────────────── */}
      {c && (
        <Section title="Previsão 48h">
          {/* Grid de métricas */}
          <div className="space-y-3 mb-4">
            {/* Próximas 12h */}
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Próximas 12h</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricBox label="🌧 Chuva" value={c.rain_12h != null ? `${c.rain_12h.toFixed(1)} mm` : '—'} />
                <MetricBox label="☁️ Prob." value={c.pop_12h != null ? `${c.pop_12h}%` : '—'} />
                <MetricBox label="💨 Vento" value={c.wind_12h != null ? `${c.wind_12h.toFixed(1)} m/s` : '—'} />
                <MetricBox label="🌡 Temp. máx" value={c.temp_max != null ? `${c.temp_max.toFixed(0)}°C` : '—'} />
              </div>
            </div>

            {/* Acúmulo 48h */}
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Acúmulo 48h</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <MetricBox label="🌧 Total" value={`${c.acumulo_48h?.toFixed(1) ?? '—'} mm`} sub="bruto" />
                <MetricBox label="🪣 Efetivo" value={`${c.acumulo_ef?.toFixed(1) ?? '—'} mm`} sub="absorção solo" />
                <MetricBox label="☁️ Prob." value={c.pop_48h != null ? `${c.pop_48h}%` : '—'} />
              </div>
            </div>
          </div>

          {/* Pico 3h — destaque em vermelho se >= 5mm */}
          {c.pico_3h != null && c.pico_3h > 0 && (
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg mb-3 ${
              c.pico_3h >= 5
                ? 'bg-red-500/10 border border-red-500/30'
                : 'bg-slate-700/40 border border-slate-600'
            }`}>
              <span className={`text-sm font-medium ${c.pico_3h >= 5 ? 'text-red-300' : 'text-slate-300'}`}>
                ⚡ Pico 3h
              </span>
              <span className={`font-bold ${c.pico_3h >= 5 ? 'text-red-300' : 'text-white'}`}>
                {c.pico_3h.toFixed(1)} mm
              </span>
            </div>
          )}

          {/* Vento atual */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <MetricBox label="💨 Vento atual" value={`${c.wind_ms?.toFixed(1) ?? '—'} m/s`} />
            {c.gust_max_kmh != null && (
              <MetricBox label="🌪 Rajada máx." value={`${c.gust_max_kmh.toFixed(0)} km/h`} />
            )}
          </div>

          {/* Janela */}
          {c.janela && (
            <div className="bg-slate-700/40 rounded-lg px-4 py-3 mb-3">
              <p className="text-xs text-slate-400 mb-0.5">Melhor janela de pedal</p>
              <p className="text-white font-semibold">{c.janela}</p>
            </div>
          )}

          {/* Horários de chuva */}
          {horarios && (
            <div className="bg-slate-700/40 rounded-lg px-4 py-3">
              <p className="text-xs text-slate-400 mb-0.5">Horários de chuva previstos</p>
              <p className="text-slate-200 text-sm">{horarios}</p>
            </div>
          )}
        </Section>
      )}

      {/* ── SEÇÃO 5 — Próximos 3 dias ────────────────────────────────────── */}
      {c && (c.fds_d1_veredicto || c.fds_d2_veredicto || c.fds_d3_veredicto) && (
        <Section title="Próximos 3 dias">
          <div className="space-y-2">
            {[
              { label: 'D+1', v: c.fds_d1_veredicto, rain: c.fds_d1_rain },
              { label: 'D+2', v: c.fds_d2_veredicto, rain: c.fds_d2_rain },
              { label: 'D+3', v: c.fds_d3_veredicto, rain: c.fds_d3_rain },
            ].map(({ label, v, rain }) => {
              const cfg = fdsVcfg(v)
              return (
                <div
                  key={label}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                    cfg ? `${cfg.bg} ${cfg.border}` : 'bg-slate-700/30 border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm font-mono w-8">{label}</span>
                    <span className={`text-sm font-bold ${cfg?.color ?? 'text-slate-400'}`}>
                      {v ?? 'SEM DADOS'}
                    </span>
                  </div>
                  {rain != null && (
                    <span className="text-slate-300 text-sm">🌧 {rain.toFixed(1)} mm</span>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 6 — Alertas ────────────────────────────────────────────── */}
      {c && (c.alerta_vento_nivel || c.alerta_rajada_kmh != null) && (
        <Section title="Alertas">
          <div className="space-y-2">
            {c.alerta_rajada_kmh != null && (
              <div className="flex items-center justify-between bg-yellow-600/10 border border-yellow-600/30 rounded-lg px-4 py-3">
                <span className="text-yellow-300 text-sm font-medium">⚠️ Rajada prevista</span>
                <span className="text-yellow-200 font-bold">{c.alerta_rajada_kmh.toFixed(0)} km/h</span>
              </div>
            )}

            {c.alerta_vento_nivel && c.alerta_vento_kmh != null && (() => {
              const nivelColors: Record<string, string> = {
                BAIXO:   'bg-yellow-600/10 border-yellow-600/30 text-yellow-300',
                MODERADO:'bg-orange-600/10 border-orange-600/30 text-orange-300',
                ALTO:    'bg-red-600/10 border-red-600/30 text-red-300',
              }
              const colorClass = nivelColors[c.alerta_vento_nivel?.toUpperCase() ?? ''] ?? 'bg-yellow-600/10 border-yellow-600/30 text-yellow-300'
              return (
                <div className={`flex items-center justify-between border rounded-lg px-4 py-3 ${colorClass}`}>
                  <span className="text-sm font-medium">
                    💨 Vento histórico — Nível {c.alerta_vento_nivel}
                  </span>
                  <span className="font-bold">{c.alerta_vento_kmh.toFixed(0)} km/h</span>
                </div>
              )
            })()}
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 7 — Fonte dos dados ────────────────────────────────────── */}
      <Section title="Fonte dos dados">
        <div className="space-y-1.5 text-sm text-slate-400">
          <div className="flex items-start gap-2">
            <span className="text-slate-500 w-20 flex-shrink-0">Previsão</span>
            <span className="text-slate-300">
              {c?.fonte === 'openmeteo'
                ? 'Open-Meteo'
                : c?.fonte === 'openweather'
                ? 'OpenWeather One Call 3.0'
                : 'OpenWeather One Call 3.0 + Open-Meteo'}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-500 w-20 flex-shrink-0">Solo</span>
            <span className="text-slate-300">
              {c?.texture_class ? 'OpenLandMap (SoilGrids)' : 'Configuração manual'}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-500 w-20 flex-shrink-0">ENSO</span>
            <span className="text-slate-300">NOAA ONI (Oceanic Niño Index)</span>
          </div>
        </div>
      </Section>

    </div>
  )
}
