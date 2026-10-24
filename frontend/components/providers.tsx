'use client'

import { ThemeProvider } from 'next-themes'
import { useEffect } from 'react'
import { SWRConfig, useSWRConfig } from 'swr'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { refreshNow } from '@/hooks/use-data'
import { subscribeToChanges } from '@/lib/services'

/**
 * Bridges backend change notifications to SWR so every screen re-renders in real time.
 * Today the mock DB emits them; later an AWS IoT Core / WebSocket subscription will.
 */
function RealtimeBridge() {
  const { mutate } = useSWRConfig()
  useEffect(
    () =>
      subscribeToChanges(() => {
        refreshNow()
        mutate(() => true)
      }),
    [mutate],
  )
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 0, shouldRetryOnError: false }}>
        <TooltipProvider>
          <RealtimeBridge />
          {children}
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </SWRConfig>
    </ThemeProvider>
  )
}
