'use client'

import { CarFront, House, ParkingSquare, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/inicio', label: 'Inicio', icon: House },
  { href: '/viajes', label: 'Viajes', icon: CarFront },
  { href: '/estacionamiento', label: 'Estacionamiento', icon: ParkingSquare },
  { href: '/perfil', label: 'Perfil', icon: UserRound },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors outline-none focus-visible:bg-muted',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-primary/12')}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="truncate">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
