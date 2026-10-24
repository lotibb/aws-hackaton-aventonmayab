# Aventón Mayab

App para estudiantes de la Anáhuac Mayab: aventones entre compañeros y disponibilidad del estacionamiento. Proyecto para el hackathon de AWS.

## Arquitectura

```
Celular → Vercel (frontend/) → API Gateway → Lambda (backend/src/) → DynamoDB
                                    ↑
                     Cognito: login solo con @anahuac.mx

Sensores del estacionamiento → IoT Core → Lambda → DynamoDB
```

El frontend nunca habla directo con la base de datos y no necesita llaves de AWS.

## Estructura

```
├── frontend/              App web (Next.js en Vercel, Root Directory = frontend)
│   ├── app/               Páginas
│   ├── components/        Componentes de UI
│   ├── lib/services/      authService.ts (Cognito), api.ts (llamadas a la API) y servicios
│   └── .env.example       Variables para Vercel
├── backend/               Todo lo de AWS
│   ├── infra/             Cognito y tablas de DynamoDB
│   ├── src/               Código de las Lambdas (Node.js 22)
│   ├── tests/             Prueba de integración contra AWS
│   ├── template.yaml      API Gateway + Lambdas
│   ├── samconfig.toml     Configuración de `sam deploy`
│   └── smartparking/      Módulo de Smart Parking (CDK, se despliega aparte)
└── docs/
    └── api.md             Rutas de la API para el frontend
```

- [`frontend/README.md`](frontend/README.md): cómo correr la app y configurar Vercel.
- [`backend/README.md`](backend/README.md): cómo desplegar y probar.
- [`docs/api.md`](docs/api.md): la API.

## Backend de Smart Parking

El módulo está en [`backend/smartparking/`](backend/smartparking/). Incluye la API de zonas, entradas y salidas, infraestructura AWS CDK, pruebas y el contrato para el frontend TSX. Ejecuta sus comandos desde esa carpeta; consulta su [guía de desarrollo y despliegue](backend/smartparking/README.md).

Smart Parking requiere el **access token** de Cognito: el `authService.getToken()` actual devuelve un ID token, por lo que para este módulo se debe obtener `tokens.accessToken` mediante `fetchAuthSession()`, como muestra su README. El stack CDK crea tablas propias; todavía no reutiliza las tablas de parking del stack `aventon-mayab-data` (`backend/infra/dynamodb.yaml`).

## Avance

- [x] Paso 2: Login con Cognito (solo correos `@anahuac.mx`)
- [x] Paso 3: Tablas de DynamoDB
- [x] Paso 4: Lambdas con las reglas (sin sobreventa, sin doble entrada, privacidad, borrar cuenta)
- [x] Paso 5: API Gateway: `https://zdm8p9cfd7.execute-api.us-east-1.amazonaws.com`
- [ ] Paso 6: Sensores del estacionamiento con IoT Core
- [ ] Paso 7: Pronósticos
- [ ] Paso 8: Conectar el frontend
