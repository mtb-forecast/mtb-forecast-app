// Funções de cor e constantes de exibição — fonte única de verdade para todo o frontend.
// Os limiares aqui são VISUAIS (quando um número fica verde/laranja/vermelho),
// não lógicos de negócio (esses vivem no banco via Python agent).

// condicoes.trilha_id tem UNIQUE constraint (upsert atômico no Python agent) —
// o PostgREST embute `condicoes(*)` como objeto único (to-one), não mais como
// array, mesmo a query pedindo .order(foreignTable: 'condicoes'). Normaliza
// os dois formatos para não quebrar se o cache de schema do PostgREST variar.
export function condicoesArray<T>(raw: T | T[] | null | undefined): T[] {
  if (Array.isArray(raw)) return raw
  return raw ? [raw] : []
}

// ── Limiares de exibição ───────────────────────────────────────────────────────

export const DISPLAY_THR = {
  rain48:  { verde: 10, laranja: 30 },   // mm — chuva acumulada 48h
  pico3h:  { verde: 5,  laranja: 10 },   // mm — pico em 3h
  vento:   { verde: 20, laranja: 40 },   // km/h — vento / rajada
  rajada:  { aberta: 25, fechada: 30 },  // km/h — limiar de alerta (histórico ou previsto) por exposição
  rajadaTempestade: 40,                  // km/h — a partir daqui é "tempestade" (risco de queda de árvore), flat, sem distinção de exposição — espelha mtb-forecast.py
  picoMin: 3,                            // mm — mínimo para exibir tile pico_3h
} as const

// ── Cores de veredicto ─────────────────────────────────────────────────────────
// Alinhadas com VEREDICTO_CONFIG em lib/types.ts.

export const VEREDICTO_ACCENT: Record<string, string> = {
  'DROP LIBERADO':                   '#22C55E',
  'DROP LIBERADO - Veja os alertas': '#F59E0B',
  'MELHOR ESPERAR':                  '#EF4444',
}

export const VEREDICTO_JANELA_BG: Record<string, string> = {
  'DROP LIBERADO':                   '#F0FDF4',
  'DROP LIBERADO - Veja os alertas': '#FFFBEB',
  'MELHOR ESPERAR':                  '#FEF2F2',
}

export const VEREDICTO_JANELA_COLOR: Record<string, string> = {
  'DROP LIBERADO':                   '#166534',
  'DROP LIBERADO - Veja os alertas': '#92400E',
  'MELHOR ESPERAR':                  '#991B1B',
}

export const VEREDICTO_LABEL: Record<string, string> = {
  'DROP LIBERADO':                   'DROP LIBERADO',
  'DROP LIBERADO - Veja os alertas': 'ATENÇÃO',
  'MELHOR ESPERAR':                  'MELHOR ESPERAR',
}

// ── Funções de cor ─────────────────────────────────────────────────────────────

export function rainColor(mm: number | null | undefined): string {
  if (mm == null) return '#6B7280'
  if (mm < DISPLAY_THR.rain48.verde)    return '#22C55E'
  if (mm <= DISPLAY_THR.rain48.laranja) return '#F59E0B'
  return '#EF4444'
}

export function peakColor(mm: number | null | undefined): string {
  if (mm == null) return '#6B7280'
  if (mm < DISPLAY_THR.pico3h.verde)    return '#22C55E'
  if (mm <= DISPLAY_THR.pico3h.laranja) return '#F59E0B'
  return '#EF4444'
}

export function windColor(kmh: number | null | undefined): string {
  if (kmh == null) return '#6B7280'
  if (kmh < DISPLAY_THR.vento.verde)    return '#22C55E'
  if (kmh <= DISPLAY_THR.vento.laranja) return '#F59E0B'
  return '#EF4444'
}

export function emojiTempo(rain: number | null | undefined, pop: number | null | undefined): string {
  const r = rain ?? 0
  const p = pop  ?? 0
  if (r >= 10 || (r >= 5 && p >= 70)) return '⛈'
  if (r >= 2  || p >= 60)             return '🌧'
  if (r >= 0.5 || p >= 35)            return '🌦'
  if (p < 20)                         return '☀️'
  return '🌤'
}

// Retorna true se a rajada (histórica ou prevista) justifica exibir alerta (mesmo critério do Python).
export function deveAlertarRajada(
  kmh: number | null | undefined,
  exposicao: string | null | undefined,
): boolean {
  if (kmh == null) return false
  const thresh = exposicao?.toLowerCase() === 'aberta'
    ? DISPLAY_THR.rajada.aberta
    : DISPLAY_THR.rajada.fechada
  return kmh >= thresh
}

// Graduação de severidade da rajada (histórica ou prevista): 0 = sem alerta,
// 1 = atenção (25–40 km/h), 2 = tempestade (≥40 km/h, risco de queda de árvore).
// Espelha thresh_rajada/rajada_tempestade em mtb-forecast.py (veredicto()).
export function rajadaSeveridade(
  kmh: number | null | undefined,
  exposicao: string | null | undefined,
): 0 | 1 | 2 {
  if (kmh == null) return 0
  if (kmh >= DISPLAY_THR.rajadaTempestade) return 2
  if (deveAlertarRajada(kmh, exposicao)) return 1
  return 0
}
