import type { Metadata } from 'next'
import { PrivacyNotice } from '@/components/privacy/privacy-notice'

export const metadata: Metadata = {
  title: 'Aviso de privacidad · Aventón Mayab',
  description: 'Cómo protegemos tu ubicación, tus horarios y tus datos en Aventón Mayab.',
}

export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <PrivacyNotice />
    </div>
  )
}
