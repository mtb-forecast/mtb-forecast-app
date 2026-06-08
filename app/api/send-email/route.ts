import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const secret = process.env.SEND_EMAIL_SECRET

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { to, subject, html } = await request.json()

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'Missing required fields: to, subject, html' }, { status: 400 })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'MTB Forecaster <noreply@mtbforecaster.com.br>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`[send-email] Resend error ${res.status}:`, errorBody)
      return NextResponse.json({ error: errorBody }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, id: data.id })
  } catch (error) {
    console.error('[send-email] Erro interno:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
