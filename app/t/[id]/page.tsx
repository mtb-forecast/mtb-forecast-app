import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { IconLock } from '@tabler/icons-react'

// Página pública — sem cookies, sem auth → pode ser cacheada via ISR
export const revalidate = 3600

function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Skeleton estático (sem dependência de dados) — pinta no primeiro flush do
// stream, enquanto a query da trilha roda em paralelo. Só importa em cache
// miss do ISR; em cache hit o HTML já vem pronto.
function PreviewSkeleton() {
  return (
    <>
      <div style={{ background: '#2a2e25', borderRadius: 8, padding: '24px 28px', marginBottom: 16, height: 124 }} />
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 32, marginBottom: 16, height: 220 }} />
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, height: 220 }} />
    </>
  )
}

async function TrilhaPreviewContent({ id }: { id: string }) {
  const sb = createAnonClient()
  const { data } = await sb
    .from('trilhas')
    .select('id, name, trail_type, regiao, bioma, lat, lon, desnivel_m, extensao_km, solo_type')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()

  const mapsUrl = `https://www.google.com/maps?q=${data.lat},${data.lon}`
  const isQuadrilatero = data.solo_type === 'ferro' || data.solo_type === 'misto_mg'

  return (
    <>
      {/* Header da trilha */}
      <div style={{ background: '#2a2e25', borderRadius: 8, padding: '24px 28px', marginBottom: 16 }}>
        <h1 className="font-wheat" style={{ color: '#fff', fontSize: 24, lineHeight: 1.2, marginBottom: 12 }}>
          {data.name}
        </h1>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.08)', border: '0.5px solid #333', borderRadius: 2, padding: '2px 6px' }}>
            {data.trail_type === 'bikepark' ? 'Bike Park' : 'Natural'}
          </span>
          <span style={{ fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.08)', border: '0.5px solid #333', borderRadius: 2, padding: '2px 6px' }}>
            {data.regiao}
          </span>
          {data.bioma && (
            <span style={{ fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.08)', border: '0.5px solid #333', borderRadius: 2, padding: '2px 6px' }}>
              {data.bioma}
            </span>
          )}
          {isQuadrilatero && (
            <span style={{ fontSize: 11, fontWeight: 500, color: '#6d745f', background: 'rgba(168,184,153,0.2)', border: '0.5px solid rgba(168,184,153,0.4)', borderRadius: 2, padding: '2px 6px' }}>
              ⛏ Quadrilátero Ferrífero
            </span>
          )}
        </div>

        {(data.desnivel_m != null || data.extensao_km != null) && (
          <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {data.desnivel_m != null && (
              <span>⛰ <b style={{ color: '#ccc' }}>{data.desnivel_m}m</b> desnível</span>
            )}
            {data.extensao_km != null && (
              <span>📏 <b style={{ color: '#ccc' }}>{data.extensao_km}km</b></span>
            )}
          </div>
        )}
      </div>

      {/* Seção bloqueada — acima do mapa para ser o elemento LCP */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 32, textAlign: 'center', marginBottom: 16 }}>
        <IconLock size={48} style={{ color: '#e5e5e5' }} />
        <h2 className="font-wheat" style={{ color: '#2a2e25', fontSize: 24, marginTop: 12, marginBottom: 8 }}>
          Veja as condições completas
        </h2>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, maxWidth: 400, margin: '0 auto 24px' }}>
          Solo, chuva, vento, veredicto e previsão dos próximos 3 dias — crie sua conta grátis para acessar.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Link
            href={`/cadastro?ref=whatsapp&trilha=${id}`}
            style={{
              background: '#6d745f', color: '#fff',
              border: 'none', borderRadius: 4,
              padding: '14px 32px', fontSize: 15, fontWeight: 500,
              display: 'inline-block', width: '100%', maxWidth: 320,
              textAlign: 'center', textDecoration: 'none',
            }}
          >
            Criar conta grátis
          </Link>
        </div>
        <div style={{ marginTop: 16 }}>
          <Link
            href={`/login?redirect=/trilhas/${id}`}
            style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}
          >
            Já tenho conta — Entrar
          </Link>
        </div>
      </div>

      {/* Mapa — abaixo da dobra, não afeta LCP */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginTop: 16 }}>
        <iframe
          src={`https://maps.google.com/maps?q=${data.lat},${data.lon}&z=15&output=embed&t=k`}
          width="100%"
          height="220"
          style={{ border: 'none', display: 'block' }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div style={{ padding: '8px 14px', borderTop: '0.5px solid #e5e5e5' }}>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#888' }}>
            Ver no mapa ↗
          </a>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: '#bbb', marginTop: 24 }}>
        MTB Forecaster · Condições de trilhas DH e Enduro em tempo real
      </p>
    </>
  )
}

export default async function TrilhaPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: paramId } = await params
  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* Navbar simplificada — sem dependência de dados, pinta no primeiro flush */}
      <nav style={{ background: '#2a2e25', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" className="font-wheat" style={{ color: '#fff', fontSize: 16, letterSpacing: '1.5px', textDecoration: 'none' }}>
          MTB FORECASTER
        </Link>
        <Link
          href={`/cadastro?ref=whatsapp&trilha=${paramId}`}
          style={{
            background: '#6d745f', color: '#fff',
            border: 'none', borderRadius: 4,
            padding: '7px 16px', fontSize: 13, fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Criar conta grátis
        </Link>
      </nav>
      <div style={{ background: '#a8b899', height: 3 }} />

      {/* Conteúdo — streamado separadamente da navbar */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 28px 48px' }}>
        <Suspense fallback={<PreviewSkeleton />}>
          <TrilhaPreviewContent id={paramId} />
        </Suspense>
      </div>
    </div>
  )
}
