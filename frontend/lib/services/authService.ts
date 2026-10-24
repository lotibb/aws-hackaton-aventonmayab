// Drop-in replacement for the mock authService. Copy into the Vercel app.
// Requires: npm install aws-amplify
import { Amplify } from "aws-amplify";
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      loginWith: { email: true },
    },
  },
});

const ERROR_MESSAGES: Record<string, string> = {
  UserLambdaValidationException: "Solo se permiten correos @anahuac.mx",
  UsernameExistsException: "Ya existe una cuenta con este correo",
  InvalidPasswordException: "La contraseña debe tener al menos 8 caracteres",
  CodeMismatchException: "Código incorrecto",
  ExpiredCodeException: "El código expiró, solicita uno nuevo",
  NotAuthorizedException: "Correo o contraseña incorrectos",
  LimitExceededException: "Demasiados intentos, espera un momento",
};

// Re-throw Cognito errors with a Spanish message the UI can show directly.
async function withFriendlyErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const name = (err as Error).name;
    throw new Error(ERROR_MESSAGES[name] ?? (err as Error).message);
  }
}

export const authService = {
  // Cognito emails the 6-digit code automatically.
  signUp: (email: string, password: string) =>
    withFriendlyErrors(() =>
      signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      }),
    ),

  confirmSignUp: (email: string, code: string) =>
    withFriendlyErrors(() =>
      confirmSignUp({ username: email, confirmationCode: code }),
    ),

  resendCode: (email: string) =>
    withFriendlyErrors(() => resendSignUpCode({ username: email })),

  // needsConfirmation: the account exists but the email code was never entered.
  signIn: (email: string, password: string) =>
    withFriendlyErrors(async () => {
      try {
        const { isSignedIn, nextStep } = await signIn({
          username: email,
          password,
        });
        return {
          isSignedIn,
          needsConfirmation: nextStep.signInStep === "CONFIRM_SIGN_UP",
        };
      } catch (err) {
        if ((err as Error).name === "UserAlreadyAuthenticatedException") {
          return { isSignedIn: true, needsConfirmation: false };
        }
        throw err;
      }
    }),

  signOut: () => signOut(),

  // Cognito "sub": use this as userId everywhere. Null when logged out.
  getUserId: async (): Promise<string | null> => {
    try {
      return (await getCurrentUser()).userId;
    } catch {
      return null;
    }
  },

  // Send as "Authorization: Bearer <token>" to API Gateway (Step 5).
  getToken: async (): Promise<string | null> => {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  },
};
