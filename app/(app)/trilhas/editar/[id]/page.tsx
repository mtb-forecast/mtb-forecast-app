'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function EditarTrilhaRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/trilhas/editar-aprovada/${id}`)
  }, [id, router])

  return null
}
