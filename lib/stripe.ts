import Stripe from 'stripe'
export { PLANOS, PRICE_TO_PLANO } from './stripe-config'
export type { PlanoId } from './stripe-config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia' as any,
})
