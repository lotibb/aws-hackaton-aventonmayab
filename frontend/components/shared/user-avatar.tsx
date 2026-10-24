import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export function UserAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string
  photoUrl?: string
  className?: string
}) {
  return (
    <Avatar className={cn('size-10', className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt={`Foto de ${name}`} />}
      <AvatarFallback className="bg-accent font-medium text-accent-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
