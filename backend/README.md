# Backend (AWS)

Todo en **us-east-1**, cuenta `587601006525`. Son cuatro stacks de CloudFormation; se despliegan en este orden.

| Stack | Archivo | Qué crea |
| --- | --- | --- |
| `aventon-mayab-auth` | `infra/cognito.yaml` | Cognito: login con correo, código de 6 dígitos por email y solo `@anahuac.mx` |
| `aventon-mayab-data` | `infra/dynamodb.yaml` | 6 tablas de DynamoDB |
| `aventon-mayab-backend` | `template.yaml` + `src/` | API Gateway + Lambdas con las reglas |
| `aventon-mayab-frontend` | `infra/frontend.yaml` | Bucket privado de S3 + CloudFront para la app web (se publica con `frontend/deploy-aws.sh`) |

`smartparking/` es un módulo aparte (CDK, stack `MayabParking`) con sus propias tablas y API; se despliega desde esa carpeta, ver su [README](smartparking/README.md).

## Desplegar

Requiere la [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) y, para el último stack, la [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html). Desde `backend/`:

```sh
aws cloudformation deploy --region us-east-1 --template-file infra/cognito.yaml \
  --stack-name aventon-mayab-auth --capabilities CAPABILITY_IAM

aws cloudformation deploy --region us-east-1 --template-file infra/dynamodb.yaml \
  --stack-name aventon-mayab-data

sam build    # instala las dependencias de src/package.json
sam deploy   # usa samconfig.toml

aws cloudformation deploy --region us-east-1 --template-file infra/frontend.yaml \
  --stack-name aventon-mayab-frontend
../frontend/deploy-aws.sh
```

Los dos primeros también se pueden desplegar subiendo el archivo en la consola: CloudFormation → Create stack → Upload a template file.

## Cognito (`infra/cognito.yaml`)

| Output | Valor |
| --- | --- |
| UserPoolId | `us-east-1_IypBl72F8` |
| UserPoolClientId | `7sdj2buovqpktsrohj0hg594im` |
| UserPoolArn | `arn:aws:cognito-idp:us-east-1:587601006525:userpool/us-east-1_IypBl72F8` |

- **Lambda Pre sign-up:** rechaza cualquier correo que no termine en `@anahuac.mx`, también si la cuenta se crea desde la consola.
- **App client:** no tiene secreto, porque es para el navegador.
- **Contraseña:** mínimo 8 caracteres.
- **Límite de correos:** el correo integrado de Cognito envía unos 50 al día. Alcanza para la demo; para producción se conecta Amazon SES.
- **Ver usuarios:** Console → Cognito → User pools → `aventon-mayab-users` → Users.

## Tablas (`infra/dynamodb.yaml`)

Todas son on-demand: se paga por uso, centavos en una demo.

| Tabla | Llave | Índices | Guarda |
| --- | --- | --- | --- |
| `aventon-users` | `userId` | | nombre, email, celular, colonia, foto |
| `aventon-trips` | `tripId` | `byColonia` (colonia + departureTime), `byDriver` | viajes |
| `aventon-seat-requests` | `tripId` + `passengerId` | `byPassenger` | solicitudes de asiento |
| `aventon-parking-zones` | `zoneId` | | capacidad, conteo, última lectura del sensor |
| `aventon-parking-sessions` | `userId` | | entrada activa del alumno |
| `aventon-schedules` | `userId` + `slotId` | | horario de clases (privado) |

`userId` siempre es el `sub` de Cognito.

## API Gateway (`template.yaml`)

URL: `https://zdm8p9cfd7.execute-api.us-east-1.amazonaws.com` (output `ApiUrl`).

- **HTTP API** con un authorizer JWT de Cognito en todas las rutas: sin token válido responde 401 antes de llegar a las Lambdas.
- **CORS:** el parámetro `AllowedOrigins` de `samconfig.toml`: solo la app publicada (`https://d1ivrhj0shesvg.cloudfront.net`) y `http://localhost:3000` para desarrollo. Si agregas otro dominio, súmalo ahí y corre `sam deploy`.
- **Límite:** 50 solicitudes por segundo (ráfagas de 100), para que un error o abuso no dispare el costo.

## Lambdas (`src/`)

| Función | Archivo | Rutas |
| --- | --- | --- |
| `aventon-trips` | `trips.mjs` | viajes y solicitudes de asiento |
| `aventon-parking` | `parking.mjs` | zonas, entrada y salida |
| `aventon-profile` | `profile.mjs` | perfil, horario y borrar cuenta |
| `aventon-schedule-import` | `schedule-import.mjs` | lee un horario en foto o PDF con Claude |

`src/lib/` tiene el código compartido: el router, el usuario del token y el cliente de DynamoDB. Las rutas y reglas están en [`docs/api.md`](../docs/api.md).

### Parking real: activar la integración de P1–P10

El frontend usa la API principal y Cognito, también cuando corre en localhost. La ocupación
no se obtiene de `localStorage`. `POST /parking/entry` y `POST /parking/exit` actualizan
sesión y `registeredOccupied` mediante transacciones de DynamoDB. Los sensores físicos
(`currentCount` y `lastReadingAt`) son una fuente separada: no se suman ni se simulan
para registrar una entrada real. `DELETE /me` cierra la sesión y descuenta su ocupación.

Para activar en el entorno existente, con credenciales AWS de esa cuenta y Node.js 22+:

1. Desde `backend/`, ejecutar `sam build` y `sam deploy`. Se deben desplegar juntas las
   funciones Parking y Profile y sus permisos actualizados de `template.yaml`.
2. Desde `backend/src/`, sincronizar el catálogo con las tablas del backend principal:

   ```powershell
   npm ci
   $env:AWS_REGION = "us-east-1"
   $env:PARKING_ZONES_TABLE = "aventon-parking-zones"
   npm run parking:sync
   ```

3. Reiniciar el frontend local, o publicar el frontend con `frontend/deploy-aws.sh`.

El script utiliza `src/lib/parking-catalog.json`, compartido con el frontend. Agrega las
diez zonas con cero registros iniciales, conserva las capacidades existentes y solo
inicializa `registeredOccupied` si no existe. Puede ejecutarse varias veces sin resetear
contadores ni borrar zonas, sesiones o lecturas anteriores. Las capacidades iniciales
son aproximadas, no oficiales. Las sesiones antiguas se conservan y pueden cerrarse;
no descuentan el nuevo contador porque nunca fueron sumadas a él.

La aplicación muestra la fuente **Registrado**, consulta cada cinco segundos y refresca
después de registrar entrada/salida o de recibir un conflicto. Si no está desplegado el
backend nuevo o falta alguna zona, muestra un error de configuración y no datos ficticios.
El conteo incluye solo vehículos registrados por alumnos. Los pronósticos conservan la
fórmula anterior, usan los horarios propios guardados y están identificados como estimados.
El simulador de sensores sigue disponible, aislado de la API y sin alterar registros reales.

Verificar contra AWS con `python tests/integration_test.py`; este script invoca las
Lambdas y usa datos temporales. Para comprobar además el authorizer y CORS, iniciar
sesión en el frontend, registrar entrada, confirmar desde otro navegador/usuario que
el conteo cambió y registrar salida. La salida siempre usa la zona de la sesión,
independientemente del marcador seleccionado.

#### Pruebas locales de Parking

Desde `backend/src/`: `npm run test:parking` comprueba contratos y transacciones emitidas
con el SDK sustituido durante las pruebas. Para verificar condiciones y concurrencia
contra el motor de DynamoDB Local, iniciar un contenedor temporal:

```powershell
docker run --detach --rm --name aventon-parking-ddb-check -p 127.0.0.1:18000:8000 amazon/dynamodb-local:latest -jar DynamoDBLocal.jar -inMemory -sharedDb
$env:DYNAMODB_ENDPOINT = "http://localhost:18000"
npm run test:parking:ddb
Remove-Item Env:DYNAMODB_ENDPOINT
docker stop aventon-parking-ddb-check
```

La suite crea y borra sus propias tablas locales. Comprueba entradas y salidas simultáneas,
último lugar, aislamiento de sesión, salida retrasada frente a una nueva entrada,
liberación de sesión al eliminar la cuenta, compatibilidad antigua y sincronización
idempotente del catálogo. Estas pruebas locales no acreditan permisos IAM, Cognito o
el despliegue AWS. Desde `frontend/`, `node scripts/check-parking.cjs` verifica el servicio
con respuestas HTTP controladas y sin consultar AWS.

### Importar horario (Claude en Amazon Bedrock)

`aventon-schedule-import` manda la foto o el PDF a Claude en [Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock) y devuelve las clases que encontró; no guarda nada, el alumno las revisa antes de agregarlas.

- **Modelo:** parámetro `ScheduleModelId`, por defecto `anthropic.claude-opus-5-5`. Antes del primer uso, habilita el modelo en Console → Amazon Bedrock → Model access (us-east-1).
- **Permiso:** el rol de la Lambda solo tiene `bedrock-mantle:CreateInference`.
- **Límites:** archivos de hasta 4 MB. Claude tiene 25 s para responder, porque API Gateway corta a los 30 s.
- **Dependencia:** usa `@anthropic-ai/bedrock-sdk` (en `src/package.json`), por eso hay que correr `sam build` antes de `sam deploy`.

## Pruebas

`tests/integration_test.py` llama a las Lambdas desplegadas con los mismos eventos que manda API Gateway. Prueba todas las reglas, incluyendo 5 aceptaciones simultáneas por el último lugar y 5 entradas simultáneas al estacionamiento. Crea datos de prueba y los borra al final.

```sh
pip install boto3
python tests/integration_test.py
```
