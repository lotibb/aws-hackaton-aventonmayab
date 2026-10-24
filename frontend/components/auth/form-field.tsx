import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function FormField({
  id,
  label,
  hint,
  error,
  ...inputProps
}: React.ComponentProps<typeof Input> & { id: string; label: string; hint?: string; error?: string }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-12 text-base md:text-base" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
