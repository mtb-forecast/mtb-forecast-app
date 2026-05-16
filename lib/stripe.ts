import Stripe from 'stripe'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia' as any,
})

export const PLANOS = {
  gratuito: {
    id: 'gratuito',
    nome: 'Gratuito',
    preco: 0,
    priceId: null as string | null,
    descricao: 'Para começar a explorar',
    features: [
      '3 trilhas favoritas',
      '3 segmentos Strava',
      'Previsão diária básica',
    ],
  },
  plano_a: {
    id: 'plano_a',
    nome: 'Básico',
    preco: 3,
    priceId: 'price_1TXXkp9nHSRThrcwIklizBNU' as string | null,
    descricao: 'Para quem pedala todo final de semana',
    features: [
      'Trilhas favoritas ilimitadas',
      '5 segmentos Strava',
      'Previsão horária detalhada',
      'Notificações Telegram',
    ],
  },
  plano_b: {
    id: 'plano_b',
    nome: 'Pro',
    preco: 10,
    priceId: 'price_1TXXlb9nHSRThrcwYPcLMpUy' as string | null,
    descricao: 'Para riders dedicados',
    features: [
      'Tudo do Básico',
      '10 segmentos Strava',
      'Alertas de chuva em tempo real',
      'Relatório semanal de condições',
    ],
  },
  plano_c: {
    id: 'plano_c',
    nome: 'Elite',
    preco: 13,
    priceId: 'price_1TXXmL9nHSRThrcwXQ5guVwB' as string | null,
    descricao: 'Para equipes e coaches',
    features: [
      'Tudo do Pro',
      'Segmentos Strava ilimitados',
      'Acesso API',
      'Suporte prioritário',
    ],
  },
} as const

export type PlanoId = keyof typeof PLANOS

export const PRICE_TO_PLANO: Record<string, PlanoId> = {
  'price_1TXXkp9nHSRThrcwIklizBNU': 'plano_a',
  'price_1TXXlb9nHSRThrcwYPcLMpUy': 'plano_b',
  'price_1TXXmL9nHSRThrcwXQ5guVwB': 'plano_c',
}
