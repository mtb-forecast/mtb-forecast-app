// Funções de cor e constantes de exibição — fonte única de verdade para todo o frontend.
// Os limiares aqui são VISUAIS (quando um número fica verde/laranja/vermelho),
// não lógicos de negócio (esses vivem no banco via Python agent).

// ── Limiares de exibição ───────────────────────────────────────────────────────

export const DISPLAY_THR = {
  rain48:  { verde: 10, laranja: 30 },   // mm — chuva acumulada 48h
  pico3h:  { verde: 5,  laranja: 10 },   // mm — pico em 3h
  vento:   { verde: 20, laranja: 40 },   // km/h — vento / rajada
  rajada:  { aberta: 30, fechada: 50 },  // km/h — alerta rajada histórica por exposição
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

// Retorna true se a rajada histórica justifica exibir alerta (mesmo critério do Python).
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
