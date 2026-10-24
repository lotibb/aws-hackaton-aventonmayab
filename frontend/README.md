# Frontend

Aquí va la app web (Next.js) que se despliega en Vercel.

## Agregar la app a esta carpeta

1. Copia el proyecto completo aquí: `package.json`, `app/`, `components/`, `lib/`, etc. Así `frontend/package.json` queda en esta carpeta.
2. **Conserva** `lib/services/authService.ts` y `lib/services/api.ts` de esta carpeta. `authService` reemplaza al mock y ya está conectado a Cognito.
3. Copia `.env.example` a `.env.local` para desarrollo local.

## Vercel

1. Settings → Git: conecta el repo `lotibb/aws-hackaton-aventonmayab`.
2. Settings → Build and Deployment → **Root Directory**: `frontend`.
3. Settings → Environment Variables: agrega las de `.env.example` en Production, Preview y Development, y vuelve a desplegar.

Las variables son públicas. Nunca pongas llaves de AWS en el frontend.

## Login (`lib/services/authService.ts`)

Requiere `npm install aws-amplify`. Úsalo solo desde Client Components (`"use client"`).

| Función | Uso |
| --- | --- |
| `signUp(email, password)` | Registro. Cognito envía un código de 6 dígitos al correo |
| `confirmSignUp(email, code)` | Confirma el código |
| `resendCode(email)` | Reenvía el código |
| `signIn(email, password)` | `{ isSignedIn, needsConfirmation }` |
| `signOut()` | Cierra sesión |
| `getUserId()` | ID del alumno (el `sub` de Cognito), o `null` si no hay sesión |
| `getToken()` | Token para `Authorization: Bearer ...` en las llamadas a la API |

Los errores ya vienen en español, por ejemplo "Solo se permiten correos @anahuac.mx". Muestra `error.message` tal cual.

## API (`lib/services/api.ts`)

`api()` llama a la API con el token del alumno y lanza `Error` con el mensaje del backend, ya en español.

```ts
import { api } from "@/lib/services/api";

const trips = await api<Trip[]>(`/trips?colonia=${encodeURIComponent(colonia)}`);
await api("/trips", { method: "POST", body: { colonia, departureTime, seatsTotal, meetingPoint } });
await api(`/trips/${tripId}/requests`, { method: "POST" });
```

Las rutas, los bodies y los estados están en [`docs/api.md`](../docs/api.md).
