'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Trilha } from '@/lib/types'

export default function TrilhaPreviewPage() {
  const params = useParams()
  const id = params.id as string

  const [trilha, setTrilha] = useState<Trilha | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('trilhas')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (!data) { setNotFound(true); setLoading(false); return }
      setTrilha(data as Trilha)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (notFound || !trilha) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: '#888', fontSize: 14 }}>Trilha não encontrada</p>
        <Link href="/trilhas" style={{ color: '#6d745f', fontSize: 13 }}>Ver todas as trilhas</Link>
      </div>
    )
  }

  const mapsUrl = `https://www.google.com/maps?q=${trilha.lat},${trilha.lon}`
  const isQuadrilatero = trilha.solo_type === 'ferro' || trilha.solo_type === 'misto_mg'

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      {/* Navbar simplificada */}
      <nav style={{ background: '#2a2e25', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" className="font-wheat" style={{ color: '#fff', fontSize: 16, letterSpacing: '1.5px', textDecoration: 'none' }}>
          MTB FORECASTER
        </Link>
        <Link
          href={`/cadastro?ref=whatsapp&trilha=${id}`}
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

      {/* Conteúdo */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 32px 48px' }}>

        {/* Header da trilha */}
        <div style={{ background: '#2a2e25', borderRadius: 8, padding: '24px 28px', marginBottom: 16 }}>
          <h1 className="font-wheat" style={{ color: '#fff', fontSize: 24, lineHeight: 1.2, marginBottom: 12 }}>
            {trilha.name}
          </h1>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.08)', border: '0.5px solid #333', borderRadius: 2, padding: '2px 6px' }}>
              {trilha.trail_type === 'bikepark' ? 'Bike Park' : 'Natural'}
            </span>
            <span style={{ fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.08)', border: '0.5px solid #333', borderRadius: 2, padding: '2px 6px' }}>
              {trilha.regiao}
            </span>
            {trilha.bioma && (
              <span style={{ fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.08)', border: '0.5px solid #333', borderRadius: 2, padding: '2px 6px' }}>
                {trilha.bioma}
              </span>
            )}
            {isQuadrilatero && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#6d745f', background: 'rgba(168,184,153,0.2)', border: '0.5px solid rgba(168,184,153,0.4)', borderRadius: 2, padding: '2px 6px' }}>
                ⛏ Quadrilátero Ferrífero
              </span>
            )}
          </div>

          {(trilha.desnivel_m != null || trilha.extensao_km != null) && (
            <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {trilha.desnivel_m != null && (
                <span>⛰ <b style={{ color: '#ccc' }}>{trilha.desnivel_m}m</b> desnível</span>
              )}
              {trilha.extensao_km != null && (
                <span>📏 <b style={{ color: '#ccc' }}>{trilha.extensao_km}km</b></span>
              )}
            </div>
          )}
        </div>

        {/* Mapa */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <iframe
            src={`https://maps.google.com/maps?q=${trilha.lat},${trilha.lon}&z=15&output=embed&t=k`}
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

        {/* Seção bloqueada */}
        <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 32, textAlign: 'center' }}>
          <i className="ti ti-lock" style={{ fontSize: 48, color: '#e5e5e5' }} />
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

        <p style={{ textAlign: 'center', fontSize: 12, color: '#bbb', marginTop: 24 }}>
          MTB Forecaster · Condições de trilhas DH e Enduro em tempo real
        </p>
      </div>
    </div>
  )
}
