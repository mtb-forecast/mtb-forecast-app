import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('Telegram webhook received:', JSON.stringify(body))
    const message = body?.message

    if (!message) return NextResponse.json({ ok: true })

    const chatId = message?.chat?.id
    const username = message?.from?.username
    const text = message?.text
    console.log('Username from Telegram:', username)
    console.log('Chat ID:', chatId)
    console.log('Text:', text)

    if (text === '/start' || text?.startsWith('/start')) {
      const supabase = createRouteHandlerClient({ cookies })

      const token = process.env.TELEGRAM_BOT_TOKEN
      console.log('Token from config:', token ? 'found' : 'NOT FOUND')
      if (!token) return NextResponse.json({ ok: true })

      if (username) {
        const usernameClean = username.toLowerCase().replace('@', '')

        // Tenta buscar com @ primeiro
        let profile = null

        const { data: profilesComArroba } = await supabase
          .from('profiles')
          .select('id, nome, apelido')
          .eq('telegram_username', `@${usernameClean}`)
          .limit(1)

        if (profilesComArroba && profilesComArroba.length > 0) {
          profile = profilesComArroba[0]
        } else {
          // Tenta sem @
          const { data: profilesSemArroba } = await supabase
            .from('profiles')
            .select('id, nome, apelido')
            .eq('telegram_username', usernameClean)
            .limit(1)

          if (profilesSemArroba && profilesSemArroba.length > 0) {
            profile = profilesSemArroba[0]
          }
        }

        console.log('Profile found:', JSON.stringify(profile))

        if (profile) {
          await supabase
            .from('profiles')
            .update({
              telegram_chat_id: chatId,
              telegram_ativo: true,
            })
            .eq('id', profile.id)

          const nome = profile.apelido || profile.nome || username

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `🚵 *Olá, ${nome}!*\n\nVocê está conectado ao *MTB Forecaster*!\n\nA partir de agora você receberá as condições das suas trilhas favoritas todos os dias às 07:00 BRT.\n\n🔗 Acesse: mtbforecaster.com.br`,
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
