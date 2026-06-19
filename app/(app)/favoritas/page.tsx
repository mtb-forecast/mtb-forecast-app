'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientUser } from '@/lib/supabase'
import TrilhaCard from '@/components/TrilhaCard'
import type { TrilhaComCondicao } from '@/lib/types'

const RANKING_VEREDICTO: Record<string, number> = {
  'DROP LIBERADO': 0,
  'DROP LIBERADO - Veja os alertas': 1,
  'MELHOR ESPERAR': 2,
}
const RANKING_ADERENCIA: Record<string, number> = {
  'GRIP PERFEITO': 0, 'SECO': 1, 'BOA ADERÊNCIA': 2, 'BAIXA ADERÊNCIA': 3,
}

export default function FavoritasPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())
  const [trilhas, setTrilhas] = useState<TrilhaComCondicao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: favIds } = await supabase
        .from('favoritos')
        .select('trilha_id')
        .eq('user_id', user.id)

      const ids = (favIds ?? []).map((f: { trilha_id: string }) => f.trilha_id)
      setFavoritos(new Set(ids))

      if (!ids.length) { setLoading(false); return }

      const { data } = await supabase
        .from('trilhas')
        .select(`
          id, name, bioma, trail_type, regiao,
          localidades(cidade, estado, localidade),
          mantenedor:mantenedores(id,nome,nome_primario,nome_secundario,cor_primaria,cor_secundaria,logo_url,site_url),
          condicoes(
            veredicto, veredicto_12h,
            aderencia_status, aderencia_futura_status, aderencia_futura_label,
            pico_3h, wind_ms, acumulo_48h, ultima_chuva_h,
            texto_dinamico, frase_secagem, gerado_em
          )
        `)
        .in('id', ids)
        .eq('aprovada', true)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped = (data as any[] ?? []).map((t) => {
        const arr = Array.isArray(t.condicoes) ? t.condicoes : []
        arr.sort((a: { gerado_em: string }, b: { gerado_em: string }) =>
          new Date(b.gerado_em).getTime() - new Date(a.gerado_em).getTime()
        )
        return { ...t, condicao: arr[0] ?? undefined } as TrilhaComCondicao
      })

      mapped.sort((a, b) => {
        const vA = RANKING_VEREDICTO[a.condicao?.veredicto_12h || a.condicao?.veredicto || ''] ?? 99
        const vB = RANKING_VEREDICTO[b.condicao?.veredicto_12h || b.condicao?.veredicto || ''] ?? 99
        if (vA !== vB) return vA - vB
        const aA = RANKING_ADERENCIA[a.condicao?.aderencia_status || ''] ?? 99
        const aB = RANKING_ADERENCIA[b.condicao?.aderencia_status || ''] ?? 99
        return aA - aB
      })

      setTrilhas(mapped)
      setLoading(false)
    }
    load()
  }, [router])

  const toggleFavorito = useCallback(async (trilhaId: string) => {
    if (!userId) return
    if (favoritos.has(trilhaId)) {
      await supabase.from('favoritos').delete().eq('user_id', userId).eq('trilha_id', trilhaId)
      setFavoritos(prev => { const s = new Set(prev); s.delete(trilhaId); return s })
      setTrilhas(prev => prev.filter(t => t.id !== trilhaId))
    } else {
      await supabase.from('favoritos').insert({ user_id: userId, trilha_id: trilhaId })
      setFavoritos(prev => new Set([...prev, trilhaId]))
    }
  }, [userId, favoritos])

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* Header */}
      <div style={{ background: '#2a2e25', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/dashboard" style={{
            fontSize: 13, color: '#a8b899', textDecoration: 'none',
            display: 'inline-block', marginBottom: 16,
          }}>
            ← Dashboard
          </Link>
          <h1 style={{
            fontSize: 36, fontWeight: 800, textTransform: 'uppercase',
            color: '#FFFFFF', lineHeight: 1.05, margin: 0,
          }}>
            Minhas favoritas
          </h1>
          {!loading && (
            <p style={{ fontSize: 13, color: '#a8b899', marginTop: 8, marginBottom: 0 }}>
              {trilhas.length} trilha{trilhas.length !== 1 ? 's' : ''} monitorada{trilhas.length !== 1 ? 's' : ''}
            </p>
          )}
          <div style={{ background: '#a8b899', height: 3, marginTop: 20 }} />
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div className="spin-indicator" />
          </div>
        )}

        {!loading && trilhas.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 12, border: '0.5px solid #E5E7EB',
            padding: '40px 24px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, color: '#9CA3AF', marginBottom: 16 }}>
              Você ainda não tem trilhas favoritas.
            </p>
            <Link href="/trilhas" style={{
              background: '#FFE000', color: '#1A1A1A', fontWeight: 700,
              borderRadius: 999, padding: '8px 20px', fontSize: 13,
              textDecoration: 'none', display: 'inline-block',
            }}>
              Explorar trilhas
            </Link>
          </div>
        )}

        {!loading && trilhas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {trilhas.map(t => (
              <TrilhaCard
                key={t.id}
                trilha={t}
                isFavorito={favoritos.has(t.id)}
                onToggleFavorito={toggleFavorito}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
