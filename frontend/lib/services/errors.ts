export type ServiceErrorCode =
  | 'INVALID_DOMAIN'
  | 'INVALID_INPUT'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'UNVERIFIED'
  | 'INVALID_CODE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONDITIONAL_CHECK_FAILED'
  | 'CONFLICT'

/** Mirrors the shape of errors we will map from Cognito / API Gateway responses. */
export class ServiceError extends Error {
  constructor(
    public code: ServiceErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Ocurrió un error inesperado. Intenta de nuevo.'
}
