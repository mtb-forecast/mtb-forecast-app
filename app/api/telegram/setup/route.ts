import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const token = '8706400269:AAFm4Be2cBjbYaQnMxVBWmXo0DBoOJwgW-Y'
  const webhookUrl = 'https://www.mtbforecaster.com.br/api/telegram/webhook'

  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`
  )
  const data = await response.json()

  return NextResponse.json(data)
}
