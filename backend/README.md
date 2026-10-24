# Backend (AWS)

Todo en **us-east-1**, cuenta `587601006525`. Son tres stacks de CloudFormation; se despliegan en este orden.

| Stack | Archivo | Qué crea |
| --- | --- | --- |
| `aventon-mayab-auth` | `infra/cognito.yaml` | Cognito: login con correo, código de 6 dígitos por email y solo `@anahuac.mx` |
| `aventon-mayab-data` | `infra/dynamodb.yaml` | 6 tablas de DynamoDB |
| `aventon-mayab-backend` | `template.yaml` + `src/` | Lambdas con las reglas (y API Gateway desde el Paso 5) |

## Desplegar

Requiere la [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) y, para el último stack, la [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html). Desde `backend/`:

```sh
aws cloudformation deploy --region us-east-1 --template-file infra/cognito.yaml \
  --stack-name aventon-mayab-auth --capabilities CAPABILITY_IAM

aws cloudformation deploy --region us-east-1 --template-file infra/dynamodb.yaml \
  --stack-name aventon-mayab-data

sam deploy   # usa samconfig.toml
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
| `aventon-users` | `userId` | | nombre, email, colonia, foto |
| `aventon-trips` | `tripId` | `byColonia` (colonia + departureTime), `byDriver` | viajes |
| `aventon-seat-requests` | `tripId` + `passengerId` | `byPassenger` | solicitudes de asiento |
| `aventon-parking-zones` | `zoneId` | | capacidad, conteo, última lectura del sensor |
| `aventon-parking-sessions` | `userId` | | entrada activa del alumno |
| `aventon-schedules` | `userId` + `slotId` | | horario de clases (privado) |

`userId` siempre es el `sub` de Cognito.

## Lambdas (`src/`)

| Función | Archivo | Rutas |
| --- | --- | --- |
| `aventon-trips` | `trips.mjs` | viajes y solicitudes de asiento |
| `aventon-parking` | `parking.mjs` | zonas, entrada y salida |
| `aventon-profile` | `profile.mjs` | perfil, horario y borrar cuenta |

`src/lib/` tiene el código compartido: el router, el usuario del token y el cliente de DynamoDB. Las rutas y reglas están en [`docs/api.md`](../docs/api.md).

## Pruebas

`tests/integration_test.py` llama a las Lambdas desplegadas con los mismos eventos que manda API Gateway. Prueba todas las reglas, incluyendo 5 aceptaciones simultáneas por el último lugar y 5 entradas simultáneas al estacionamiento. Crea datos de prueba y los borra al final.

```sh
pip install boto3
python tests/integration_test.py
```
