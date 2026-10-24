# aws-hackaton-aventonmayab

Backend en AWS para Aventón Mayab (demo de hackathon).

```
Celular → Vercel → API Gateway (JWT de Cognito) → Lambda → DynamoDB
```

Región: **us-east-1** para todo.

## Backend de Smart Parking

El módulo está en [`backend/smartparking/`](backend/smartparking/). Incluye la API de zonas, entradas y salidas, infraestructura AWS CDK, pruebas y el contrato para el frontend TSX. Ejecuta sus comandos desde esa carpeta; consulta su [guía de desarrollo y despliegue](backend/smartparking/README.md).

Smart Parking requiere el **access token** de Cognito: el `authService.getToken()` actual devuelve un ID token, por lo que para este módulo se debe obtener `tokens.accessToken` mediante `fetchAuthSession()`, como muestra su README. El stack CDK crea tablas propias; todavía no reutiliza las tablas de parking del stack `aventon-mayab-data` descrito abajo.

## Paso 2: Login con Cognito

`infra/cognito.yaml` crea:

- **User Pool**: inicio de sesión con correo. Cognito envía el código de 6 dígitos.
- **Pre sign-up Lambda**: rechaza cualquier correo que no termine en `@anahuac.mx`.
- **App Client** sin secreto (para el navegador).

### Desplegado

Stack `aventon-mayab-auth` en us-east-1 (cuenta 587601006525):

| Output | Valor |
| --- | --- |
| UserPoolId | `us-east-1_IypBl72F8` |
| UserPoolClientId | `7sdj2buovqpktsrohj0hg594im` |
| UserPoolArn | `arn:aws:cognito-idp:us-east-1:587601006525:userpool/us-east-1_IypBl72F8` |

### Desplegar (consola, ~5 min)

1. AWS Console → **CloudFormation** → región **us-east-1** → **Create stack** → *With new resources*.
2. **Upload a template file** → `infra/cognito.yaml` → Next.
3. Stack name: `aventon-mayab-auth` → Next → Next.
4. Marca *"I acknowledge that AWS CloudFormation might create IAM resources"* → **Submit**.
5. Cuando diga `CREATE_COMPLETE`, abre la pestaña **Outputs** y copia `UserPoolId` y `UserPoolClientId`.

<details>
<summary>O con la CLI</summary>

```sh
aws cloudformation deploy --region us-east-1 \
  --template-file infra/cognito.yaml \
  --stack-name aventon-mayab-auth \
  --capabilities CAPABILITY_IAM

aws cloudformation describe-stacks --region us-east-1 \
  --stack-name aventon-mayab-auth --query "Stacks[0].Outputs"
```
</details>

### Conectar el frontend

1. En el proyecto de Vercel: `npm install aws-amplify`.
2. Copia `frontend/lib/services/authService.ts` sobre el mock en `/lib/services`.
3. Variables de entorno en Vercel (y en `.env.local`). Estos valores pueden ser públicos:

   ```
   NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_IypBl72F8
   NEXT_PUBLIC_COGNITO_CLIENT_ID=7sdj2buovqpktsrohj0hg594im
   ```

   (Si el frontend usa Vite en lugar de Next.js, cambia el prefijo a `VITE_` y usa `import.meta.env`.)

Flujo: `authService.signUp(email, password)` → el alumno recibe el código → `authService.confirmSignUp(email, code)` → `authService.signIn(email, password)`.

### Probar

- Registro con `algo@gmail.com` → error *"Solo se permiten correos @anahuac.mx"*.
- Registro con `tu@anahuac.mx` → llega el código por correo → confirmar → entrar.
- Ver usuarios: Console → Cognito → User pools → `aventon-mayab-users` → Users.

**Límite de la demo:** el correo integrado de Cognito envía unos 50 correos al día. Alcanza para la demo; para producción se conecta Amazon SES.

## Paso 3: Tablas de DynamoDB

`infra/dynamodb.yaml` (stack `aventon-mayab-data`, ya desplegado) crea 6 tablas on-demand: pagas solo por uso, centavos en una demo.

| Tabla | Llave | Guarda |
| --- | --- | --- |
| `aventon-users` | `userId` | nombre, email, colonia, foto |
| `aventon-trips` | `tripId` | conductor, colonia, `departureTime`, asientos libres, estado, punto de encuentro |
| `aventon-seat-requests` | `tripId` + `passengerId` | estado: pending, accepted, rejected, cancelled |
| `aventon-parking-zones` | `zoneId` | capacidad, conteo actual, estado del sensor, última lectura |
| `aventon-parking-sessions` | `userId` | entrada activa del alumno (zona, hora) |
| `aventon-schedules` | `userId` + `slotId` | horario de clases (privado) |

- `userId` siempre es el `sub` de Cognito (`authService.getUserId()`).
- Índice `byColonia` en trips: busca por `colonia` y ordena por `departureTime`.
- `departureTime` va en ISO 8601 **UTC** (`2026-10-26T13:30:00Z`) para que el orden sea correcto.

Desplegar con la CLI:

```sh
aws cloudformation deploy --region us-east-1 \
  --template-file infra/dynamodb.yaml --stack-name aventon-mayab-data
```
