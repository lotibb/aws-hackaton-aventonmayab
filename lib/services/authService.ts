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

async function withFriendlyErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const name = (err as Error).name;
    throw new Error(ERROR_MESSAGES[name] ?? (err as Error).message);
  }
}

export const authService = {
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

  getUserId: async (): Promise<string | null> => {
    try {
      return (await getCurrentUser()).userId;
    } catch {
      return null;
    }
  },

  getToken: async (): Promise<string | null> => {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  },
};
