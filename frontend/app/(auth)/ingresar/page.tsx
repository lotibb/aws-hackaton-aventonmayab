import type { Metadata } from 'next'
import { SignInForm } from '@/components/auth/sign-in-form'

export const metadata: Metadata = { title: 'Ingresar · Aventón Mayab' }

export default function SignInPage() {
  return <SignInForm />
}
