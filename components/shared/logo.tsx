import { CarFront } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <CarFront className="size-5" aria-hidden="true" />
      </span>
      {showText && (
        <span className="text-lg font-semibold tracking-tight">
          Aventón <span className="text-primary">Mayab</span>
        </span>
      )}
    </span>
  )
}
