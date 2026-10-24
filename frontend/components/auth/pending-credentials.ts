'use client'

// Kept in memory only (never persisted) so the verification screen can sign the user in
// right after confirming the code. Lost on reload, in which case the user signs in manually.
let pending: { email: string; password: string } | null = null

export function setPendingCredentials(email: string, password: string) {
  pending = { email: email.trim().toLowerCase(), password }
}

export function takePendingCredentials(email: string): string | null {
  if (!pending || pending.email !== email.trim().toLowerCase()) return null
  const { password } = pending
  pending = null
  return password
}
