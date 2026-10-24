import type { Metadata } from 'next'
import { HomeScreen } from '@/components/home/home-screen'

export const metadata: Metadata = { title: 'Inicio · Aventón Mayab' }

export default function HomePage() {
  return <HomeScreen />
}
