import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = body?.message

    if (!message) return NextResponse.json({ ok: true })

    const chatId = message?.chat?.id
    const username = message?.from?.username
    const text = message?.text

    if (text === '/start' || text?.startsWith('/start')) {
      const supabase = createRouteHandlerClient({ cookies })

      const { data: config } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'telegram_bot_token')
        .single()

      const token = config?.valor
      if (!token) return NextResponse.json({ ok: true })

      if (username) {
        const telegramUsername = username.toLowerCase().replace('@', '')

        const { error } = await supabase
          .from('profiles')
          .update({
            telegram_chat_id: chatId,
            telegram_ativo: true,
          })
          .ilike('telegram_username', `%${telegramUsername}%`)

        if (!error) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `🚵 *Olá, @${username}!*\n\nVocê está conectado ao *MTB Forecaster*!\n\nA partir de agora você receberá as condições das suas trilhas favoritas todos os dias às 07:00 BRT.\n\n🔗 Acesse: mtbforecaster.com.br`,
              parse_mode: 'Markdown',
            }),
          })
        } else {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `⚠️ Não encontramos sua conta no MTB Forecaster.\n\nCertifique-se de:\n1. Ter uma conta em mtbforecaster.com.br\n2. Ter cadastrado seu username @${username} no perfil\n\n🔗 mtbforecaster.com.br/perfil`,
              parse_mode: 'Markdown',
            }),
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
