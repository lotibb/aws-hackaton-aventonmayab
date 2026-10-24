# Frontend

App web (Next.js), publicada en AWS como sitio estático: **https://d1ivrhj0shesvg.cloudfront.net**. Todos los comandos se corren desde `frontend/`.

## Desarrollo local

```sh
cp .env.example .env.local
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # genera el sitio estático en out/
```

## Publicar en AWS

La app se compila a archivos estáticos (`output: 'export'`) que se sirven desde un bucket privado de S3 detrás de CloudFront (`backend/infra/frontend.yaml`, stack `aventon-mayab-frontend`). No hay servidor de Next.js: el login va directo a Cognito y los datos a la API.

```sh
./deploy-aws.sh     # compila, sube a S3 e invalida la caché de CloudFront
```

Requiere la AWS CLI con credenciales y pnpm. En Windows, córrelo desde Git Bash. Mientras la app use Next.js 16.4.0, el build puede detenerse con un aviso de seguridad (`SecurityFatalError`); vuelve a correr el script y continúa. Se quita actualizando a Next.js 16.4.1. Las variables de `.env.example` se incluyen en el build; son públicas, así que nunca pongas llaves de AWS en el frontend.

Como no hay servidor, no se pueden usar rutas dinámicas (`[id]`), middleware ni rutas API. Por eso el detalle de viaje es `/viajes/detalle?id=...`.

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
