import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ComingSoonBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground', className)}>
      Próximamente
    </span>
  )
}

export function ComingSoonRow({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div aria-disabled="true" className="flex min-h-12 items-center gap-3 px-4 py-3 text-muted-foreground">
      <Icon className="size-5" aria-hidden="true" />
      <span className="flex-1 text-sm">{label}</span>
      <ComingSoonBadge />
    </div>
  )
}
