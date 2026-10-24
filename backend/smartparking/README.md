# Backend — Smart Parking de Aventón Mayab

Este módulo implementa exclusivamente la función de Smart Parking. Ejecuta los comandos siguientes desde `backend/smartparking/`.

Backend TypeScript: API Gateway HTTP API → Lambda Node.js 22 → DynamoDB.
Autenticación con un Cognito existente administrado por el equipo de login.

## Estado y alcance

- Consulta de zonas y sesión personal, registro de entrada y salida.
- Entradas manuales incrementan ocupación; salidas la decrementan.
- Una sesión activa por usuario; transacciones para mantener sesión y contador juntos.
- Capacidad opcional: sin ella `capacity`, `available` y `occupancyPercentage` son `null`.
- Cuando se configure una capacidad positiva, se aplica automáticamente el límite de entrada.
- Sensores, IoT Core y pronósticos quedan pendientes. No hay integración de sensores en esta versión.
- Zonas A/B/C son datos de demostración, no un inventario real del campus.

## Desarrollo y verificación

```powershell
npm ci
npm run typecheck
npm test
npm run synth
npm run aws:check
```

Las pruebas locales cubren validación y presentación de zonas. Las garantías de concurrencia se implementan con transacciones y condiciones de DynamoDB; falta verificarlas contra AWS desplegado.

## Credenciales AWS

`npm run aws:check` usa la cadena estándar del SDK: variables de entorno, perfil compartido o identidad de la plataforma. No requiere AWS CLI. Tener acceso a la consola web no configura automáticamente credenciales locales.

Si cuentas con AWS CLI y un perfil SSO:

```powershell
aws configure sso
aws sso login --profile hackathon
$env:AWS_PROFILE = "hackathon"
$env:AWS_REGION = "us-east-1"
npm run aws:check
```

También puedes configurar credenciales temporales mediante `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `AWS_SESSION_TOKEN` en tu terminal. No las subas al repositorio ni las compartas por chat. El SDK no carga archivos `.env` automáticamente.

## Desplegar

Solicitar al encargado de Cognito: región, User Pool ID y App Client ID sin secreto. El pool debe corresponder a la región del stack. La validación de correo institucional corresponde a Cognito.

Con credenciales configuradas:

```powershell
$env:AWS_REGION = "us-east-1"
npx cdk bootstrap aws://TU_ACCOUNT_ID/us-east-1
npm run deploy -- --parameters CognitoUserPoolId=us-east-1_REEMPLAZAR --parameters CognitoClientId=REEMPLAZAR --parameters AllowedOrigins="http://localhost:3000,https://TU-APP.vercel.app"
```

El despliegue entrega `ApiUrl`, `ZonesTable` y `SessionsTable`. CORS usa orígenes exactos sin barra final. Se necesitan permisos para CloudFormation, IAM, Lambda, API Gateway, DynamoDB y recursos de bootstrap.

Crear zonas demo después del despliegue:

```powershell
$env:ZONES_TABLE = "OUTPUT_ZonesTable"
npx tsx scripts/seed.ts
```

El seed conserva zonas existentes. Puedes agregar zonas o configurar `capacity` (entero positivo) desde DynamoDB por ahora. No reiniciar `occupied` mientras existan sesiones activas. Las tablas se conservan al eliminar el stack; los logs tienen retención de siete días.

## Contrato para frontend TSX

Todas las rutas requieren `Authorization: Bearer ACCESS_TOKEN`. Usar el **access token**, no el ID token. API Gateway valida firma, expiración, emisor y cliente; Lambda comprueba `token_use=access` y obtiene `userId` de `sub`.

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/parking/zones` | — | `200 { zones: ParkingZone[] }` |
| GET | `/parking/session` | — | `200 { session: ParkingSession \| null }` |
| POST | `/parking/entry` | `{ "zoneId": "A" }` | `201 { session: ParkingSession }` |
| POST | `/parking/exit` | — | `200 { session: null, exitedAt: string }` |

```ts
type ParkingZone = {
  zoneId: string;
  name: string;
  occupied: number;
  capacity: number | null;
  available: number | null;
  occupancyPercentage: number | null;
  updatedAt: string;
  source: "manual";
};
type ParkingSession = {
  userId: string;
  sessionId: string;
  zoneId: string;
  enteredAt: string;
};
```

Fechas en ISO UTC. Errores de aplicación: `{ error: { code, message } }`. API Gateway puede devolver su propio formato de error para tokens rechazados, por lo que el cliente debe contemplarlo.

- `400 INVALID_BODY`: JSON o zoneId inválido.
- `401 UNAUTHORIZED`: falta access token válido.
- `404 ZONE_NOT_FOUND`: zona inexistente.
- `409 ENTRY_CONFLICT`: sesión activa, capacidad alcanzada o conflicto concurrente.
- `409 NO_ACTIVE_SESSION` / `EXIT_CONFLICT`: no se puede completar la salida.
- `500 INTERNAL_ERROR`: error interno.

Consultar zonas cada cinco segundos. Ante `409`, refrescar sesión y zonas. Las consultas de zonas son eventualmente consistentes, por lo que una actualización puede tardar en reflejarse.

Ejemplo con Amplify Auth instalado en el frontend:

```tsx
import { fetchAuthSession } from "aws-amplify/auth";

export async function parkingRequest(apiUrl: string, path: string, body?: unknown) {
  const { tokens } = await fetchAuthSession();
  if (!tokens?.accessToken) throw new Error("Inicia sesión");
  const response = await fetch(`${apiUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${tokens.accessToken.toString()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? data.message ?? "Error de parking");
  return data;
}

// parkingRequest(API_URL, "/parking/entry", { zoneId: "A" });
// parkingRequest(API_URL, "/parking/exit", {});
```

## Comprobación en AWS antes de la demo

1. Crear zonas con el seed e iniciar sesión con Cognito.
2. Consultar zonas y sesión (inicialmente null).
3. Registrar entrada en A: sesión creada y ocupación +1.
4. Repetir entrada: 409 y contador sin cambio.
5. Registrar salida: sesión null y ocupación -1; repetir debe dar 409.
6. Probar dos entradas concurrentes del mismo usuario: solo una debe aplicarse.
7. Con capacidad de prueba 1, intentar entradas de dos usuarios: solo una debe aplicarse.
8. Comprobar que token ausente/expirado se rechaza y que otro usuario no recibe la sesión ajena.
