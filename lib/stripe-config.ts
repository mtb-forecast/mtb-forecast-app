import { HORARIOS_RESUMO, HORARIOS_LABEL } from './schedule'

export const PLANOS = {
  plano_a: {
    id: 'plano_a',
    nome: 'Básico',
    preco: 0,
    priceId: null as string | null,
    descricao: 'Para quem pedala todo final de semana',
    em_construcao: false,
    features: [
      'Notificação via Telegram',
      'Monitoramento de trilhas públicas',
      `Reports: ${HORARIOS_RESUMO}`,
      'Receba o email do report diário',
    ],
  },
  plano_b: {
    id: 'plano_b',
    nome: 'Pro',
    preco: 10,
    priceId: 'price_1TXXlb9nHSRThrcwYPcLMpUy' as string | null,
    descricao: 'Para riders dedicados',
    em_construcao: true,
    features: [
      'Notificação Telegram + WhatsApp',
      'Monitoramento de trilhas públicas',
      'Integração com Strava (segmentos favoritos)',
      `Até 4 horários de notificação (${HORARIOS_LABEL})`,
      'Alertas de avaliações recentes nas trilhas favoritas',
    ],
  },
  plano_c: {
    id: 'plano_c',
    nome: 'Trail Builder',
    preco: 13,
    priceId: 'price_1TXXmL9nHSRThrcwXQ5guVwB' as string | null,
    descricao: 'Para equipes e coaches',
    em_construcao: true,
    features: [
      'Notificação Telegram + WhatsApp',
      'Monitoramento de trilhas públicas',
      'Integração com Strava (segmentos favoritos)',
      `Até 4 horários de notificação (${HORARIOS_LABEL})`,
      'Alertas de avaliações recentes nas trilhas favoritas',
      '10% da assinatura vai para TrailBuilders da sua região',
    ],
  },
}

export type PlanoId = 'plano_a' | 'plano_b' | 'plano_c'

export const PRICE_TO_PLANO: Record<string, PlanoId> = {
  'price_1TXXkp9nHSRThrcwIklizBNU': 'plano_a',
  'price_1TXXlb9nHSRThrcwYPcLMpUy': 'plano_b',
  'price_1TXXmL9nHSRThrcwXQ5guVwB': 'plano_c',
}

export const CODIGOS_PROMO: Record<string, PlanoId> = {
  'MTB-BASIC-R1D3': 'plano_a',
  'MTB-BASIC-TR4L': 'plano_a',
  'MTB-BASIC-END5': 'plano_a',
  'MTB-BASIC-DH7X': 'plano_a',
  'MTB-BASIC-XC9K': 'plano_a',
  'MTB-PRO-S3RR4':  'plano_b',
  'MTB-PRO-J4PI2':  'plano_b',
  'MTB-PRO-C4N4S':  'plano_b',
  'MTB-PRO-GR4U':   'plano_b',
  'MTB-PRO-P1NH3':  'plano_b',
  'MTB-ELITE-SP1':  'plano_c',
  'MTB-ELITE-MG2':  'plano_c',
  'MTB-ELITE-DH3':  'plano_c',
  'MTB-ELITE-BR4':  'plano_c',
  'MTB-ELITE-MTB5': 'plano_c',
}
