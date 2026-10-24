import type { Metadata } from 'next'
import { TripsScreen } from '@/components/trips/trips-screen'

export const metadata: Metadata = { title: 'Viajes · Aventón Mayab' }

export default function TripsPage() {
  return <TripsScreen />
}
