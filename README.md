# aws-hackaton-aventonmayab

Backend en AWS para Aventón Mayab (demo de hackathon).

```
Celular → Vercel → API Gateway (JWT de Cognito) → Lambda → DynamoDB
```

Región: **us-east-1** para todo.

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

## Paso 4: Funciones Lambda (reglas del negocio)

`backend/src/` tiene 3 funciones (Node.js 22, sin dependencias externas). `infra/backend.yaml` (stack `aventon-mayab-backend`) las despliega:

| Función | Archivo | Rutas |
| --- | --- | --- |
| `aventon-trips` | `trips.mjs` | viajes y solicitudes de asiento |
| `aventon-parking` | `parking.mjs` | zonas, entrada y salida |
| `aventon-profile` | `profile.mjs` | perfil, horario y borrar cuenta |

Las reglas viven aquí, no en el frontend:

- **Sin sobreventa:** aceptar una solicitud es una transacción de DynamoDB. Resta un asiento solo si queda alguno y acepta solo si la solicitud sigue `pending`. Probado con 5 aceptaciones simultáneas para 1 lugar: entra 1 y las otras 4 reciben 409.
- **Sin doble entrada al estacionamiento:** la entrada se guarda solo si no hay una activa. Probado con 5 taps simultáneos: se guarda 1.
- **Privacidad:** el ID del alumno siempre sale del token de Cognito, nunca del body. El punto de encuentro solo lo ven el conductor y los pasajeros aceptados mientras el viaje está `Disponible` o `En curso`. Cada quien ve solo su propio horario.
- **Borrar cuenta:** `DELETE /me` borra perfil, horario, entrada de estacionamiento, solicitudes (devuelve el asiento si estaba aceptado) y viajes propios, y luego la cuenta de Cognito.

### API

Todas las rutas requieren `Authorization: Bearer <authService.getToken()>`. Los errores responden `{ "message": "..." }` en español, listo para mostrar.

| Ruta | Body | Respuesta |
| --- | --- | --- |
| `GET /trips?colonia=&from=` | | Viajes `Disponible` con lugares, ordenados por hora, sin `meetingPoint` |
| `POST /trips` | `{ colonia, departureTime, seatsTotal (1-8), meetingPoint }` | El viaje creado |
| `GET /trips/{tripId}` | | Viaje + `myRequest`. El conductor recibe además `requests` |
| `GET /me/trips` | | `{ asDriver: [...], asPassenger: [{ ...viaje, myRequest }] }` |
| `POST /trips/{tripId}/requests` | | Solicitud `pending` |
| `DELETE /trips/{tripId}/requests` | | El pasajero cancela la suya (devuelve el asiento si estaba aceptada) |
| `POST /trips/{tripId}/requests/{passengerId}/accept` | | Solo el conductor |
| `POST /trips/{tripId}/requests/{passengerId}/reject` | | Solo el conductor |
| `POST /trips/{tripId}/status` | `{ status: "En curso" \| "Finalizado" \| "Cancelado" }` | Solo el conductor |
| `GET /parking/zones` | | Zonas + `sensorOnline` (hubo lectura en los últimos 10 min) |
| `GET /parking/session` | | `{ session }` activa o `null` |
| `POST /parking/entry` | `{ zoneId }` | `{ session }`; 409 si ya hay una activa |
| `POST /parking/exit` | | `{ session, exitedAt, minutes }`; 409 si no hay activa |
| `GET /me` | | Perfil `{ userId, email, name, colonia, photoUrl }` |
| `PUT /me` | `{ name, colonia, photoUrl }` | Reemplaza el perfil (el email sale del token) |
| `DELETE /me` | | Borra la cuenta y todos sus datos |
| `GET /me/schedule` | | Clases del alumno |
| `PUT /me/schedule/{slotId}` | `{ day: 1-7 (lunes-domingo), start: "HH:MM", end: "HH:MM", subject? }` | La clase guardada |
| `DELETE /me/schedule/{slotId}` | | |

Estados:

- **Viaje:** `Disponible` → `En curso` → `Finalizado`. También puede pasar a `Cancelado` desde `Disponible` o `En curso`.
- **Solicitud:** `pending` → `accepted` o `rejected`. El pasajero puede pasarla a `cancelled`.
- **Lo que ve el pasajero:** "Aceptado" = `myRequest.status === "accepted"` con el viaje `Disponible`.

Desplegar (requiere [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)):

```sh
sam deploy --region us-east-1 --template-file infra/backend.yaml \
  --stack-name aventon-mayab-backend --resolve-s3 --capabilities CAPABILITY_IAM \
  --parameter-overrides UserPoolId=us-east-1_IypBl72F8
```
