'use client'

import { Check, ChevronsUpDown, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** Searchable trip-location picker that also accepts places outside the suggestions. */
export function LocationPicker({
  id,
  value,
  onChange,
  options,
  placeholder = 'Elige un lugar',
  allowAll = false,
  className,
}: {
  id?: string
  value?: string
  onChange: (value: string | undefined) => void
  options: readonly string[]
  placeholder?: string
  allowAll?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const customLocation = query.trim()
  const hasExactOption = options.some((option) => option.toLocaleLowerCase('es-MX') === customLocation.toLocaleLowerCase('es-MX'))

  function select(nextValue: string | undefined) {
    onChange(nextValue)
    setQuery('')
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) setQuery('')
      }}
    >
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
        <Command shouldFilter>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Buscar o escribir un lugar…" />
          <CommandList>
            <CommandEmpty>No encontramos ese lugar.</CommandEmpty>
            <CommandGroup>
              {allowAll && (
                <CommandItem value="Todos los lugares" onSelect={() => select(undefined)} className="min-h-10">
                  <Check className={cn('size-4', value ? 'opacity-0' : 'opacity-100')} aria-hidden="true" />
                  Todos los lugares
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => select(option)} className="min-h-10">
                  <Check className={cn('size-4', value === option ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  {option}
                </CommandItem>
              ))}
              {customLocation.length >= 2 && !hasExactOption && (
                <CommandItem value={customLocation} onSelect={() => select(customLocation)} className="min-h-10">
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                  Usar “{customLocation}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
