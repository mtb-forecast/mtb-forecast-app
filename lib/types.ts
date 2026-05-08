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
  thresh_desc?: string | null

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
  alerta_vento_nivel?: string | null
  alerta_vento_kmh?: number | null
  alerta_rajada_kmh?: number | null

  // Fim de semana
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

export type Veredicto = 'DROP LIBERADO' | 'ATENÇÃO' | 'MELHOR ESPERAR'

export const REGIOES = ['SP', 'MG', 'RJ', 'PR', 'SC', 'RS'] as const
export type Regiao = typeof REGIOES[number]

export const VEREDICTO_CONFIG: Record<string, {
  color: string
  border: string
  bg: string
  text: string
  leftBorder: string
  pill: string
}> = {
  'DROP LIBERADO': {
    color: 'text-green-400',
    border: 'border-green-500',
    bg: 'bg-green-500/10',
    text: 'DROP LIBERADO',
    leftBorder: 'border-l-green-500',
    pill: 'bg-green-600/20 text-green-300 border border-green-600/40',
  },
  'ATENÇÃO': {
    color: 'text-yellow-400',
    border: 'border-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'ATENÇÃO',
    leftBorder: 'border-l-yellow-500',
    pill: 'bg-yellow-600/20 text-yellow-300 border border-yellow-600/40',
  },
  'MELHOR ESPERAR': {
    color: 'text-red-400',
    border: 'border-red-500',
    bg: 'bg-red-500/10',
    text: 'MELHOR ESPERAR',
    leftBorder: 'border-l-red-500',
    pill: 'bg-red-500/20 text-red-300 border border-red-500/40',
  },
}

export const SEM_DADOS_STYLE = {
  color: 'text-slate-400',
  border: 'border-slate-600',
  bg: '',
  leftBorder: 'border-l-slate-600',
  pill: 'bg-slate-700 text-slate-400 border border-slate-600',
}
