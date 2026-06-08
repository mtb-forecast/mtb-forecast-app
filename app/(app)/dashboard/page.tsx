'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Barlow_Condensed } from 'next/font/google'
import { supabase, getClientUser } from '@/lib/supabase'
import { TrilhaComCondicao, Profile } from '@/lib/types'
import DashboardTrailCard from '@/components/DashboardTrailCard'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'] })

const RANKING_VEREDICTO: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}

const RANKING_ADERENCIA: Record<string, number> = {
  'GRIP PERFEITO': 0,
  'SECO': 1,
  'BOA ADERÊNCIA': 2,
  'BAIXA ADERÊNCIA': 3,
}

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [favoritas, setFavoritas] = useState<TrilhaComCondicao[]>([])
  const [avaliacoesPorTrilha, setAvaliacoesPorTrilha] = useState<Record<string, { count: number; media: number }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const user = await getClientUser()
        if (!user) { window.location.href = '/login'; return }
        setUserEmail(user.email ?? null)

        // Step 1 — profile + favorites in parallel
        const [{ data: profileData }, { data: favIds }] = await Promise.all([
          supabase.from('profiles').select('id, email, is_admin, nome, apelido, telefone, regiao').eq('id', user.id).single(),
          supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
        ])

        setProfile(profileData)

        if (!favIds || favIds.length === 0) {
          setLoading(false)
          return
        }

        const favTrilhaIds = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const h48atras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

        // Step 2 — trails + evaluations in parallel, both filtered by favorite IDs
        const [{ data: trilhasData }, { data: avaliacoes48h }] = await Promise.all([
          supabase
            .from('trilhas')
            .select(`
              id, name, bioma, trail_type, regiao,
              localidades(cidade, estado, localidade),
              condicoes(
                veredicto, veredicto_12h,
                aderencia_status, aderencia_futura_status, aderencia_futura_label,
                pico_3h, wind_ms, acumulo_48h, ultima_chuva_h,
                texto_dinamico, frase_secagem, janela, gerado_em
              )
            `)
            .in('id', favTrilhaIds)
            .eq('aprovada', true)
            .order('gerado_em', { foreignTable: 'condicoes', ascending: false }),
          supabase
            .from('observacoes_trilha')
            .select('trilha_id, estrelas')
            .gte('created_at', h48atras)
            .in('trilha_id', favTrilhaIds),
        ])

        if (trilhasData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped = (trilhasData as any[]).map((t) => {
            const arr = Array.isArray(t.condicoes) ? t.condicoes : []
            return { ...t, condicao: arr[0] ?? undefined } as TrilhaComCondicao
          })
          const sorted = [...mapped].sort((a, b) => {
            const vA = RANKING_VEREDICTO[a.condicao?.veredicto_12h || a.condicao?.veredicto || ''] ?? 99
            const vB = RANKING_VEREDICTO[b.condicao?.veredicto_12h || b.condicao?.veredicto || ''] ?? 99
            if (vA !== vB) return vA - vB
            const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
            const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
            return aA - aB
          })
          setFavoritas(sorted)
        }

        const porTrilha: Record<string, { count: number; media: number }> = {}
        for (const av of avaliacoes48h || []) {
          if (av.trilha_id) {
            if (!porTrilha[av.trilha_id]) porTrilha[av.trilha_id] = { count: 0, media: 0 }
            porTrilha[av.trilha_id].count++
            porTrilha[av.trilha_id].media += av.estrelas
          }
        }
        Object.values(porTrilha).forEach(d => { d.media = Math.round(d.media / d.count * 10) / 10 })
        setAvaliacoesPorTrilha(porTrilha)
      } catch (err) {
        console.error('Erro ao carregar dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const summary = useMemo(() => {
    if (favoritas.length === 0) return null
    let liberadas = 0, comAlerta = 0, aguardando = 0
    for (const t of favoritas) {
      const v = t.condicao?.veredicto_12h?.trim() || t.condicao?.veredicto?.trim() || ''
      if (v === 'DROP LIBERADO') liberadas++
      else if (v === 'DROP LIBERADO - Veja os alertas' || v === 'MELHOR ESPERAR') comAlerta++
      else aguardando++
    }
    return { liberadas, comAlerta, aguardando }
  }, [favoritas])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, border: '2px solid #e5e5e5',
            borderTopColor: '#6d745f', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
          }} />
          <p style={{ color: '#888', fontSize: 14 }}>Carregando condições...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const name = profile?.apelido || profile?.nome?.split(' ')[0] || userEmail?.split('@')[0]

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#2a2e25', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h1 style={{
            fontFamily: barlow.style.fontFamily,
            fontSize: 42, fontWeight: 800,
            textTransform: 'uppercase', lineHeight: 1.05,
            margin: 0,
          }}>
            {name ? (
              <>
                <span style={{ color: '#FFFFFF' }}>Olá, </span>
                <span style={{ color: '#a8b899' }}>{name}</span>
                <span style={{ color: '#FFFFFF' }}>.</span>
              </>
            ) : (
              <span style={{ color: '#FFFFFF' }}>Dashboard.</span>
            )}
          </h1>

          {/* Summary strip */}
          {summary ? (
            <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
              {summary.liberadas > 0 && (
                <span style={{ fontSize: 13, color: '#4ADE80', fontWeight: 500 }}>
                  ✅ {summary.liberadas} liberada{summary.liberadas !== 1 ? 's' : ''}
                </span>
              )}
              {summary.comAlerta > 0 && (
                <span style={{ fontSize: 13, color: '#FCD34D', fontWeight: 500 }}>
                  ⚠️ {summary.comAlerta} com alerta
                </span>
              )}
              {summary.aguardando > 0 && (
                <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500 }}>
                  ⏳ {summary.aguardando} sem dados
                </span>
              )}
            </div>
          ) : (
            <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 8 }}>
              Confira as condições de hoje nas suas trilhas
            </p>
          )}

          <div style={{ background: '#a8b899', height: 3, marginTop: 20 }} />
        </div>
      </div>

      {/* Banner de perfil incompleto */}
      {!(profile?.nome && profile?.apelido && profile?.telefone && profile?.regiao) && (
        <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 28px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, color: '#92400e' }}>
              ⚠️ Complete seu perfil para aproveitar todos os recursos
            </p>
            <Link
              href="/perfil"
              style={{
                fontSize: 13, fontWeight: 500, color: '#fff',
                background: '#6d745f', border: 'none',
                borderRadius: 4, padding: '6px 16px',
                whiteSpace: 'nowrap', textDecoration: 'none',
              }}
            >
              Completar perfil
            </Link>
          </div>
        </div>
      )}

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#2a2e25' }}>Minhas trilhas favoritas</h2>
            <Link href="/trilhas" style={{ fontSize: 13, color: '#6B7280', fontWeight: 400, textDecoration: 'none' }}>
              Ver todas →
            </Link>
          </div>

          {favoritas.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16 }}>Você ainda não tem trilhas favoritas.</p>
              <Link href="/trilhas" style={{
                background: '#6d745f', color: '#fff',
                border: 'none', borderRadius: 4,
                padding: '10px 20px', fontSize: 13, fontWeight: 500,
                textDecoration: 'none',
              }}>
                Explorar trilhas
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {favoritas.map(t => (
                <DashboardTrailCard
                  key={t.id}
                  trilha={t}
                  avaliacao={avaliacoesPorTrilha[t.id]}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Banner Pump Tracks ────────────────────────────────────── */}
        <Link
          href="/trilhas"
          style={{ textDecoration: 'none', display: 'block', marginTop: 20 }}
        >
          <div style={{
            background: 'linear-gradient(135deg, #2D1B69 0%, #1E1040 100%)',
            border: '1px solid #3D2A8A',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: '#7C3AED',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                🟣
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 3px' }}>
                  Pump Tracks no Brasil
                </p>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                  Locais homologados com previsão do tempo e navegação via Waze
                </p>
              </div>
            </div>
            <span style={{ fontSize: 12, color: '#A78BFA', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
              Ver locais →
            </span>
          </div>
        </Link>

      </div>
      <PWAInstallPrompt />
    </div>
  )
}
