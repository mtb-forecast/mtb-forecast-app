import { deveAlertarRajada } from '@/lib/display'
import type { Condicao } from '@/lib/types'

// Escolha compartilhada entre veredicto_12h e veredicto (48h).
// Regra: mostra sempre o mais severo dos dois (EVITAR/ESPERAR > ALERTA > LIBERADO),
// nunca "prefira o 12h só porque existe" — ver CLAUDE.md, seção de prioridade de veredicto.
export function veredictoSeverity(v: string | null | undefined): number {
  if (!v) return -1
  const u = v.toUpperCase()
  if (u.includes('ESPERAR') || u.includes('EVITAR')) return 2
  if (u.includes('ALERTA')) return 1
  return 0
}

export function selecionarVeredicto(
  veredicto: string | null | undefined,
  veredicto12h: string | null | undefined
): string | null {
  const v48 = veredicto?.trim() || ''
  const v12 = veredicto12h?.trim() || ''
  if (!v12) return v48 || null
  if (!v48) return v12
  return veredictoSeverity(v12) >= veredictoSeverity(v48) ? v12 : v48
}

const ADERENCIA_SEVERIDADE: Record<string, number> = {
  'SECO': 0, 'GRIP PERFEITO': 1, 'BOA ADERÊNCIA - ÚMIDO': 2, 'BAIXA ADERÊNCIA': 3,
}

type CondicaoAlerta = Pick<Condicao,
  'alerta_vento_nivel' | 'rajada_max_kmh' | 'previsao_24h' |
  'aderencia_futura_status' | 'aderencia_futura_label' | 'aderencia_status'>

// Sinais de alerta que a UI mostra em caixas/badges dedicados (rajada prevista,
// vento histórico, chuva prevista, piora futura da aderência) — cada um usa seu
// próprio limiar visual, que costuma ser mais sensível que o limiar de risco
// TOTAL que o backend usa pra escalar o texto do veredicto. Um único fator
// (ex: rajada_prevista, +1 no risco) raramente é suficiente sozinho.
export function possuiAlertaVisivel(
  condicao: CondicaoAlerta | null | undefined,
  exposicao: string | null | undefined
): boolean {
  if (!condicao) return false
  const nivelVento  = condicao.alerta_vento_nivel ?? 0
  const temRajada   = deveAlertarRajada(condicao.rajada_max_kmh, exposicao)
  const temChuva24h = (condicao.previsao_24h ?? []).some(b => (b.rain_mm ?? 0) > 1)
  const sevAtual  = condicao.aderencia_status ? (ADERENCIA_SEVERIDADE[condicao.aderencia_status] ?? 0) : 0
  const sevFutura = condicao.aderencia_futura_status ? (ADERENCIA_SEVERIDADE[condicao.aderencia_futura_status] ?? 0) : 0
  const temPiora  = !!(condicao.aderencia_futura_status && condicao.aderencia_futura_label && sevFutura > sevAtual)
  return nivelVento > 0 || temRajada || temChuva24h || temPiora
}

// Veredicto final para exibição: escala "DROP LIBERADO" limpo para
// "DROP LIBERADO - Veja os alertas" quando há algum sinal visível de risco
// que sozinho não bastou pra escalar o risco TOTAL no backend. Garante que a
// UI nunca mostre badge verde ao lado de um alerta visível (rajada, vento,
// chuva prevista, piora futura). Use sempre esta função (ou possuiAlertaVisivel
// diretamente) em vez de reimplementar a checagem — ver CondicaoCard.tsx,
// DashboardTrailCard.tsx, TrilhaCard.tsx e DashboardVitrine.tsx.
export function veredictoComAlerta(
  veredictoBase: string | null,
  condicao: CondicaoAlerta | null | undefined,
  exposicao: string | null | undefined
): string | null {
  if (!veredictoBase) return veredictoBase
  if (veredictoBase.trim() === 'DROP LIBERADO' && possuiAlertaVisivel(condicao, exposicao)) {
    return 'DROP LIBERADO - Veja os alertas'
  }
  return veredictoBase
}
