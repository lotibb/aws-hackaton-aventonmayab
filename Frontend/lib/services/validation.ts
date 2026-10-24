import { ALLOWED_EMAIL_DOMAIN } from '../config'

/** Client-side hint only; Cognito's Pre Sign-up trigger enforces the real rule. */
export function isInstitutionalEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)
}
