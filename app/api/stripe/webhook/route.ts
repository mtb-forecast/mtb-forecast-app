import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, PRICE_TO_PLANO } from '@/lib/stripe'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!supabaseUrl || !supabaseServiceKey || !webhookSecret) {
    return NextResponse.json({ error: 'Config missing' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const getCustomerUserId = async (customerId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single()
    return data?.id ?? null
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const priceId = sub.items.data[0]?.price?.id
    const planoId = priceId ? (PRICE_TO_PLANO[priceId] ?? 'gratuito') : 'gratuito'
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

    const userId = await getCustomerUserId(customerId)
    if (userId) {
      await supabase
        .from('profiles')
        .update({ plano: planoId, stripe_customer_id: customerId })
        .eq('id', userId)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

    const userId = await getCustomerUserId(customerId)
    if (userId) {
      await supabase
        .from('profiles')
        .update({ plano: 'gratuito' })
        .eq('id', userId)
    }
  }

  return NextResponse.json({ received: true })
}
