import { MessageCircle, Phone } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { firstName, formatPhone } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Call / WhatsApp buttons. The API only sends a phone once both people are matched on an active trip. */
export function ContactPhone({ name, phone, className }: { name: string; phone: string; className?: string }) {
  const who = firstName(name)
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-sm">
        <span className="text-muted-foreground">Celular de {who}: </span>
        <span className="font-medium tabular-nums">{formatPhone(phone)}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:+52${phone}`} className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>
          <Phone aria-hidden="true" />
          Llamar
          <span className="sr-only"> a {who}</span>
        </a>
        <a href={`https://wa.me/52${phone}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>
          <MessageCircle aria-hidden="true" />
          WhatsApp
          <span className="sr-only"> a {who}</span>
        </a>
      </div>
    </div>
  )
}
