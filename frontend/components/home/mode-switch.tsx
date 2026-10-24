'use client'

import { CarFront, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { errorMessage, userService } from '@/lib/services'
import type { User, UserMode } from '@/lib/types'
import { cn } from '@/lib/utils'

const OPTIONS: Array<{ value: UserMode; label: string; icon: typeof CarFront }> = [
  { value: 'pasajero', label: 'Pasajero', icon: UserRound },
  { value: 'conductor', label: 'Conductor', icon: CarFront },
]

export function ModeSwitch({ user }: { user: User }) {
  const { mutate } = useSWRConfig()

  async function change(mode: UserMode) {
    if (mode === user.activeMode) return
    // The session lives in SWR, so switch it right away and keep what the API saved.
    try {
      await mutate('session', userService.setMode(user, mode), {
        optimisticData: { ...user, activeMode: mode },
        rollbackOnError: true,
        revalidate: false,
      })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div role="radiogroup" aria-label="Modo de uso" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = user.activeMode === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => change(value)}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn('size-4', active && 'text-primary')} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
