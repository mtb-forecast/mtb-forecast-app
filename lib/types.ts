export type Trilha = {
  id: string
  name: string
  lat: number
  lon: number
  solo_type: string
  exposicao: string
  altitude_m: number
  trail_type: string
  desnivel_m?: number
  extensao_km?: number
  regiao: string
  bioma?: string
  aprovada?: boolean
  criada_por?: string
}

export type Condicao = {
  id: string
  trilha_id: string
  gerado_em: string

  // Aderência
  aderencia_status: string
  aderencia_score: number
  aderencia_desc?: string | null
  solo_descansado?: boolean | null
  thresh_desc?: number | null

  // Veredictos
  veredicto: string
  veredicto_12h?: string | null

  // Chuva
  rain_mm: number
  rain_12h?: number | null
  pico_3h: number
  acumulo_48h: number
  acumulo_ef: number
  pop_48h?: number | null
  pop_12h?: number | null
  horarios_chuva?: string | null
  ultima_chuva_h?: number | null

  // Vento
  wind_ms: number
  wind_12h?: number | null
  gust_max_kmh?: number | null

  // Temperatura
  temp_max?: number | null

  // Solo
  meia_vida_h: number
  clay_pct?: number | null
  sand_pct?: number | null
  texture_class?: string | null
  inclinacao?: number | null

  // ENSO
  enso_fase?: string | null
  enso_oni?: number | null

  // Janela / frase
  janela: string
  frase_secagem: string

  // Fonte
  fonte?: string | null

  // Alertas de vento
  alerta_vento_nivel?: number | null
  alerta_vento_kmh?: number | null
  alerta_rajada_kmh?: number | null

  // Fim de semana D+1/D+2/D+3
  fds_d1_veredicto?: string | null
  fds_d1_rain?: number | null
  fds_d2_veredicto?: string | null
  fds_d2_rain?: number | null
  fds_d3_veredicto?: string | null
  fds_d3_rain?: number | null
}

export type Profile = {
  id: string
  email: string
  nome?: string
  telegram_username?: string
  regiao?: string
  is_admin: boolean
}

export type TrilhaComCondicao = Trilha & {
  condicao?: Condicao
}

export const REGIOES = ['SP', 'MG', 'RJ', 'PR', 'SC', 'RS'] as const
export type Regiao = typeof REGIOES[number]

// ── Veredicto ────────────────────────────────────────────────────────────────
// Cores fiéis ao email HTML do agente Python
export const VEREDICTO_CONFIG: Record<string, {
  cor: string        // hex, para inline style (email-fiel)
  bg: string         // hex background
  emoji: string
  texto: string
  // Tailwind para UI escura (TrilhaCard)
  twColor: string
  twBg: string
  twBorder: string
  twLeftBorder: string
}> = {
  'DROP LIBERADO': {
    cor: '#16a34a', bg: '#f0fdf4', emoji: '✅', texto: 'DROP LIBERADO',
    twColor: 'text-green-400', twBg: 'bg-green-500/10',
    twBorder: 'border-green-500', twLeftBorder: 'border-l-green-500',
  },
  'ATENÇÃO': {
    cor: '#d97706', bg: '#fffbeb', emoji: '⚠️', texto: 'ATENÇÃO',
    twColor: 'text-yellow-400', twBg: 'bg-yellow-500/10',
    twBorder: 'border-yellow-500', twLeftBorder: 'border-l-yellow-500',
  },
  'MELHOR ESPERAR': {
    cor: '#ef4444', bg: '#fef2f2', emoji: '🛑', texto: 'MELHOR ESPERAR',
    twColor: 'text-red-400', twBg: 'bg-red-500/10',
    twBorder: 'border-red-500', twLeftBorder: 'border-l-red-500',
  },
}

// ── Aderência ─────────────────────────────────────────────────────────────────
// Cores e emojis fiéis ao agente Python
export const ADERENCIA_CONFIG: Record<string, { cor: string; emoji: string }> = {
  'SECO':            { cor: '#eab308', emoji: '🟡' },
  'GRIP PERFEITO':   { cor: '#22c55e', emoji: '🟢' },
  'BOA ADERÊNCIA':   { cor: '#f97316', emoji: '🟠' },
  'BAIXA ADERÊNCIA': { cor: '#ef4444', emoji: '🔴' },
}

// Cores da caixa de frase de secagem, derivadas do status de aderência
export const ADERENCIA_FRASE: Record<string, { bg: string; border: string }> = {
  'SECO':            { bg: '#f0fdf4', border: '#16a34a' },
  'GRIP PERFEITO':   { bg: '#f0fdf4', border: '#16a34a' },
  'BOA ADERÊNCIA':   { bg: '#fffbeb', border: '#d97706' },
  'BAIXA ADERÊNCIA': { bg: '#fef2f2', border: '#ef4444' },
}
