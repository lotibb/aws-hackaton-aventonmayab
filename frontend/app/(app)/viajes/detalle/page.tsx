import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TripDetailFromQuery } from '@/components/trips/trip-detail'

export const metadata: Metadata = { title: 'Detalle del viaje · Aventón Mayab' }

// The trip id travels as ?id= so this page is a single static file (the app is a static export).
export default function TripDetailPage() {
  return (
    <Suspense>
      <TripDetailFromQuery />
    </Suspense>
  )
}
