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
├── frontend/              App web (Next.js en Vercel)
│   ├── lib/services/      authService.ts ya conectado a Cognito
│   └── .env.example       Variables para Vercel
├── backend/               Todo lo de AWS
│   ├── infra/             Cognito y tablas de DynamoDB
│   ├── src/               Código de las Lambdas (Node.js 22)
│   ├── tests/             Prueba de integración contra AWS
│   ├── template.yaml      Lambdas (y API Gateway desde el Paso 5)
│   └── samconfig.toml     Configuración de `sam deploy`
└── docs/
    └── api.md             Rutas de la API para el frontend
```

- [`frontend/README.md`](frontend/README.md): cómo agregar la app y configurar Vercel.
- [`backend/README.md`](backend/README.md): cómo desplegar y probar.
- [`docs/api.md`](docs/api.md): la API.

## Avance

- [x] Paso 2: Login con Cognito (solo correos `@anahuac.mx`)
- [x] Paso 3: Tablas de DynamoDB
- [x] Paso 4: Lambdas con las reglas (sin sobreventa, sin doble entrada, privacidad, borrar cuenta)
- [ ] Paso 5: API Gateway
- [ ] Paso 6: Sensores del estacionamiento con IoT Core
- [ ] Paso 7: Pronósticos
- [ ] Paso 8: Conectar el frontend
