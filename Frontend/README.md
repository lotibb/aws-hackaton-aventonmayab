# Frontend de Aventón Mayab

Aplicación Next.js / React en TSX importada desde `aventon-mayab-app-build`.

## Desarrollo

Desde esta carpeta, instala las dependencias con la versión de pnpm declarada en `package.json`:

```powershell
npx pnpm@12.3.4 install --frozen-lockfile
npx pnpm@12.3.4 dev
```

Crea `.env.local` con las variables de `.env.example` y los identificadores públicos del Cognito del equipo. El `.env` de la carpeta original no se incluye en el repositorio.

## Producción

```powershell
npx pnpm@12.3.4 build
npx pnpm@12.3.4 start
```

En Vercel selecciona **Frontend** como Root Directory y configura las variables de Cognito. Esta carpeta contiene el proyecto fuente para generar el build; `.next/` se genera durante la compilación y no se versiona.

## Integraciones

- Se conserva `lib/services/authService.ts` del repositorio, con la integración existente de Cognito.
- Los servicios mock y las capacidades de parking recibidos en la app son datos de demostración; importar esta app no los conecta automáticamente al backend de Smart Parking.
- `next.config.mjs` conserva `typescript.ignoreBuildErrors: true` del proyecto recibido. Un build exitoso no sustituye una comprobación de tipos.
