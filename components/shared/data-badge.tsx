'use client'

import { BadgeCheck, FlaskConical, Info, TrendingUp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DataSource } from '@/lib/types'
import { cn } from '@/lib/utils'

const META: Record<DataSource, { label: string; description: string; icon: typeof Info; className: string }> = {
  verificado: {
    label: 'Verificado',
    description:
      'Conteo de los sensores infrarrojos de entrada y salida de la zona. Solo cuentan autos: no captan placas, imágenes ni datos personales.',
    icon: BadgeCheck,
    className: 'bg-success/15 text-success',
  },
  estimado: {
    label: 'Estimado',
    description:
      'Calculado con registros manuales de estudiantes y proyecciones basadas en horarios agregados. Puede variar respecto a la ocupación real.',
    icon: TrendingUp,
    className: 'bg-warning/20 text-warning-foreground dark:text-warning',
  },
  simulado: {
    label: 'Simulado',
    description: 'Datos inventados para esta demostración. No reflejan el estacionamiento real.',
    icon: FlaskConical,
    className: 'bg-muted text-muted-foreground',
  },
}

export function DataBadge({ source, className }: { source: DataSource; className?: string }) {
  const meta = META[source]
  const Icon = meta.icon
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
          meta.className,
          className,
        )}
        aria-label={`Fuente de datos: ${meta.label}. Más información`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {meta.label}
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs leading-relaxed" side="top">
        <p className="font-semibold text-sm">{meta.label}</p>
        <p className="text-muted-foreground">{meta.description}</p>
      </PopoverContent>
    </Popover>
  )
}
