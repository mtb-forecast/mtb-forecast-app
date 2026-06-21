import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

async function sendMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = body?.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId: number = message?.chat?.id
    const username: string | undefined = message?.from?.username
    const text: string | undefined = message?.text

    console.log('Telegram webhook:', { username, chatId, text })

    if (!text?.startsWith('/start')) return NextResponse.json({ ok: true })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token || !supabaseUrl || !supabaseServiceKey) return NextResponse.json({ ok: true })

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Usuário sem @username no Telegram — não há como fazer o match automático
    if (!username) {
      await sendMessage(token, chatId,
        `⚠️ Sua conta do Telegram não tem um @username configurado.\n\nPara vincular ao MTB Forecaster:\n1. Vá em Configurações → Editar Perfil no Telegram\n2. Defina um @username\n3. Cadastre esse @username em mtbforecaster.com.br/perfil\n4. Envie /start novamente`
      )
      return NextResponse.json({ ok: true })
    }

    // Normaliza: remove @ e lowercase para comparação case-insensitive
    const usernameClean = username.toLowerCase().replace('@', '')

    // Busca case-insensitive com ilike — cobre @CesarLeal, @cesarleal, cesarleal etc.
    const { data: profilesComArroba } = await supabase
      .from('profiles')
      .select('id, nome, apelido')
      .ilike('telegram_username', `@${usernameClean}`)
      .limit(1)

    let profile = profilesComArroba?.[0] ?? null

    if (!profile) {
      // Fallback: salvo sem @ (ex: usuário digitou sem arroba no perfil)
      const { data: profilesSemArroba } = await supabase
        .from('profiles')
        .select('id, nome, apelido')
        .ilike('telegram_username', usernameClean)
        .limit(1)
      profile = profilesSemArroba?.[0] ?? null
    }

    console.log('Profile found:', JSON.stringify(profile))

    if (profile) {
      await supabase
        .from('profiles')
        .update({ telegram_chat_id: chatId, telegram_ativo: true })
        .eq('id', profile.id)

      const nome = profile.apelido || profile.nome || username
      await sendMessage(token, chatId,
        `🚵 *Olá, ${nome}!*\n\nVocê está conectado ao *MTB Forecaster*!\n\nA partir de agora você receberá as condições das suas trilhas favoritas todos os dias às 07:00 BRT.\n\n🔗 Acesse: mtbforecaster.com.br`
      )
    } else {
      await sendMessage(token, chatId,
        `⚠️ Não encontramos sua conta no MTB Forecaster.\n\nCertifique-se de:\n1. Ter uma conta em mtbforecaster.com.br\n2. Ter cadastrado o username *@${username}* no seu perfil\n\n🔗 mtbforecaster.com.br/perfil`
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true })
  }
}
