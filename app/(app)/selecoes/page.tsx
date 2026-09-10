'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IconCalendarEvent, IconPlus, IconMapPin, IconUsers } from '@tabler/icons-react'
import { getClientUser } from '@/lib/supabase'

const T = {
  bg: '#F5F6F2', card: '#FFFFFF', card2: '#F8F9F5',
  border: 'rgba(0,0,0,.08)', primary: '#6d745f', text: '#1A1D18', muted: '#6d745f',
}

type SelecaoResumo = {
  id: string
  nome: string
  data: string
  is_owner: boolean
  total_trilhas: number
  total_membros: number
}

function isAtiva(data: string): boolean {
  const hoje = new Date().toISOString().slice(0, 10)
  return data >= hoje
}

export default function SelecoesPage() {
  const [selecoes, setSelecoes] = useState<SelecaoResumo[] | null>(null)

  useEffect(() => {
    async function load() {
      const user = await getClientUser()
      if (!user) { window.location.href = '/login'; return }
      const res = await fetch('/api/selecoes')
      const json = await res.json()
      setSelecoes(json.selecoes ?? [])
    }
    load()
  }, [])

  const ativas = (selecoes ?? []).filter((s) => isAtiva(s.data))
  const historico = (selecoes ?? []).filter((s) => !isAtiva(s.data))

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      <div style={{ background: '#141612', borderBottom: '1px solid rgba(109,116,95,.25)', padding: '24px 16px 20px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Link href="/perfil" style={{
            fontFamily: 'var(--font-dm-mono)', fontSize: 11, letterSpacing: '1px',
            color: 'rgba(154,160,147,.7)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
          }}>
            ← Perfil
          </Link>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-barlow-condensed)', fontWeight: 800,
                fontSize: 'clamp(28px, 5vw, 38px)', textTransform: 'uppercase',
                color: '#F4F3EF', lineHeight: 0.95, margin: '0 0 6px',
              }}>
                Minhas seleções
              </h1>
              <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 12, color: 'rgba(154,160,147,.7)', margin: 0 }}>
                Rolês nomeados de trilhas, por data, com quem você chamar
              </p>
            </div>
            <Link href="/selecoes/nova" style={{
              background: '#F4F3EF', color: '#0E0F0D', borderRadius: 999,
              padding: '8px 16px', fontFamily: 'var(--font-barlow-condensed)', fontWeight: 700,
              fontSize: 14, textTransform: 'uppercase', letterSpacing: '.5px',
              textDecoration: 'none', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <IconPlus size={16} /> Nova
            </Link>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px 100px', maxWidth: 640, margin: '0 auto' }}>
        {selecoes === null ? (
          <div style={{ textAlign: 'center', padding: 40, color: T.muted, fontSize: 13 }}>Carregando…</div>
        ) : selecoes.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center' }}>
            <IconCalendarEvent size={28} style={{ color: T.muted }} />
            <p style={{ fontSize: 14, color: T.text, fontWeight: 600, margin: '12px 0 6px' }}>Nenhuma seleção ainda</p>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 20px' }}>Monte um rolê nomeado pra um dia específico e chame a galera.</p>
            <Link href="/selecoes/nova" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: T.primary, color: '#fff', borderRadius: 12,
              padding: '12px 24px', fontSize: 14, fontWeight: 800, textDecoration: 'none',
            }}>
              <IconPlus size={16} /> Criar seleção
            </Link>
          </div>
        ) : (
          <>
            {ativas.length > 0 && (
              <>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 10px' }}>Ativas</h2>
                <SelecaoLista items={ativas} ativa />
              </>
            )}
            {historico.length > 0 && (
              <>
                <h2 style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.5px', margin: '24px 0 10px' }}>Histórico</h2>
                <SelecaoLista items={historico} ativa={false} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SelecaoLista({ items, ativa }: { items: SelecaoResumo[]; ativa: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((s) => (
        <Link key={s.id} href={`/selecoes/${s.id}`} style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
          padding: '16px 20px', textDecoration: 'none', display: 'block',
          opacity: ativa ? 1 : 0.7,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{s.nome}</span>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                {new Date(s.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                {!s.is_owner && ' · convidado'}
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase',
              padding: '4px 10px', borderRadius: 20,
              background: ativa ? 'rgba(74,222,128,0.12)' : 'rgba(156,163,175,0.15)',
              color: ativa ? '#4ade80' : '#9ca3af',
            }}>
              {ativa ? 'Ativa' : 'Encerrada'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconMapPin size={12} /> {s.total_trilhas} trilha{s.total_trilhas !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconUsers size={12} /> {s.total_membros + 1} pessoa{s.total_membros !== 0 ? 's' : ''}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
