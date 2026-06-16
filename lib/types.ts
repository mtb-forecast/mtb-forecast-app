export type PrevisaoBloco = {
  bloco: number
  label: string
  rain_mm: number
  wind_max: number
  pop_max: number
  temp_med: number
}

export type Mantenedor = {
  id: string
  nome: string
  nome_primario: string | null
  nome_secundario: string | null
  cor_primaria: string
  cor_secundaria: string | null
  logo_url: string | null
  site_url: string | null
  ativo: boolean
  criado_em: string
}

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
  polyline?: string | null
  localidades?: { cidade: string; estado: string; localidade: string | null } | null
  previsao_blocos?: PrevisaoBloco[] | null
  mantenedor?: Mantenedor | null
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
  limiar_descanso?: number | null
  grip_threshold_ef?: number | null

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
  temp_min?: number | null

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

  // Aderência futura
  aderencia_futura_status?: string | null
  aderencia_futura_label?: string | null
  aderencia_futura_rain?: number | null

  // Veredicto dinâmico
  texto_dinamico?: string | null
  motivo_veredicto?: string | null

  // Previsão 24h em blocos de 6h — populado via merge de previsao_blocos na query, não vem do banco
  previsao_24h?: PrevisaoBloco[] | null

  // Fim de semana D+1/D+2/D+3
  fds_d1_veredicto?: string | null
  fds_d1_rain?: number | null
  fds_d1_wind?: number | null
  fds_d1_temp?: number | null
  fds_d1_temp_min?: number | null
  fds_d1_pop?: number | null
  fds_d2_veredicto?: string | null
  fds_d2_rain?: number | null
  fds_d2_wind?: number | null
  fds_d2_temp?: number | null
  fds_d2_temp_min?: number | null
  fds_d2_pop?: number | null
  fds_d3_veredicto?: string | null
  fds_d3_rain?: number | null
  fds_d3_wind?: number | null
  fds_d3_temp?: number | null
  fds_d3_temp_min?: number | null
  fds_d3_pop?: number | null
}

export type Profile = {
  id: string
  email: string
  nome?: string
  apelido?: string
  data_nascimento?: string | null
  cidade?: string
  telefone?: string
  telefone_whatsapp?: boolean
  telegram_username?: string
  telegram_chat_id?: string | null
  telegram_ativo?: boolean
  instagram?: string
  facebook?: string
  strava_id?: string
  regiao?: string
  is_admin: boolean
  plano?: string
  stripe_customer_id?: string
  avatar_url?: string | null
  receber_email?: boolean
}

export type TrilhaComCondicao = Trilha & {
  condicao?: Condicao
}

export type CondicaoPumptrack = {
  gerado_em: string
  rain_mm: number | null
  pico_3h: number | null
  wind_kmh: number | null
  temp_max: number | null
  temp_min: number | null
  pop_48h: number | null
}

export type PumpTrack = {
  id: string
  nome: string
  cidade: string | null
  uf: string | null
  endereco: string | null
  latitude: number
  longitude: number
  tipo_superficie: string | null
  comprimento_estimado: string | null
  iluminacao: string | null
  estacionamento: string | null
  fonte: string | null
  google_maps_url: string | null
  instagram: string | null
  status_validacao: string | null
  condicao?: CondicaoPumptrack
}

export type Observacao = {
  id: string
  trilha_id?: string | null
  strava_segment_id?: number | null
  user_id: string
  estrelas: number
  texto: string
  condicao_encontrada?: string | null
  veredicto_sistema?: string
  created_at: string
  profiles?: {
    apelido?: string
    nome?: string
    email?: string
  }
}

export const REGIOES = ['SP', 'MG', 'RJ', 'PR', 'SC', 'RS', 'outros'] as const
export type Regiao = typeof REGIOES[number]

export const ESTADOS_BRASIL = [
  { value: 'AC', label: 'AC — Acre' },
  { value: 'AL', label: 'AL — Alagoas' },
  { value: 'AP', label: 'AP — Amapá' },
  { value: 'AM', label: 'AM — Amazonas' },
  { value: 'BA', label: 'BA — Bahia' },
  { value: 'CE', label: 'CE — Ceará' },
  { value: 'DF', label: 'DF — Distrito Federal' },
  { value: 'ES', label: 'ES — Espírito Santo' },
  { value: 'GO', label: 'GO — Goiás' },
  { value: 'MA', label: 'MA — Maranhão' },
  { value: 'MT', label: 'MT — Mato Grosso' },
  { value: 'MS', label: 'MS — Mato Grosso do Sul' },
  { value: 'MG', label: 'MG — Minas Gerais' },
  { value: 'PA', label: 'PA — Pará' },
  { value: 'PB', label: 'PB — Paraíba' },
  { value: 'PR', label: 'PR — Paraná' },
  { value: 'PE', label: 'PE — Pernambuco' },
  { value: 'PI', label: 'PI — Piauí' },
  { value: 'RJ', label: 'RJ — Rio de Janeiro' },
  { value: 'RN', label: 'RN — Rio Grande do Norte' },
  { value: 'RS', label: 'RS — Rio Grande do Sul' },
  { value: 'RO', label: 'RO — Rondônia' },
  { value: 'RR', label: 'RR — Roraima' },
  { value: 'SC', label: 'SC — Santa Catarina' },
  { value: 'SP', label: 'SP — São Paulo' },
  { value: 'SE', label: 'SE — Sergipe' },
  { value: 'TO', label: 'TO — Tocantins' },
]

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
  'DROP LIBERADO - Veja os alertas': {
    cor: '#d97706', bg: '#fffbeb', emoji: '⚠️', texto: 'DROP LIBERADO - Veja os alertas',
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
