'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSession } from '@/hooks/use-data'

export default function RootRedirect() {
  const { user, isLoading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) router.replace(user ? '/inicio' : '/ingresar')
  }, [isLoading, user, router])

  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
