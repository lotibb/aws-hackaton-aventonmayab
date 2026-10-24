import type { Metadata } from 'next'
import { TripDetail } from '@/components/trips/trip-detail'

export const metadata: Metadata = { title: 'Detalle del viaje · Aventón Mayab' }

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TripDetail tripId={id} />
}
