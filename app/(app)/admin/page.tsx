'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, getClientUser } from '@/lib/supabase'
import AdminPanel, { TrilhaPendente } from '@/components/AdminPanel'
import { geocodeLatLon } from '@/lib/geocoding'

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendentes, setPendentes] = useState<TrilhaPendente[]>([])
  const [loading, setLoading] = useState(true)
  const [aprovacaoMsg, setAprovacaoMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) {
        router.replace('/dashboard')
        return
      }

      setIsAdmin(true)

      const { data: trilhasPendentes } = await supabase
        .from('trilhas_pendentes')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })

      setPendentes(trilhasPendentes || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function aprovar(p: TrilhaPendente) {
    let localidadeId: string | null = p.localidade_id ?? null

    if (!localidadeId) {
      const geo = await geocodeLatLon(p.lat, p.lon)
      if (geo) {
        let query = supabase.from('localidades').select('id')
          .eq('estado', geo.estado)
          .eq('cidade', geo.cidade)
        if (geo.localidade) {
          query = query.eq('localidade', geo.localidade)
        } else {
          query = query.is('localidade', null)
        }
        const { data: existing } = await query.maybeSingle()

        if (existing) {
          localidadeId = (existing as { id: string }).id
        } else {
          const { data: inserted } = await supabase
            .from('localidades')
            .insert({ pais: geo.pais, estado: geo.estado, cidade: geo.cidade, localidade: geo.localidade })
            .select('id')
            .single()
          localidadeId = inserted ? (inserted as { id: string }).id : null
        }
      }

      if (!localidadeId && p.regiao) {
        const { data: existing } = await supabase.from('localidades')
          .select('id')
          .eq('estado', p.regiao)
          .eq('cidade', '')
          .is('localidade', null)
          .maybeSingle()
        if (existing) {
          localidadeId = (existing as { id: string }).id
        } else {
          const { data: inserted } = await supabase
            .from('localidades')
            .insert({ pais: 'Brasil', estado: p.regiao, cidade: '' })
            .select('id')
            .single()
          localidadeId = inserted ? (inserted as { id: string }).id : null
        }
      }
    }

    const { error: insertError } = await supabase.from('trilhas').insert({
      name:          p.name,
      regiao:        p.regiao,
      lat:           p.lat,
      lon:           p.lon,
      altitude_m:    p.altitude_m,
      solo_type:     p.solo_type,
      exposicao:     p.exposicao,
      trail_type:    p.trail_type,
      bioma:         p.bioma ?? null,
      desnivel_m:    p.desnivel_m ?? null,
      extensao_km:   p.extensao_km ?? null,
      polyline:      p.polyline ?? null,
      aprovada:      true,
      localidade_id: localidadeId,
      created_by:    p.user_id ?? null,
    })

    if (insertError) {
      console.error('Erro ao inserir trilha aprovada:', insertError)
      throw new Error('Erro ao aprovar — verifique se todos os campos obrigatórios estão preenchidos.')
    }

    await supabase.from('trilhas_pendentes').update({ status: 'aprovada' }).eq('id', p.id)

    if (p.user_id) {
      fetch('/api/notificacoes/trilha-aprovada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: p.user_id, trail_name: p.name }),
      }).catch(() => {})
    }

    setPendentes(prev => prev.filter(t => t.id !== p.id))
    setAprovacaoMsg('Trilha aprovada com sucesso!')
    setTimeout(() => setAprovacaoMsg(null), 3000)
  }

  async function rejeitar(id: string, motivo: string) {
    await supabase.from('trilhas_pendentes').update({ status: 'rejeitada', motivo_rejeicao: motivo }).eq('id', id)
    setPendentes(prev => prev.filter(t => t.id !== id))
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#6d745f', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f0' }}>

      <div style={{ background: '#2a2e25', padding: '40px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Revisar Trilhas</h1>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '1px',
              background: '#6d745f', color: '#fff',
              borderRadius: 2, padding: '3px 8px',
            }}>
              ADMIN
            </span>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            {pendentes.length} trilha{pendentes.length !== 1 ? 's' : ''} pendente{pendentes.length !== 1 ? 's' : ''} de aprovação
          </p>
        </div>
      </div>
      <div style={{ background: '#a8b899', height: 3 }} />

      <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: '16px 24px', flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Trilhas pendentes</p>
            <p style={{ fontSize: 32, fontWeight: 700, color: '#2a2e25' }}>{pendentes.length}</p>
          </div>
          <Link
            href="/admin/importar-strava"
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
            }}
          >
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Importar Strava</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Segmentos favoritos → pendentes</p>
            <p style={{ fontSize: 12, color: '#FC4C02', fontWeight: 500, marginTop: 12 }}>Importar →</p>
          </Link>
        </div>

        {aprovacaoMsg && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            {aprovacaoMsg}
          </div>
        )}

        <AdminPanel trilhas={pendentes} onAprovar={aprovar} onRejeitar={rejeitar} />
      </div>
    </div>
  )
}
