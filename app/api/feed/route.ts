export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getFeedContext, fetchFeedItems, brtDayRange, brtDayLabel } from '@/lib/feed'

export async function GET(req: NextRequest) {
  const sb = await createSupabaseServerClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const daysAgo = Math.max(1, Number(req.nextUrl.searchParams.get('daysAgo') ?? '1'))
  const userId = session.user.id

  const { trilhaIds, followingIds } = await getFeedContext(sb, userId)
  const items = await fetchFeedItems(sb, userId, trilhaIds, followingIds, brtDayRange(daysAgo))

  return NextResponse.json({ items, dateLabel: brtDayLabel(daysAgo) })
}
