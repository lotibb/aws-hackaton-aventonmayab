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
| `aventon-parking-zones` | `zoneId` | | capacidad, conteo de sensores, estimado manual, últimas lecturas |
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
| `aventon-parking` | `parking.mjs` | zonas, entrada y salida, sensores (simulador) y conteos para las proyecciones |
| `aventon-profile` | `profile.mjs` | perfil, horario y borrar cuenta |
| `aventon-schedule-import` | `schedule-import.mjs` | lee un horario en foto o PDF con Claude |

`src/lib/` tiene el código compartido: el router, el usuario del token y el cliente de DynamoDB. Las rutas y reglas están en [`docs/api.md`](../docs/api.md).

### Importar horario (Claude en Amazon Bedrock)

`aventon-schedule-import` manda la foto o el PDF a Claude en [Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock) y devuelve las clases que encontró; no guarda nada, el alumno las revisa antes de agregarlas.

- **Modelo:** parámetro `ScheduleModelId`, por defecto `anthropic.claude-opus-5-5`. Antes del primer uso, habilita el modelo en Console → Amazon Bedrock → Model access (us-east-1).
- **Permiso:** el rol de la Lambda solo tiene `bedrock-mantle:CreateInference`.
- **Límites:** archivos de hasta 4 MB. Claude tiene 25 s para responder, porque API Gateway corta a los 30 s.
- **Dependencia:** usa `@anthropic-ai/bedrock-sdk` (en `src/package.json`), por eso hay que correr `sam build` antes de `sam deploy`.

## Pruebas

**En tu máquina, sin desplegar:** [`local/README.md`](local/README.md) corre la API completa contra DynamoDB Local.

`tests/integration_test.py` llama a las Lambdas desplegadas con los mismos eventos que manda API Gateway. Prueba todas las reglas, incluyendo 5 aceptaciones simultáneas por el último lugar y 5 entradas simultáneas al estacionamiento. Crea datos de prueba y los borra al final.

```sh
pip install boto3
python tests/integration_test.py
```
