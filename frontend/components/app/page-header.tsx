import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  backHref,
  action,
  className,
}: {
  title: string
  description?: string
  backHref?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-5 flex items-start gap-2', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
          <span className="sr-only">Regresar</span>
        </Link>
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  )
}
