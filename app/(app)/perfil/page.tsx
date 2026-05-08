'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Profile, Trilha, REGIOES } from '@/lib/types'

type TrilhaPessoal = {
  id: string
  name: string
  regiao: string
  strava_url: string
  strava_segment_id: number
}

function StravaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  )
}

const cardStyle = {
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(4px)',
  border: '1px solid rgba(0,0,0,0.08)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
}

export default function PerfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [trilhasUsuario, setTrilhasUsuario] = useState<Trilha[]>([])
  const [trilhasFavoritas, setTrilhasFavoritas] = useState<Trilha[]>([])
  const [trilhasPessoais, setTrilhasPessoais] = useState<TrilhaPessoal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [nome, setNome] = useState('')
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()

      if (profileData) {
        setProfile(profileData)
        setNome(profileData.nome || '')
        setRegiao(profileData.regiao || '')
        setTelegram(profileData.telegram_username || '')
      }

      const [{ data: minhas }, { data: favIds }, { data: pessoais }] = await Promise.all([
        supabase.from('trilhas').select('*').eq('criada_por', user.id).order('name'),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
        supabase.from('trilhas_pessoais')
          .select('id, name, regiao, strava_url, strava_segment_id')
          .eq('user_id', user.id)
          .order('name'),
      ])

      if (minhas) setTrilhasUsuario(minhas)
      if (pessoais) setTrilhasPessoais(pessoais)

      if (favIds && favIds.length > 0) {
        const ids = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const { data: favTrilhas } = await supabase
          .from('trilhas').select('*').in('id', ids).eq('aprovada', true)
        if (favTrilhas) setTrilhasFavoritas(favTrilhas)
      }

      setLoading(false)
    }
    load()
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    await supabase.from('profiles')
      .update({ nome, regiao, telegram_username: telegram || null })
      .eq('id', profile.id)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleDeletePessoal(id: string) {
    setDeletingId(id)
    await supabase.from('trilhas_pessoais').delete().eq('id', id)
    setTrilhasPessoais(prev => prev.filter(t => t.id !== id))
    setDeletingId(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const slotsUsados = trilhasPessoais.length
  const slotsLimite = 3
  const stravaLleno = slotsUsados >= slotsLimite

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <h1 className="font-wheat text-3xl text-[#1e293b] mb-8">Meu Perfil</h1>

      {/* Dados pessoais */}
      <div className="rounded-xl p-6 mb-6" style={cardStyle}>
        <h2 className="text-lg font-semibold text-[#1e293b] mb-5">Dados pessoais</h2>

        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 mb-5 text-sm">
            Perfil atualizado com sucesso!
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#64748b] mb-2">E-mail</label>
            <input type="email" value={profile?.email || ''} disabled className="input-field opacity-60 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#64748b] mb-2">Nome</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#64748b] mb-2">Região</label>
            <select value={regiao} onChange={e => setRegiao(e.target.value)} className="input-field">
              <option value="">Selecione</option>
              {REGIOES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#64748b] mb-2">
              Username Telegram <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]">@</span>
              <input
                type="text"
                value={telegram}
                onChange={e => setTelegram(e.target.value)}
                placeholder="seu_username"
                className="input-field pl-8"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>

      {/* Trilhas do Strava */}
      <div className="rounded-xl p-6 mb-6" style={cardStyle}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-[#1e293b]">Minhas trilhas do Strava</h2>
          <span className="text-xs text-[#64748b] font-medium">{slotsUsados} de {slotsLimite} utilizadas</span>
        </div>
        <p className="text-xs text-[#64748b] mb-5">
          Importe segmentos favoritos do Strava para receber previsões de condições personalizadas.
        </p>

        {/* Botão conectar */}
        <div className="mb-4">
          {stravaLleno ? (
            <button
              disabled
              title="Limite de 3 trilhas atingido"
              className="inline-flex items-center gap-2 font-semibold text-white px-4 py-2.5 rounded-lg opacity-50 cursor-not-allowed text-sm"
              style={{ background: '#FC4C02' }}
            >
              <StravaIcon />
              Conectar com Strava
              <span className="text-xs font-normal">(limite atingido)</span>
            </button>
          ) : (
            <a
              href="/api/strava/auth"
              className="inline-flex items-center gap-2 font-semibold text-white px-4 py-2.5 rounded-lg transition-opacity hover:opacity-90 text-sm"
              style={{ background: '#FC4C02' }}
            >
              <StravaIcon />
              Conectar com Strava
            </a>
          )}
        </div>

        {/* Lista de trilhas pessoais */}
        {trilhasPessoais.length === 0 ? (
          <p className="text-[#64748b] text-sm">Nenhuma trilha do Strava conectada ainda.</p>
        ) : (
          <ul className="space-y-2">
            {trilhasPessoais.map(t => (
              <li
                key={t.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'rgba(252,76,2,0.06)', border: '1px solid rgba(252,76,2,0.15)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ color: '#FC4C02' }} className="text-sm">🟠</span>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1e293b] text-sm truncate">{t.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-[#64748b]">{t.regiao}</span>
                      <a
                        href={t.strava_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs hover:underline"
                        style={{ color: '#FC4C02' }}
                      >
                        Ver no Strava ↗
                      </a>
                      <Link
                        href={`/perfil/strava/sugestao/${t.strava_segment_id}`}
                        className="text-xs text-[#64748b] hover:text-[#1e293b] transition-colors underline underline-offset-2"
                      >
                        Sugerir alteração
                      </Link>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePessoal(t.id)}
                  disabled={deletingId === t.id}
                  className="text-slate-400 hover:text-red-500 transition-colors text-xs font-medium ml-3 flex-shrink-0"
                >
                  {deletingId === t.id ? '...' : 'Excluir'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Trilhas favoritas */}
      <div className="rounded-xl p-6 mb-6" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#1e293b]">Trilhas favoritas</h2>
          <span className="text-xs bg-slate-100 text-[#64748b] px-2.5 py-0.5 rounded-full font-medium">
            {trilhasFavoritas.length}
          </span>
        </div>
        {trilhasFavoritas.length === 0 ? (
          <p className="text-[#64748b] text-sm">Nenhuma trilha favoritada ainda.</p>
        ) : (
          <ul className="space-y-1">
            {trilhasFavoritas.map(t => (
              <li key={t.id}>
                <Link
                  href={`/trilhas/${t.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <span className="text-[#1e293b] font-medium text-sm">{t.name}</span>
                  <span className="text-[#64748b] text-xs">{t.regiao}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Trilhas cadastradas */}
      <div className="rounded-xl p-6 mb-8" style={cardStyle}>
        <h2 className="text-lg font-semibold text-[#1e293b] mb-4">Trilhas que cadastrei</h2>
        {trilhasUsuario.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-[#64748b] text-sm mb-3">Você ainda não cadastrou trilhas.</p>
            <Link href="/trilhas" className="text-green-600 hover:text-green-500 text-sm font-medium">
              Cadastrar trilha →
            </Link>
          </div>
        ) : (
          <ul className="space-y-1">
            {trilhasUsuario.map(t => (
              <li key={t.id}>
                <Link
                  href={`/trilhas/${t.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <span className="text-[#1e293b] font-medium text-sm">{t.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.aprovada ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                    {t.aprovada ? 'Aprovada' : 'Pendente'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Logout */}
      <div className="text-center">
        <button
          onClick={handleLogout}
          className="text-red-500 hover:text-red-600 font-medium text-sm transition-colors"
        >
          Sair da conta
        </button>
      </div>
    </div>
  )
}
