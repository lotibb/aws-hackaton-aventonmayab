'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSession } from '@/hooks/use-data'
import { BottomNav } from './bottom-nav'

// Amplify keeps Cognito tokens in the browser, so the guard runs client-side via getUserId().
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) router.replace('/ingresar')
  }, [isLoading, user, router])

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Cargando…</span>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background">
      <main className="flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</main>
      <BottomNav />
    </div>
  )
}
