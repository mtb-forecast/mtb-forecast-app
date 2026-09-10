// Notifica (Telegram + e-mail) quem acabou de ser adicionado como colaborador
// de uma seleção de trilhas. O evento de Feed é responsabilidade do trigger
// de banco (fn_feed_evento_selecao_membro) — aqui só os canais externos, que
// Postgres não consegue disparar sozinho. Server-only (usa env vars).
const APP_URL = 'https://www.mtbforecaster.com.br'

type PerfilNotif = {
  nome?: string | null
  apelido?: string | null
  email?: string | null
  telegram_ativo?: boolean | null
  telegram_chat_id?: number | string | null
}

type SelecaoNotif = {
  id: string
  nome: string
  data: string // YYYY-MM-DD
}

function formatDataBR(data: string): string {
  const [y, m, d] = data.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function notificarNovoMembroSelecao(perfil: PerfilNotif, selecao: SelecaoNotif): Promise<void> {
  const nome = perfil.apelido || perfil.nome || 'Rider'
  const dataFmt = formatDataBR(selecao.data)
  const link = `${APP_URL}/selecoes/${selecao.id}`

  await Promise.allSettled([
    enviarTelegram(perfil, selecao, nome, dataFmt, link),
    enviarEmail(perfil, nome, selecao, dataFmt, link),
  ])
}

async function enviarTelegram(perfil: PerfilNotif, selecao: SelecaoNotif, nome: string, dataFmt: string, link: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !perfil.telegram_ativo || !perfil.telegram_chat_id) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: perfil.telegram_chat_id,
        text: `📅 *${nome}*, você foi adicionado à seleção *${selecao.nome}* — ${dataFmt}.\n\n🔗 [Ver seleção](${link})`,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
  } catch (err) {
    console.error('[notificarSelecao] erro ao enviar Telegram:', err)
  }
}

async function enviarEmail(perfil: PerfilNotif, nome: string, selecao: SelecaoNotif, dataFmt: string, link: string) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || !perfil.email) return
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'MTB Forecaster <noreply@mtbforecaster.com.br>',
        to: [perfil.email],
        subject: `Você foi adicionado à seleção "${selecao.nome}"`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #1A1D18;">
            <h2 style="margin: 0 0 12px;">🚵 ${nome}, bora pedalar?</h2>
            <p style="font-size: 14px; line-height: 1.6;">
              Você foi adicionado à seleção <strong>${selecao.nome}</strong>, marcada pra <strong>${dataFmt}</strong>.
              Você pode ver as trilhas escolhidas e adicionar as suas.
            </p>
            <p style="margin: 20px 0;">
              <a href="${link}" style="background:#6d745f; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; display:inline-block; font-weight:600;">
                Ver seleção
              </a>
            </p>
          </div>
        `,
      }),
    })
    if (!res.ok) {
      console.error('[notificarSelecao] Resend respondeu', res.status, await res.text())
    }
  } catch (err) {
    console.error('[notificarSelecao] erro ao enviar e-mail:', err)
  }
}
