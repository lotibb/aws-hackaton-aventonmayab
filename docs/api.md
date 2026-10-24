# API de Aventón Mayab

Base URL: `https://zdm8p9cfd7.execute-api.us-east-1.amazonaws.com` (variable `NEXT_PUBLIC_API_URL`).

Desde el frontend usa `api()` de `frontend/lib/services/api.ts`: agrega el token, convierte el body a JSON y lanza `Error` con el mensaje del backend.

Todas las rutas requieren `Authorization: Bearer <token>`, con el token de `authService.getToken()` (ID token). API Gateway rechaza con 401 cualquier llamada sin token válido. Los errores responden `{ "message": "..." }` en español, listo para mostrar al usuario.

## Reglas que aplica el backend

- **Sin sobreventa:** aceptar una solicitud es una transacción de DynamoDB. Resta un asiento solo si queda alguno y acepta solo si la solicitud sigue `pending`. Si dos aceptaciones llegan al mismo tiempo por el último lugar, solo una pasa; la otra recibe 409.
- **Sin doble entrada al estacionamiento:** la entrada se guarda solo si el alumno no tiene una activa, aunque toque el botón varias veces.
- **Privacidad:**
  - El ID del alumno siempre sale del token, nunca del body.
  - El punto de encuentro solo lo ven el conductor y los pasajeros aceptados mientras el viaje está `Disponible` o `En curso`.
  - Antes del match (solicitud enviada o aceptada) solo se ve el nombre de pila del conductor.
  - Cada quien ve solo su propio horario.
- **Borrar cuenta:** `DELETE /me` borra todo lo del alumno (perfil, horario, entrada de estacionamiento, solicitudes y viajes propios) y su cuenta de Cognito. Si tenía un asiento aceptado, se devuelve al viaje.

## Viajes

| Ruta | Body | Respuesta |
| --- | --- | --- |
| `GET /trips?colonia=&from=` | | Viajes `Disponible` de otros conductores, con lugares y ordenados por hora. Incluye `driver` y `myRequest`. `from` (ISO) es opcional; por defecto, ahora |
| `POST /trips` | `{ colonia, departureTime, seatsTotal (1-8), meetingPoint, routeDescription?, destination? }` | El viaje creado |
| `GET /trips/{tripId}` | | Viaje + `myRequest`. El conductor recibe además `requests`. 404 si nunca pediste lugar y el viaje ya no está `Disponible` |
| `GET /me/trips` | | `{ asDriver: [{ ...viaje, requests }], asPassenger: [{ ...viaje, myRequest }] }` |
| `POST /trips/{tripId}/requests` | `{ consent: true }` | Solicitud `pending`. Sin consentimiento, 400 |
| `DELETE /trips/{tripId}/requests` | | El pasajero cancela la suya antes de que el viaje empiece (devuelve el asiento si estaba aceptada) |
| `POST /trips/{tripId}/requests/{passengerId}/accept` | | Solo el conductor |
| `POST /trips/{tripId}/requests/{passengerId}/reject` | | Solo el conductor |
| `POST /trips/{tripId}/status` | `{ status: "En curso" \| "Finalizado" \| "Cancelado" }` | Solo el conductor. Al pasar a `En curso`, las solicitudes pendientes se rechazan |

Viaje: `{ tripId, driverId, driver, colonia, destination?, routeDescription?, departureTime, seatsTotal, seatsLeft, meetingPoint?, status, createdAt, myRequest, requests? }`

Solicitud: `{ tripId, passengerId, status, consentGivenAt, createdAt, updatedAt, passenger? }`

Perfil público (`driver`, `passenger`): `{ id, name, colonia, photoUrl }`, o `null` si la cuenta se borró. `meetingPoint` es el id de un punto público de `frontend/lib/config.ts`.

`departureTime` va en ISO 8601 UTC, por ejemplo `"2026-10-26T13:30:00Z"` (usa `new Date(...).toISOString()`).

### Estados

- **Viaje:** `Disponible` → `En curso` → `Finalizado`. También puede pasar a `Cancelado` desde `Disponible` o `En curso`.
- **Solicitud:** `pending` → `accepted` o `rejected`. El pasajero puede pasarla a `cancelled` y volver a pedir lugar.
- **Lo que ve el pasajero:** "Aceptado" = `myRequest.status === "accepted"` con el viaje `Disponible`.

## Estacionamiento

| Ruta | Body | Respuesta |
| --- | --- | --- |
| `GET /parking/zones` | | Zonas + `sensorOnline` (hubo lectura en los últimos 10 min) |
| `GET /parking/session` | | `{ session }` activa o `null` |
| `POST /parking/entry` | `{ zoneId }` | `{ session }`; 409 si ya hay una activa |
| `POST /parking/exit` | | `{ session, exitedAt, minutes }`; 409 si no hay activa |
| `GET /parking/forecast` | | Pendiente (Paso 7) |

## Perfil y horario

| Ruta | Body | Respuesta |
| --- | --- | --- |
| `GET /me` | | `{ userId, email, name, colonia, photoUrl, activeMode, privacyAcceptedAt, createdAt }` |
| `PUT /me` | `{ name, colonia, photoUrl, activeMode, privacyAcceptedAt }` | Reemplaza el perfil completo. El email sale del token. `photoUrl` es una imagen pequeña (data URL de hasta 200 KB) |
| `DELETE /me` | | Borra la cuenta y todos sus datos |
| `GET /me/schedule` | | Clases del alumno |
| `PUT /me/schedule/{slotId}` | `{ day: 1-7 (lunes-domingo), start: "HH:MM", end: "HH:MM", subject? }` | La clase guardada |
| `DELETE /me/schedule/{slotId}` | | |
| `POST /me/schedule/import` | `{ file: base64, mediaType: "application/pdf" \| "image/jpeg" \| "image/png" \| "image/webp", buildings?: string[] }` | `{ classes: [{ day: 1-7, start, end, subject?, room?, building? }] }` leídas del archivo con Claude. No guarda nada. Archivo de hasta 4 MB; 422 si no encuentra clases |
