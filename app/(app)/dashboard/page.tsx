'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Barlow_Condensed } from 'next/font/google'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao, Profile } from '@/lib/types'
import TrilhaCard from '@/components/TrilhaCard'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'] })

// ── ranking ──────────────────────────────────────────────────────────────────

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

// ── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [favoritas, setFavoritas] = useState<TrilhaComCondicao[]>([])
  const [avaliacoesPorTrilha, setAvaliacoesPorTrilha] = useState<Record<string, { count: number; media: number }>>({})
  const [loading, setLoading] = useState(true)
  const [selecionadas, setSelecionadas] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserEmail(user.email ?? null)

      const h48atras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

      const [{ data: profileData }, { data: favIds }, { data: avaliacoes48h }] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
          supabase.from('observacoes_trilha').select('trilha_id, estrelas, created_at').gte('created_at', h48atras),
        ])

      setProfile(profileData)

      const { data: trilhasData } = favIds && favIds.length > 0
        ? await supabase
            .from('trilhas').select(`*, condicoes(*), previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med), localidades(cidade, estado, localidade)`)
            .in('id', favIds.map((f: { trilha_id: string }) => f.trilha_id)).eq('aprovada', true)
            .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
            .order('bloco', { foreignTable: 'previsao_blocos' })
        : { data: null }

      if (trilhasData) {
        const mapped = trilhasData.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][]; previsao_blocos?: import('@/lib/types').PrevisaoBloco[] }) => {
          const arr = Array.isArray(t.condicoes) ? t.condicoes : []
          const condicao = arr[0] ?? undefined
          const blocos = Array.isArray(t.previsao_blocos) ? [...t.previsao_blocos].sort((a, b) => a.bloco - b.bloco) : null
          if (condicao && blocos?.length) condicao.previsao_24h = blocos
          return { ...t, condicao }
        })
        const trilhasOrdenadas = [...mapped].sort((a, b) => {
          const vA = RANKING_VEREDICTO[a.condicao?.veredicto_12h || a.condicao?.veredicto || ''] ?? 99
          const vB = RANKING_VEREDICTO[b.condicao?.veredicto_12h || b.condicao?.veredicto || ''] ?? 99
          if (vA !== vB) return vA - vB
          const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
          const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
          return aA - aB
        })
        setFavoritas(trilhasOrdenadas)
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

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, border: '2px solid #e5e5e5',
            borderTopColor: '#111', borderRadius: '50%',
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
    <div style={{ minHeight: '100vh', background: '#F8F9FA' }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#1A1A1A', padding: '32px 28px 28px' }}>
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
                <span style={{ color: '#FFE000' }}>{name}</span>
                <span style={{ color: '#FFFFFF' }}>.</span>
              </>
            ) : (
              <span style={{ color: '#FFFFFF' }}>Dashboard.</span>
            )}
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: 14, marginTop: 8 }}>
            Confira as condições de hoje nas suas trilhas
          </p>
          <div style={{ background: '#FFE000', height: 3, marginTop: 20 }} />
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
                fontSize: 13, fontWeight: 500, color: '#111',
                background: '#FFE000', border: '1.5px solid #111',
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

        {/* Seção: Trilhas favoritas */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 500, color: '#111111' }}>Minhas trilhas favoritas</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {selecionadas.length === 2 && (
                <Link
                  href={`/dashboard/comparar?a=${selecionadas[0]}&b=${selecionadas[1]}`}
                  style={{
                    background: '#FFE000', color: '#111', border: '1.5px solid #111',
                    borderRadius: 4, padding: '6px 14px', fontSize: 13, fontWeight: 600,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <i className="ti ti-arrows-diff" style={{ fontSize: 14 }} />
                  Comparar trilhas
                </Link>
              )}
              <Link href="/trilhas" style={{ fontSize: 13, color: '#6B7280', fontWeight: 400, textDecoration: 'none' }}>
                Ver todas →
              </Link>
            </div>
          </div>
          {favoritas.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #E5E7EB', borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 16 }}>Você ainda não tem trilhas favoritas.</p>
              <Link href="/trilhas" style={{
                background: '#FFE000', color: '#111',
                border: '1.5px solid #111', borderRadius: 4,
                padding: '10px 20px', fontSize: 13, fontWeight: 500,
                textDecoration: 'none',
              }}>
                Explorar trilhas
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {favoritas.map(t => {
                const isSel = selecionadas.includes(t.id)
                const canSelect = isSel || selecionadas.length < 2
                return (
                  <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      borderRadius: 16,
                      outline: isSel ? '2.5px solid #FFE000' : '2.5px solid transparent',
                      transition: 'outline 0.15s',
                    }}>
                      <TrilhaCard trilha={t} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setSelecionadas(prev =>
                          prev.includes(t.id) ? prev.filter(id => id !== t.id) : prev.length < 2 ? [...prev, t.id] : prev
                        )}
                        disabled={!canSelect}
                        style={{
                          background: isSel ? '#1A1A1A' : '#F3F4F6',
                          color: isSel ? '#FFE000' : '#6B7280',
                          border: isSel ? '1.5px solid #1A1A1A' : '1.5px solid #E5E7EB',
                          borderRadius: 6, fontSize: 12, fontWeight: 600,
                          padding: '4px 12px', cursor: canSelect ? 'pointer' : 'not-allowed',
                          opacity: canSelect ? 1 : 0.5,
                          display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'all 0.15s',
                        }}
                      >
                        <i className={`ti ${isSel ? 'ti-check' : 'ti-plus'}`} style={{ fontSize: 12 }} />
                        {isSel ? 'Selecionada' : 'Comparar'}
                      </button>
                      {avaliacoesPorTrilha[t.id] && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 11, fontWeight: 500, color: '#92400E',
                          background: '#FFFBEB', borderRadius: 6,
                          padding: '3px 9px',
                        }}>
                          <i className="ti ti-star-filled" style={{ fontSize: 12, color: '#F59E0B' }} />
                          {avaliacoesPorTrilha[t.id].media}
                          <span style={{ color: '#888', fontWeight: 400 }}>
                            ({avaliacoesPorTrilha[t.id].count} avaliação{avaliacoesPorTrilha[t.id].count > 1 ? 'ões' : ''} recente{avaliacoesPorTrilha[t.id].count > 1 ? 's' : ''})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>
      <PWAInstallPrompt />
    </div>
  )
}
