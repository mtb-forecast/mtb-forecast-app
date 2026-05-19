export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { stripe, PLANOS } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { planoId } = await req.json()
  const plano = PLANOS[planoId as keyof typeof PLANOS]
  if (!plano || !plano.priceId) {
    return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  let customerId: string = profile?.stripe_customer_id || ''

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email || user.email || '',
      metadata: { user_id: user.id },
    })
    customerId = customer.id
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://mtb-forecast-app.vercel.app'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: plano.priceId, quantity: 1 }],
    success_url: `${appUrl}/perfil?checkout=success`,
    cancel_url: `${appUrl}/planos`,
  })

  return NextResponse.json({ url: session.url })
}
