import type { Metadata } from 'next'
import { SensorSimulator } from '@/components/profile/sensor-simulator'

export const metadata: Metadata = { title: 'Simulador de sensores · Aventón Mayab' }

export default function SimulatorPage() {
  return <SensorSimulator />
}
