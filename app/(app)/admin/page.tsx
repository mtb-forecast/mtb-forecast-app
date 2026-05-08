'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Trilha } from '@/lib/types'
import AdminPanel from '@/components/AdminPanel'

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendentes, setPendentes] = useState<Trilha[]>([])
  const [loading, setLoading] = useState(true)

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

      const { data: trilhasPendentes } = await supabase
        .from('trilhas')
        .select('*')
        .eq('aprovada', false)
        .order('created_at', { ascending: false })

      setPendentes(trilhasPendentes || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function aprovar(id: string) {
    await supabase.from('trilhas').update({ aprovada: true }).eq('id', id)
    setPendentes((prev) => prev.filter((t) => t.id !== id))
  }

  async function rejeitar(id: string) {
    await supabase.from('trilhas').delete().eq('id', id)
    setPendentes((prev) => prev.filter((t) => t.id !== id))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-slate-900 px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-white">Painel Admin</h1>
        <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30">
          Admin
        </span>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-500/20 rounded-lg p-3">
            <span className="text-2xl">⏳</span>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Trilhas pendentes</p>
            <p className="text-3xl font-bold text-white">{pendentes.length}</p>
          </div>
        </div>
      </div>

      <AdminPanel trilhas={pendentes} onAprovar={aprovar} onRejeitar={rejeitar} />
    </div>
  )
}
