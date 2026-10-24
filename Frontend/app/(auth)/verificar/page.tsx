import type { Metadata } from 'next'
import { Suspense } from 'react'
import { VerifyCodeForm } from '@/components/auth/verify-code-form'

export const metadata: Metadata = { title: 'Verifica tu correo · Aventón Mayab' }

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyCodeForm />
    </Suspense>
  )
}
