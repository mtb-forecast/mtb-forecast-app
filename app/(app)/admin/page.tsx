'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AdminPanel, { TrilhaPendente } from '@/components/AdminPanel'
import { geocodeLatLon } from '@/lib/geocoding'

type Sugestao = {
  id: string
  strava_segment_id: number
  user_id: string
  solo_type: string
  exposicao: string
  trail_type: string
  bioma: string
  motivo: string
  status: string
  created_at: string
  segmento_nome?: string
  config_atual?: {
    solo_type: string
    exposicao: string
    trail_type: string
    bioma: string
  }
}

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendentes, setPendentes] = useState<TrilhaPendente[]>([])
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [loading, setLoading] = useState(true)
  const [sugestaoMsg, setSugestaoMsg] = useState<string | null>(null)
  const [aprovacaoMsg, setAprovacaoMsg] = useState<string | null>(null)
  const [pendingTabelasCount, setPendingTabelasCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

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

      const [{ data: trilhasPendentes }, { data: sugestoesPendentes }, { count: tabelasPendentes }] = await Promise.all([
        supabase.from('trilhas_pendentes').select('*').eq('status', 'pendente').order('created_at', { ascending: false }),
        supabase.from('strava_config_sugestoes').select('*').eq('status', 'pendente').order('created_at', { ascending: false }),
        supabase.from('admin_aprovacoes').select('id', { count: 'exact', head: true }).eq('aprovador_id', user.id).eq('status', 'pendente'),
      ])

      setPendingTabelasCount(tabelasPendentes ?? 0)

      setPendentes(trilhasPendentes || [])

      const enriched = await Promise.all(
        (sugestoesPendentes || []).map(async (s: Sugestao) => {
          const { data: config } = await supabase
            .from('strava_segmentos_config')
            .select('name, solo_type, exposicao, trail_type, bioma')
            .eq('strava_segment_id', s.strava_segment_id)
            .maybeSingle()
          return {
            ...s,
            segmento_nome: config?.name ?? `Segmento #${s.strava_segment_id}`,
            config_atual: config ? {
              solo_type: config.solo_type,
              exposicao: config.exposicao,
              trail_type: config.trail_type,
              bioma: config.bioma,
            } : undefined,
          }
        })
      )
      setSugestoes(enriched)
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

      // Fallback: geocoding falhou mas temos o estado via campo regiao
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
      name:         p.name,
      regiao:       p.regiao,
      lat:          p.lat,
      lon:          p.lon,
      altitude_m:   p.altitude_m,
      solo_type:    p.solo_type,
      exposicao:    p.exposicao,
      trail_type:   p.trail_type,
      bioma:        p.bioma ?? null,
      desnivel_m:   p.desnivel_m ?? null,
      extensao_km:  p.extensao_km ?? null,
      polyline:     p.polyline ?? null,
      aprovada:     true,
      localidade_id: localidadeId,
    })

    if (insertError) {
      console.error('Erro ao inserir trilha aprovada:', insertError)
      throw new Error('Erro ao aprovar — verifique se todos os campos obrigatórios estão preenchidos.')
    }

    await supabase.from('trilhas_pendentes').update({ status: 'aprovada' }).eq('id', p.id)
    setPendentes(prev => prev.filter(t => t.id !== p.id))
    setAprovacaoMsg('✓ Trilha aprovada com sucesso!')
    setTimeout(() => setAprovacaoMsg(null), 3000)
  }

  async function rejeitar(id: string, motivo: string) {
    await supabase.from('trilhas_pendentes').update({ status: 'rejeitada', motivo_rejeicao: motivo }).eq('id', id)
    setPendentes(prev => prev.filter(t => t.id !== id))
  }

  async function aprovarSugestao(s: Sugestao) {
    await Promise.all([
      supabase.from('strava_segmentos_config').update({
        solo_type: s.solo_type,
        exposicao: s.exposicao,
        trail_type: s.trail_type,
        bioma: s.bioma,
      }).eq('strava_segment_id', s.strava_segment_id),
      supabase.from('strava_config_sugestoes').update({ status: 'aprovada' }).eq('id', s.id),
    ])
    setSugestoes(prev => prev.filter(x => x.id !== s.id))
    setSugestaoMsg('Sugestão aprovada e configuração atualizada.')
    setTimeout(() => setSugestaoMsg(null), 3000)
  }

  async function rejeitarSugestao(id: string) {
    await supabase.from('strava_config_sugestoes').update({ status: 'rejeitada' }).eq('id', id)
    setSugestoes(prev => prev.filter(x => x.id !== id))
    setSugestaoMsg('Sugestão rejeitada.')
    setTimeout(() => setSugestaoMsg(null), 3000)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #e5e5e5', borderTopColor: '#111', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5' }}>

      {/* ── Page header preto ─────────────────────────────────────────── */}
      <div style={{ background: '#111', padding: '40px 32px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="font-wheat" style={{ color: '#fff', fontSize: 32 }}>Painel Admin</h1>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '1px',
              background: '#FFE000', color: '#111',
              borderRadius: 2, padding: '3px 8px',
            }}>
              ADMIN
            </span>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            {pendentes.length} trilha{pendentes.length !== 1 ? 's' : ''} pendente{pendentes.length !== 1 ? 's' : ''} · {sugestoes.length} sugestão{sugestoes.length !== 1 ? 'ões' : ''} pendente{sugestoes.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <div style={{ background: '#FFE000', height: 3 }} />

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: '16px 24px', flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Trilhas pendentes</p>
            <p style={{ fontSize: 32, fontWeight: 700, color: '#111' }}>{pendentes.length}</p>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: '16px 24px', flex: 1, minWidth: 140 }}>
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Sugestões Strava</p>
            <p style={{ fontSize: 32, fontWeight: 700, color: '#111' }}>{sugestoes.length}</p>
          </div>
          <Link
            href="/admin/tabelas"
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
              position: 'relative',
            }}
          >
            {pendingTabelasCount > 0 && (
              <span style={{
                position: 'absolute', top: 12, right: 12,
                background: '#ef4444', color: '#fff',
                borderRadius: 10, fontSize: 10, fontWeight: 700,
                padding: '2px 7px', lineHeight: 1.4,
              }}>
                {pendingTabelasCount}
              </span>
            )}
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Tabelas Mestras</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Solo · Thresholds · Meia-vida</p>
            <p style={{ fontSize: 12, color: '#111', fontWeight: 500, marginTop: 12 }}>Gerenciar →</p>
          </Link>
          <Link
            href="/admin/importar-strava"
            style={{
              background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8,
              padding: '16px 24px', flex: 1, minWidth: 140,
              textDecoration: 'none', display: 'flex', flexDirection: 'column',
            }}
          >
            <p style={{ fontSize: 11, color: '#888', fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6 }}>Importar Strava</p>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 'auto' }}>Rotas → trilhas pendentes</p>
            <p style={{ fontSize: 12, color: '#FC4C02', fontWeight: 500, marginTop: 12 }}>Importar →</p>
          </Link>
        </div>

        {/* Trilhas pendentes */}
        <div style={{ marginBottom: 24 }}>
          {aprovacaoMsg && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              {aprovacaoMsg}
            </div>
          )}
          <AdminPanel trilhas={pendentes} onAprovar={aprovar} onRejeitar={rejeitar} />
        </div>

        {/* Sugestões Strava */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: '#111' }}>Sugestões de configuração Strava</h2>
            {sugestoes.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e', borderRadius: 2, padding: '2px 8px' }}>
                {sugestoes.length} pendente{sugestoes.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {sugestaoMsg && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              {sugestaoMsg}
            </div>
          )}

          {sugestoes.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 40, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#888' }}>Nenhuma sugestão pendente.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sugestoes.map(s => (
                <div key={s.id} style={{ background: '#fff', border: '0.5px solid #e5e5e5', borderRadius: 8, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>{s.segmento_nome}</p>
                      <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        Segmento #{s.strava_segment_id} · {new Date(s.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, background: '#fef9c3', color: '#854d0e', borderRadius: 2, padding: '2px 8px', flexShrink: 0 }}>
                      pendente
                    </span>
                  </div>

                  {s.config_atual && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <div style={{ background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: 12 }}>
                        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', color: '#888', textTransform: 'uppercase', marginBottom: 8 }}>Config atual</p>
                        <p style={{ fontSize: 12, color: '#888' }}>Solo: <b style={{ color: '#111' }}>{s.config_atual.solo_type}</b></p>
                        <p style={{ fontSize: 12, color: '#888' }}>Exposição: <b style={{ color: '#111' }}>{s.config_atual.exposicao}</b></p>
                        <p style={{ fontSize: 12, color: '#888' }}>Tipo: <b style={{ color: '#111' }}>{s.config_atual.trail_type}</b></p>
                        <p style={{ fontSize: 12, color: '#888' }}>Bioma: <b style={{ color: '#111' }}>{s.config_atual.bioma}</b></p>
                      </div>
                      <div style={{ background: '#fef9c3', border: '0.5px solid #fde047', borderRadius: 4, padding: 12 }}>
                        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', color: '#854d0e', textTransform: 'uppercase', marginBottom: 8 }}>Sugestão</p>
                        <p style={{ fontSize: 12, color: '#888' }}>Solo: <b style={{ color: '#111' }}>{s.solo_type}</b></p>
                        <p style={{ fontSize: 12, color: '#888' }}>Exposição: <b style={{ color: '#111' }}>{s.exposicao}</b></p>
                        <p style={{ fontSize: 12, color: '#888' }}>Tipo: <b style={{ color: '#111' }}>{s.trail_type}</b></p>
                        <p style={{ fontSize: 12, color: '#888' }}>Bioma: <b style={{ color: '#111' }}>{s.bioma}</b></p>
                      </div>
                    </div>
                  )}

                  <div style={{ background: '#f7f7f5', border: '0.5px solid #e5e5e5', borderRadius: 4, padding: '10px 14px', marginBottom: 14 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>Motivo</p>
                    <p style={{ fontSize: 13, color: '#111' }}>{s.motivo}</p>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => aprovarSugestao(s)}
                      style={{
                        flex: 1, background: '#FFE000', color: '#111',
                        border: '1.5px solid #111', borderRadius: 4,
                        padding: '9px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => rejeitarSugestao(s.id)}
                      style={{
                        flex: 1, background: '#fff', color: '#888',
                        border: '0.5px solid #e5e5e5', borderRadius: 4,
                        padding: '9px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
