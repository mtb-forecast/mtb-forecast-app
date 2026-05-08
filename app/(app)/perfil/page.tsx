'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Profile, Trilha, REGIOES } from '@/lib/types'

export default function PerfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [trilhasUsuario, setTrilhasUsuario] = useState<Trilha[]>([])
  const [trilhasFavoritas, setTrilhasFavoritas] = useState<Trilha[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [nome, setNome] = useState('')
  const [regiao, setRegiao] = useState('')
  const [telegram, setTelegram] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
        setNome(profileData.nome || '')
        setRegiao(profileData.regiao || '')
        setTelegram(profileData.telegram_username || '')
      }

      const [{ data: minhas }, { data: favIds }] = await Promise.all([
        supabase.from('trilhas').select('*').eq('criada_por', user.id).order('name'),
        supabase.from('favoritos').select('trilha_id').eq('user_id', user.id),
      ])

      if (minhas) setTrilhasUsuario(minhas)

      if (favIds && favIds.length > 0) {
        const ids = favIds.map((f: { trilha_id: string }) => f.trilha_id)
        const { data: favTrilhas } = await supabase
          .from('trilhas')
          .select('*')
          .in('id', ids)
          .eq('aprovada', true)
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

    await supabase
      .from('profiles')
      .update({ nome, regiao, telegram_username: telegram || null })
      .eq('id', profile.id)

    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-8">Meu Perfil</h1>

      {/* Editar perfil */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-5">Dados pessoais</h2>

        {saved && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 mb-5 text-sm">
            Perfil atualizado com sucesso!
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">E-mail</label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="input-field opacity-50 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Região</label>
            <select
              value={regiao}
              onChange={(e) => setRegiao(e.target.value)}
              className="input-field"
            >
              <option value="">Selecione</option>
              {REGIOES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Username Telegram <span className="text-slate-500 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
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

      {/* Trilhas favoritas */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Trilhas favoritas</h2>
          <span className="badge bg-slate-700 text-slate-300">{trilhasFavoritas.length}</span>
        </div>
        {trilhasFavoritas.length === 0 ? (
          <p className="text-slate-400 text-sm">Nenhuma trilha favoritada ainda.</p>
        ) : (
          <ul className="space-y-2">
            {trilhasFavoritas.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/trilhas/${t.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <span className="text-slate-200 font-medium">{t.name}</span>
                  <span className="text-slate-500 text-sm">{t.regiao}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Trilhas cadastradas */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Trilhas que cadastrei</h2>
        {trilhasUsuario.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-slate-400 text-sm mb-3">Você ainda não cadastrou trilhas.</p>
            <Link
              href="/trilhas"
              className="text-green-400 hover:text-green-300 text-sm font-medium"
            >
              Cadastrar trilha →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {trilhasUsuario.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/trilhas/${t.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <span className="text-slate-200 font-medium">{t.name}</span>
                  <span className={`badge ${t.aprovada ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
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
          className="text-red-400 hover:text-red-300 font-medium text-sm transition-colors"
        >
          Sair da conta
        </button>
      </div>
    </div>
  )
}
