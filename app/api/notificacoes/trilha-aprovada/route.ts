import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { logApiUsage } from '@/lib/api-usage-log'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )

    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!adminProfile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { user_id, trail_name } = await request.json()
    if (!user_id || !trail_name) return NextResponse.json({ ok: true })

    const { data: profile } = await supabase
      .from('profiles')
      .select('nome, apelido, email, receber_email, telegram_chat_id, telegram_ativo')
      .eq('id', user_id)
      .single()

    if (!profile) return NextResponse.json({ ok: true })

    const nome = profile.apelido || profile.nome || 'ciclista'

    if (profile.telegram_ativo && profile.telegram_chat_id) {
      const token = process.env.TELEGRAM_BOT_TOKEN
      if (token) {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: profile.telegram_chat_id,
            text: `✅ *Trilha aprovada!*\n\nOlá, ${nome}! Sua trilha *${trail_name}* foi aprovada e já está disponível no MTB Forecaster. 🚵\n\n🔗 mtbforecaster.com.br/trilhas`,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          }),
        })
        void logApiUsage('telegram', 'sendMessage', { sucesso: tgRes.ok ? 1 : 0, falhas: tgRes.ok ? 0 : 1 })
      }
    }

    if (profile.receber_email && profile.email) {
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: 'MTB Forecaster <noreply@mtbforecaster.com.br>',
            to: [profile.email],
            subject: `✅ Sua trilha "${trail_name}" foi aprovada!`,
            html: `
              <p>Olá, ${nome}!</p>
              <p>Sua trilha <strong>${trail_name}</strong> foi aprovada e já está disponível no MTB Forecaster.</p>
              <p><a href="https://mtbforecaster.com.br/trilhas">Ver trilhas →</a></p>
              <br>
              <p>Abraços,<br>Equipe MTB Forecaster</p>
            `,
          }),
        })
        void logApiUsage('resend', 'emails', { sucesso: emailRes.ok ? 1 : 0, falhas: emailRes.ok ? 0 : 1 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao enviar notificação de aprovação:', error)
    return NextResponse.json({ ok: true })
  }
}
