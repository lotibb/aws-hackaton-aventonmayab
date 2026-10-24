import type { Metadata } from 'next'
import { ParkingScreen } from '@/components/parking/parking-screen'

export const metadata: Metadata = { title: 'Estacionamiento · Aventón Mayab' }

export default function ParkingPage() {
  return <ParkingScreen />
}
