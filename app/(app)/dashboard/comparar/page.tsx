'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Barlow_Condensed } from 'next/font/google'
import { IconArrowLeft } from '@tabler/icons-react'
import { supabase } from '@/lib/supabase'
import { TrilhaComCondicao } from '@/lib/types'
import CondicaoCard from '@/components/CondicaoCard'
import { formatLocalidade } from '@/lib/geocoding'

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'] })

function LoadingSpin() {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, border: '2px solid #e5e5e5',
          borderTopColor: '#6d745f', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: '#888', fontSize: 14 }}>Carregando comparação...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function TrilhaColumn({ trilha, label }: { trilha: TrilhaComCondicao; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: '#2a2e25', color: '#a8b899',
        borderRadius: 8, padding: '5px 12px',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', width: 'fit-content',
      }}>
        {label}
      </div>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2a2e25', margin: '0 0 4px' }}>{trilha.name}</h2>
        <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
          {formatLocalidade(trilha.localidades, trilha.regiao)}
        </p>
      </div>
      {trilha.condicao ? (
        <CondicaoCard condicao={trilha.condicao} />
      ) : (
        <div style={{
          background: '#fff', borderRadius: 12, padding: 24,
          color: '#9CA3AF', fontSize: 14, fontStyle: 'italic',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          Condição ainda não calculada.
        </div>
      )}
    </div>
  )
}

function ComparacaoContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const idA = searchParams.get('a')
  const idB = searchParams.get('b')

  const [trilhaA, setTrilhaA] = useState<TrilhaComCondicao | null>(null)
  const [trilhaB, setTrilhaB] = useState<TrilhaComCondicao | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!idA || !idB) { router.replace('/dashboard'); return }

    async function load() {
      const { data } = await supabase
        .from('trilhas')
        .select('*, condicoes(*), previsao_blocos(bloco, label, rain_mm, wind_max, pop_max, temp_med), localidades(cidade, estado, localidade)')
        .in('id', [idA, idB])
        .order('gerado_em', { foreignTable: 'condicoes', ascending: false })
        .order('bloco', { foreignTable: 'previsao_blocos' })

      if (!data || data.length < 2) { router.replace('/dashboard'); return }

      const mapped = data.map((t: TrilhaComCondicao & { condicoes?: TrilhaComCondicao['condicao'][]; previsao_blocos?: import('@/lib/types').PrevisaoBloco[] }) => {
        const arr = Array.isArray(t.condicoes) ? t.condicoes : []
        const condicao = arr[0] ?? undefined
        const blocos = Array.isArray(t.previsao_blocos) ? [...t.previsao_blocos].sort((a, b) => a.bloco - b.bloco) : null
        if (condicao && blocos?.length) condicao.previsao_24h = blocos
        return { ...t, condicao }
      })

      setTrilhaA(mapped.find(t => t.id === idA) ?? null)
      setTrilhaB(mapped.find(t => t.id === idB) ?? null)
      setLoading(false)
    }
    load()
  }, [idA, idB, router])

  if (loading) return <LoadingSpin />
  if (!trilhaA || !trilhaB) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>
      <div className="hero-dark" style={{ background: '#2a2e25', padding: '32px 28px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link
            href="/dashboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#9CA3AF', fontSize: 13, textDecoration: 'none', marginBottom: 16 }}
          >
            <IconArrowLeft size={14} />
            Voltar ao dashboard
          </Link>
          <h1 style={{
            fontFamily: barlow.style.fontFamily,
            fontSize: 36, fontWeight: 800,
            textTransform: 'uppercase', lineHeight: 1.05, margin: 0,
          }}>
            <span style={{ color: '#a8b899' }}>Comparando</span>
            <span style={{ color: '#FFFFFF' }}> trilhas</span>
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginTop: 6 }}>
            {trilhaA.name} vs. {trilhaB.name}
          </p>
          <div style={{ background: '#a8b899', height: 3, marginTop: 20 }} />
        </div>
      </div>

      <div className="page-main-content" style={{ padding: '28px 28px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <TrilhaColumn trilha={trilhaA} label="Trilha A" />
          <TrilhaColumn trilha={trilhaB} label="Trilha B" />
        </div>
      </div>
    </div>
  )
}

export default function ComparacaoPage() {
  return (
    <Suspense fallback={<LoadingSpin />}>
      <ComparacaoContent />
    </Suspense>
  )
}
