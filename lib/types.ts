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
  aderencia_status: string
  aderencia_score: number
  veredicto: string
  rain_mm: number
  wind_ms: number
  pico_3h: number
  acumulo_48h: number
  acumulo_ef: number
  ultima_chuva_h?: number
  meia_vida_h: number
  gust_max_kmh?: number
  janela: string
  frase_secagem: string
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

export const VEREDICTO_CONFIG: Record<string, { color: string; border: string; bg: string; text: string }> = {
  'DROP LIBERADO': {
    color: 'text-green-400',
    border: 'border-green-500',
    bg: 'bg-green-500/10',
    text: 'DROP LIBERADO',
  },
  'ATENÇÃO': {
    color: 'text-yellow-400',
    border: 'border-yellow-500',
    bg: 'bg-yellow-500/10',
    text: 'ATENÇÃO',
  },
  'MELHOR ESPERAR': {
    color: 'text-red-400',
    border: 'border-red-500',
    bg: 'bg-red-500/10',
    text: 'MELHOR ESPERAR',
  },
}
