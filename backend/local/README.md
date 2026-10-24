# API local

Corre la API completa en tu máquina: las mismas Lambdas de `backend/src`, con las rutas de `template.yaml`, contra **DynamoDB Local** en Docker. No despliega nada ni toca las tablas de AWS, así que sirve para probar antes de hacer `sam deploy`.

Requisitos: Node.js 22 y Docker.

## 1. Arrancar la API (desde la raíz del repo)

```sh
docker run -d --name aventon-ddb -p 8000:8000 amazon/dynamodb-local:2.5.4
npm install --prefix backend/src
node backend/local/server.mjs
```

Crea las 6 tablas la primera vez, sincroniza P1–P10 sin reiniciar contadores y deja la API en `http://localhost:4000`. Cada llamada aparece en la terminal con su código de respuesta.

## 2. Arrancar el frontend apuntando a ella (otra terminal)

En `frontend/.env.local` cambia solo la URL de la API; Cognito sigue siendo el real, así que inicias sesión con tu cuenta de siempre:

```sh
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_IypBl72F8
NEXT_PUBLIC_COGNITO_CLIENT_ID=7sdj2buovqpktsrohj0hg594im
NEXT_PUBLIC_API_URL=http://localhost:4000
```

```sh
cd frontend
pnpm install
pnpm dev
```

Abre `http://localhost:3000`. Para probar con dos alumnos a la vez, usa una ventana normal y una de incógnito con cuentas distintas.

## Qué probar en estacionamiento

1. **Estacionamiento** e **Inicio**: las 10 zonas (P1–P10) con entradas registradas (inicialmente cero).
2. **Registrar entrada** y luego **Registrar salida**: el conteo persistido sube y baja; en la otra ventana se ve en unos 5 s. No se admiten dobles entradas ni sobrecapacidad.
3. **Perfil → Simulador de sensores**: *Restablecer datos de demo*, *Simular entrada/salida*, *Hora pico* y el interruptor *Sensores en línea*. Estos campos están aislados de `registeredOccupied`: ni simular ni restablecer altera sesiones, conteos reales o capacidades configuradas.
4. **Perfil → Horario**: agrega una clase; la **Proyección** y "Tu primera clase" de Estacionamiento ya la cuentan.

## Notas

- **No verifica la firma del token**, solo lo lee (API Gateway sí lo verifica en AWS). Es solo para tu máquina.
- **Los datos viven en el contenedor.** Para empezar de cero: `docker rm -f aventon-ddb` y vuelve a crearlo.
- **Otro puerto:** `PORT=4100 node backend/local/server.mjs`. Otra dirección de DynamoDB: `DYNAMODB_URL=...`.
