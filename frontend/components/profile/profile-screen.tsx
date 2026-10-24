'use client'

import { Bell, ChevronRight, FileText, LogOut, MessageCircle, Radio, Star } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { PageHeader } from '@/components/app/page-header'
import { ComingSoonRow } from '@/components/shared/coming-soon'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks/use-data'
import { authService } from '@/lib/services'
import { DeleteAccount } from './delete-account'
import { PrivacyTable } from './privacy-table'
import { ProfileCard } from './profile-card'
import { ScheduleManager } from './schedule-manager'

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  )
}

export function ProfileScreen() {
  const user = useCurrentUser()
  const router = useRouter()
  const { mutate } = useSWRConfig()

  async function signOut() {
    await authService.signOut()
    await mutate(() => true, undefined, { revalidate: false })
    router.replace('/ingresar')
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Perfil" className="mb-0" />

      <ProfileCard user={user} />

      <section aria-labelledby="horarios" className="flex flex-col gap-3">
        <SectionTitle id="horarios">Mis horarios</SectionTitle>
        <ScheduleManager user={user} />
      </section>

      <section aria-labelledby="privacidad" className="flex flex-col gap-3">
        <SectionTitle id="privacidad">Privacidad</SectionTitle>
        <PrivacyTable />
        <Link
          href="/aviso-de-privacidad"
          className="flex min-h-12 items-center gap-3 rounded-2xl border bg-card px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1">Aviso de privacidad completo</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      </section>

      <section aria-labelledby="demo" className="flex flex-col gap-3">
        <SectionTitle id="demo">Modo demo</SectionTitle>
        <Link
          href="/perfil/simulador"
          className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Radio className="size-5 text-primary" aria-hidden="true" />
          <span className="flex flex-1 flex-col py-2">
            <span className="text-sm font-medium">Simulador de sensores</span>
            <span className="text-xs text-muted-foreground">Genera entradas, salidas y fallas de sensores</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      </section>

      <section aria-labelledby="pronto" className="flex flex-col gap-3">
        <SectionTitle id="pronto">Próximamente</SectionTitle>
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          <ComingSoonRow icon={MessageCircle} label="Chat dentro del viaje" />
          <ComingSoonRow icon={Star} label="Calificaciones entre estudiantes" />
          <ComingSoonRow icon={Bell} label="Notificaciones push" />
        </div>
      </section>

      <section aria-label="Cuenta" className="flex flex-col gap-3">
        <Button variant="outline" className="h-12 text-base" onClick={signOut}>
          <LogOut aria-hidden="true" />
          Cerrar sesión
        </Button>
        <DeleteAccount user={user} />
      </section>
    </div>
  )
}
