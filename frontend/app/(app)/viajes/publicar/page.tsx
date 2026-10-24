import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/page-header'
import { PublishTripForm } from '@/components/trips/publish-trip-form'

export const metadata: Metadata = { title: 'Publicar viaje · Aventón Mayab' }

export default function PublishTripPage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="Publicar viaje" description="Comparte tus lugares libres hacia el campus." backHref="/viajes" />
      <PublishTripForm />
    </div>
  )
}
