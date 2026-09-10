'use client'

import { useEffect, useState, use as usePromise } from 'react'
import Link from 'next/link'
import {
  IconMapPin, IconUsers, IconUserPlus, IconTrash, IconLink,
  IconBrandWhatsapp, IconX, IconSearch, IconLogout,
} from '@tabler/icons-react'
import { getClientUser } from '@/lib/supabase'
import type { SelecaoTrilhas, SelecaoMembro } from '@/lib/types'
import type { Trilha } from '@/lib/types'

const T = {
  bg: '#F5F6F2', card: '#FFFFFF', border: 'rgba(0,0,0,.08)',
  primary: '#6d745f', text: '#1A1D18', muted: '#6d745f',
}

type Detalhe = SelecaoTrilhas & { trilhas: Trilha[]; membros: SelecaoMembro[] }

export default function SelecaoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params)
  const [userId, setUserId] = useState<string | null>(null)
  const [selecao, setSelecao] = useState<Detalhe | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [buscaMembro, setBuscaMembro] = useState('')
  const [resultadosMembro, setResultadosMembro] = useState<any[]>([])
  const [buscandoMembro, setBuscandoMembro] = useState(false)
  const [linkConvite, setLinkConvite] = useState<string | null>(null)
  const [gerandoConvite, setGerandoConvite] = useState(false)

  async function carregar() {
    const res = await fetch(`/api/selecoes/${id}`)
    const json = await res.json()
    if (!res.ok) { setErro(json.error || 'Erro ao carregar seleção'); return }
    setSelecao(json.selecao)
  }

  useEffect(() => {
    async function init() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      setUserId(user.id)
      await carregar()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function buscarMembro(q: string) {
    setBuscaMembro(q)
    if (q.trim().length < 2) { setResultadosMembro([]); return }
    setBuscandoMembro(true)
    const res = await fetch(`/api/selecoes/${id}/membros?q=${encodeURIComponent(q.trim())}`)
    const json = await res.json()
    setResultadosMembro(json.perfis ?? [])
    setBuscandoMembro(false)
  }

  async function adicionarMembro(profileId: string) {
    const res = await fetch(`/api/selecoes/${id}/membros`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId }),
    })
    if (res.ok) {
      setBuscaMembro('')
      setResultadosMembro([])
      await carregar()
    }
  }

  async function removerMembro(profileId: string) {
    const res = await fetch(`/api/selecoes/${id}/membros/${profileId}`, { method: 'DELETE' })
    if (res.ok) await carregar()
  }

  async function removerTrilha(trilhaId: string) {
    const res = await fetch(`/api/selecoes/${id}/trilhas?trilha_id=${trilhaId}`, { method: 'DELETE' })
    if (res.ok) await carregar()
  }

  async function gerarConvite() {
    setGerandoConvite(true)
    const res = await fetch(`/api/selecoes/${id}/convite`, { method: 'POST' })
    const json = await res.json()
    setGerandoConvite(false)
    if (res.ok) setLinkConvite(json.link)
  }

  async function excluirSelecao() {
    if (!confirm('Excluir esta seleção? Essa ação não pode ser desfeita.')) return
    const res = await fetch(`/api/selecoes/${id}`, { method: 'DELETE' })
    if (res.ok) window.location.href = '/selecoes'
  }

  if (erro) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ color: T.muted, fontSize: 14 }}>{erro}</p>
      </div>
    )
  }

  if (!selecao || !userId) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: T.muted, fontSize: 13 }}>Carregando…</p>
      </div>
    )
  }

  const ativa = selecao.data >= new Date().toISOString().slice(0, 10)
  const waTexto = encodeURIComponent(
    `Bora pedalar? Entra na seleção "${selecao.nome}" no MTB Forecaster: ${linkConvite ?? ''}`
  )

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '24px 16px 20px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link href="/selecoes" style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1px',
            color: 'rgba(154,160,147,.7)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
          }}>
            ← Seleções
          </Link>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                fontSize: 'clamp(26px, 5vw, 34px)', textTransform: 'uppercase',
                color: '#F4F3EF', lineHeight: 0.95, margin: '0 0 6px',
              }}>
                {selecao.nome}
              </h1>
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', margin: 0 }}>
                {new Date(selecao.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: 20, flexShrink: 0,
              background: ativa ? 'rgba(74,222,128,0.15)' : 'rgba(156,163,175,0.2)',
              color: ativa ? '#4ade80' : '#9ca3af',
            }}>
              {ativa ? 'Ativa' : 'Encerrada'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px 100px', maxWidth: 640, margin: '0 auto' }}>
        {/* Trilhas */}
        <SectionTitle icon={<IconMapPin size={14} />}>Trilhas ({selecao.trilhas.length})</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {selecao.trilhas.length === 0 && (
            <p style={{ fontSize: 13, color: T.muted }}>Nenhuma trilha adicionada ainda.</p>
          )}
          {selecao.trilhas.map((t) => (
            <div key={t.id} style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Link href={`/trilhas/${t.id}`} style={{ fontSize: 14, fontWeight: 600, color: T.text, textDecoration: 'none' }}>
                {t.name}
              </Link>
              <button onClick={() => removerTrilha(t.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', display: 'flex' }}>
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* Membros */}
        <SectionTitle icon={<IconUsers size={14} />}>Quem vai ({selecao.membros.length + 1})</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
            padding: '10px 16px', fontSize: 13, color: T.text, fontWeight: 600,
          }}>
            {selecao.owner_id === userId ? 'Você' : 'Dono da seleção'} · organizador(a)
          </div>
          {selecao.membros.map((m) => (
            <div key={m.id} style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
              padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 13, color: T.text }}>
                {m.profile?.apelido || m.profile?.nome || m.profile?.email || 'Colaborador(a)'}
              </span>
              {(selecao.owner_id === userId || m.profile_id === userId) && (
                <button onClick={() => removerMembro(m.profile_id)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', display: 'flex' }}>
                  {m.profile_id === userId ? <IconLogout size={15} /> : <IconTrash size={15} />}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Adicionar membro por busca */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted }} />
          <input
            type="text"
            placeholder="Buscar pessoa cadastrada…"
            value={buscaMembro}
            onChange={(e) => buscarMembro(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#FFFFFF', border: `1px solid ${T.border}`, borderRadius: 10,
              padding: '9px 12px 9px 36px', fontSize: 13, color: T.text, outline: 'none',
            }}
          />
        </div>
        {buscandoMembro && <p style={{ fontSize: 12, color: T.muted }}>Buscando…</p>}
        {resultadosMembro.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {resultadosMembro.map((p) => (
              <button key={p.id} onClick={() => adicionarMembro(p.id)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#F8F9F5', border: `1px solid ${T.border}`, borderRadius: 10,
                padding: '9px 12px', fontSize: 13, color: T.text, cursor: 'pointer', textAlign: 'left',
              }}>
                {p.apelido || p.nome || p.email}
                <IconUserPlus size={14} style={{ color: T.primary }} />
              </button>
            ))}
          </div>
        )}

        {/* Convite por link (WhatsApp) */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: T.muted, margin: '0 0 12px' }}>Pessoa não tem conta? Gere um link de convite.</p>
          {!linkConvite ? (
            <button onClick={gerarConvite} disabled={gerandoConvite} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: T.primary, color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: gerandoConvite ? 'not-allowed' : 'pointer',
            }}>
              <IconLink size={15} /> {gerandoConvite ? 'Gerando…' : 'Gerar link de convite'}
            </button>
          ) : (
            <a href={`https://wa.me/?text=${waTexto}`} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#25D366', color: '#fff', borderRadius: 10,
              padding: '10px 16px', fontSize: 13, fontWeight: 700, textDecoration: 'none',
            }}>
              <IconBrandWhatsapp size={16} /> Compartilhar no WhatsApp
            </a>
          )}
        </div>

        {selecao.owner_id === userId && (
          <button onClick={excluirSelecao} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'transparent', color: '#EF4444', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <IconX size={14} /> Excluir seleção
          </button>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.5px',
      margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon} {children}
    </h2>
  )
}
