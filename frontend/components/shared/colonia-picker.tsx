'use client'

import { Check, ChevronsUpDown, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { COLONIAS, type Colonia } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Searchable list of colonias. Only neighborhoods are ever stored, never street addresses. */
export function ColoniaPicker({
  id,
  value,
  onChange,
  placeholder = 'Elige tu colonia',
  allowAll = false,
  className,
}: {
  id?: string
  value?: Colonia
  onChange: (value: Colonia | undefined) => void
  placeholder?: string
  allowAll?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className={cn(
          'flex h-12 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
          className,
        )}
      >
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className={cn('flex-1 truncate', !value && 'text-muted-foreground')}>{value ?? placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar colonia…" />
          <CommandList>
            <CommandEmpty>No encontramos esa colonia.</CommandEmpty>
            <CommandGroup>
              {allowAll && (
                <CommandItem
                  value="Todas las colonias"
                  onSelect={() => {
                    onChange(undefined)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-4', value ? 'opacity-0' : 'opacity-100')} aria-hidden="true" />
                  Todas las colonias
                </CommandItem>
              )}
              {COLONIAS.map((c) => (
                <CommandItem
                  key={c}
                  value={c}
                  onSelect={() => {
                    onChange(c)
                    setOpen(false)
                  }}
                  className="min-h-10"
                >
                  <Check className={cn('size-4', value === c ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
