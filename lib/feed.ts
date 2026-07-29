import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedItem, FeedEvento, Observacao, FeedPerfilMini, NoticiaClima } from './types'

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

// Kill switch da notícia climática (visão geral agregada, gerada por
// scripts/post_noticia_clima.py). Setar false aqui remove o card do feed do
// app instantaneamente, sem precisar desligar o workflow ou o script.
const NOTICIA_CLIMA_ATIVO = true

export type FeedRange = { startUTC: string; endUTC: string }

// Brasil não observa horário de verão desde 2019 — BRT = UTC-3 fixo o ano todo.
export function brtDayRange(daysAgo: number): FeedRange {
  const nowBRT = new Date(Date.now() - BRT_OFFSET_MS)
  const y = nowBRT.getUTCFullYear()
  const m = nowBRT.getUTCMonth()
  const d = nowBRT.getUTCDate()
  const startOfTodayUTCms = Date.UTC(y, m, d) + BRT_OFFSET_MS // meia-noite BRT, em UTC
  const startMs = startOfTodayUTCms - daysAgo * 86_400_000
  const endMs = startMs + 86_400_000
  return { startUTC: new Date(startMs).toISOString(), endUTC: new Date(endMs).toISOString() }
}

export function brtDayLabel(daysAgo: number): string {
  if (daysAgo === 0) return 'Hoje'
  if (daysAgo === 1) return 'Ontem'
  const nowBRT = new Date(Date.now() - BRT_OFFSET_MS)
  const dateBRT = new Date(nowBRT.getTime() - daysAgo * 86_400_000)
  const dd = String(dateBRT.getUTCDate()).padStart(2, '0')
  const mm = String(dateBRT.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

export async function getFeedContext(sb: SupabaseClient, userId: string) {
  const [{ data: favRows }, { data: followingRows }] = await Promise.all([
    sb.from('favoritos').select('trilha_id').eq('user_id', userId),
    sb.from('seguidores').select('following_id').eq('follower_id', userId),
  ])

  const trilhaIds = (favRows ?? []).map((f: { trilha_id: string }) => f.trilha_id)
  const followingIds = (followingRows ?? []).map((f: { following_id: string }) => f.following_id)

  return { trilhaIds, followingIds }
}

export async function fetchFeedItems(
  sb: SupabaseClient,
  userId: string,
  trilhaIds: string[],
  followingIds: string[],
  range: FeedRange,
): Promise<FeedItem[]> {
  // Pipeline: só trilhas favoritadas. Avaliações: trilhas favoritadas OU usuários seguidos.
  const eventosPromise = trilhaIds.length > 0
    ? sb
        .from('feed_eventos')
        .select('id, trilha_id, tipo, texto, veredicto, created_at')
        .in('tipo', ['pipeline', 'alerta_tempestade'])
        .in('trilha_id', trilhaIds)
        .gte('created_at', range.startUTC)
        .lt('created_at', range.endUTC)
        .order('created_at', { ascending: false })
        .limit(200)
    : Promise.resolve({ data: [] as FeedEvento[] })

  const obsPromise = (() => {
    if (trilhaIds.length === 0 && followingIds.length === 0) {
      return Promise.resolve({ data: [] as Observacao[] })
    }
    let obsQuery = sb
      .from('observacoes_trilha')
      .select('id, trilha_id, user_id, estrelas, texto, condicao_encontrada, status_trilha, veredicto_sistema, created_at, profiles (apelido, nome, email, avatar_url)')

    if (trilhaIds.length > 0 && followingIds.length > 0) {
      obsQuery = obsQuery.or(`trilha_id.in.(${trilhaIds.join(',')}),user_id.in.(${followingIds.join(',')})`)
    } else if (trilhaIds.length > 0) {
      obsQuery = obsQuery.in('trilha_id', trilhaIds)
    } else {
      obsQuery = obsQuery.in('user_id', followingIds)
    }
    return obsQuery
      .gte('created_at', range.startUTC)
      .lt('created_at', range.endUTC)
      .order('created_at', { ascending: false })
      .limit(200)
  })()

  // Só eventos em que eu (viewer) sou diretamente parte: fui seguido, ou eu segui
  // alguém. NÃO mostra "alguém que eu sigo passou a seguir outra pessoa" — isso
  // poluía o feed com atividade de terceiros sem relação comigo.
  const seguidaOr = `following_id.eq.${userId},follower_id.eq.${userId}`

  const seguidaPromise = sb
    .from('feed_eventos')
    .select('id, tipo, follower_id, following_id, created_at')
    .eq('tipo', 'seguida')
    .or(seguidaOr)
    .gte('created_at', range.startUTC)
    .lt('created_at', range.endUTC)
    .order('created_at', { ascending: false })
    .limit(200)

  // Notícia climática: broadcast para todos os usuários (não depende de
  // favoritos/seguidores). Tabela isolada — ver lib/feed.ts NOTICIA_CLIMA_ATIVO.
  const noticiaClimaPromise = NOTICIA_CLIMA_ATIVO
    ? sb
        .from('noticias_clima')
        .select('id, frase_destaque, bullets, created_at')
        .gte('created_at', range.startUTC)
        .lt('created_at', range.endUTC)
        .order('created_at', { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [] as NoticiaClima[] })

  const [{ data: eventos }, { data: observacoes }, { data: seguidas }, { data: noticiasClima }] = await Promise.all([
    eventosPromise,
    obsPromise,
    seguidaPromise,
    noticiaClimaPromise,
  ])

  const trilhaIdsParaNome = Array.from(new Set([
    ...(eventos ?? []).map((e: FeedEvento) => e.trilha_id).filter(Boolean) as string[],
    ...((observacoes ?? []) as unknown as Observacao[]).map(o => o.trilha_id).filter(Boolean) as string[],
  ]))

  const { data: trilhasData } = trilhaIdsParaNome.length > 0
    ? await sb.from('trilhas').select('id, name').in('id', trilhaIdsParaNome)
    : { data: [] as { id: string; name: string }[] }

  const nomeById = new Map((trilhasData ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  const perfilIdsSeguida = Array.from(new Set(
    ((seguidas ?? []) as FeedEvento[]).flatMap(s => [s.follower_id, s.following_id]).filter(Boolean) as string[]
  ))

  const { data: perfisData } = perfilIdsSeguida.length > 0
    ? await sb.from('profiles').select('id, apelido, nome, avatar_url').in('id', perfilIdsSeguida)
    : { data: [] as ({ id: string } & FeedPerfilMini)[] }

  const perfilById = new Map((perfisData ?? []).map(p => [p.id, p as FeedPerfilMini]))

  const eventoItems: FeedItem[] = ((eventos ?? []) as FeedEvento[]).map(e => ({
    kind: e.tipo === 'alerta_tempestade' ? 'tempestade' : 'pipeline',
    ...e,
    trilha_nome: e.trilha_id ? nomeById.get(e.trilha_id) : undefined,
  } as FeedItem))

  const obsItems: FeedItem[] = ((observacoes ?? []) as unknown as Observacao[]).map(o => ({
    kind: 'avaliacao',
    ...o,
    trilha_nome: o.trilha_id ? nomeById.get(o.trilha_id) : undefined,
  }))

  const seguidaItems: FeedItem[] = ((seguidas ?? []) as FeedEvento[]).map(s => ({
    kind: 'seguida',
    ...s,
    follower_perfil: s.follower_id ? perfilById.get(s.follower_id) : undefined,
    following_perfil: s.following_id ? perfilById.get(s.following_id) : undefined,
  }))

  const noticiaClimaItems: FeedItem[] = ((noticiasClima ?? []) as NoticiaClima[]).map(n => ({
    kind: 'noticia_clima',
    ...n,
  }))

  return [...eventoItems, ...obsItems, ...seguidaItems, ...noticiaClimaItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}
