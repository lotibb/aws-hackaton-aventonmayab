# API de Aventón Mayab

Base URL: `https://zdm8p9cfd7.execute-api.us-east-1.amazonaws.com` (variable `NEXT_PUBLIC_API_URL`).

Desde el frontend usa `api()` de `frontend/lib/services/api.ts`: agrega el token, convierte el body a JSON y lanza `Error` con el mensaje del backend.

Todas las rutas requieren `Authorization: Bearer <token>`, con el token de `authService.getToken()` (ID token). API Gateway rechaza con 401 cualquier llamada sin token válido. Los errores responden `{ "message": "..." }` en español, listo para mostrar al usuario.

## Reglas que aplica el backend

- **Sin sobreventa:** aceptar una solicitud es una transacción de DynamoDB. Resta un asiento solo si queda alguno y acepta solo si la solicitud sigue `pending`. Si dos aceptaciones llegan al mismo tiempo por el último lugar, solo una pasa; la otra recibe 409.
- **Sin doble entrada al estacionamiento:** la entrada se guarda solo si el alumno no tiene una activa, aunque toque el botón varias veces. La entrada y la salida cambian el estimado de la zona en la misma transacción.
- **Privacidad:**
  - El ID del alumno siempre sale del token, nunca del body.
  - El punto de encuentro solo lo ven el conductor y los pasajeros aceptados mientras el viaje está disponible.
  - Antes del match (solicitud enviada o aceptada) solo se ve el nombre de pila del conductor.
  - El celular (`phone` en `driver` y `passenger`) solo se envía cuando el conductor aceptó la solicitud y el viaje está `Disponible` o `En curso`: el pasajero ve el del conductor y el conductor el de ese pasajero. Con la solicitud pendiente, rechazada o cancelada, o con el viaje terminado, no aparece.
  - Cada quien ve solo su propio horario.
- **Borrar cuenta:** `DELETE /me` borra todo lo del alumno (perfil, horario, entrada de estacionamiento, solicitudes y viajes propios) y su cuenta de Cognito. Si tenía un asiento aceptado, se devuelve al viaje.

## Viajes

| Ruta | Body | Respuesta |
| --- | --- | --- |
| `GET /trips?colonia=&from=` | | Viajes `Disponible` de otros conductores, con lugares y ordenados por hora. Incluye `driver` y `myRequest`. `from` (ISO) es opcional; por defecto, ahora |
| `POST /trips` | `{ colonia, departureTime, seatsTotal (1-8), destination?, meetingPoint?, routeDescription? }` | El viaje creado; el origen y destino aceptan texto libre |
| `GET /trips/{tripId}` | | Viaje + `myRequest`. El conductor recibe además `requests`. 404 si nunca pediste lugar y el viaje ya no está `Disponible` |
| `GET /me/trips` | | `{ asDriver: [{ ...viaje, requests }], asPassenger: [{ ...viaje, myRequest }] }` |
| `POST /trips/{tripId}/requests` | `{ consent: true }` | Solicitud `pending`. Sin consentimiento, 400 |
| `DELETE /trips/{tripId}/requests` | | El pasajero cancela la suya antes de que el conductor complete el viaje (devuelve el asiento si estaba aceptada) |
| `POST /trips/{tripId}/requests/{passengerId}/accept` | | Solo el conductor |
| `POST /trips/{tripId}/requests/{passengerId}/reject` | | Solo el conductor |
| `PUT /trips/{tripId}/meeting-point` | `{ meetingPoint }` | Solo el conductor; actualiza el punto público mientras el viaje siga disponible |
| `POST /trips/{tripId}/status` | `{ status: "Finalizado" \| "Cancelado" }` | Solo el conductor. Completar el viaje rechaza solicitudes que sigan pendientes |

Viaje: `{ tripId, driverId, driver, colonia, destination?, routeDescription?, departureTime, seatsTotal, seatsLeft, meetingPoint?, status, createdAt, myRequest, requests? }`

Solicitud: `{ tripId, passengerId, status, consentGivenAt, createdAt, updatedAt, passenger? }`

Perfil público (`driver`, `passenger`): `{ id, name, colonia, photoUrl, phone? }`, o `null` si la cuenta se borró. `meetingPoint` es texto libre, pero debe describir un lugar público, nunca un domicilio particular.

`departureTime` va en ISO 8601 UTC, por ejemplo `"2026-10-26T13:30:00Z"` (usa `new Date(...).toISOString()`).

### Estados

- **Viaje:** `Disponible` → `Finalizado`, o `Cancelado`. Los registros antiguos en `En curso` siguen siendo legibles y se pueden completar.
- **Solicitud:** `pending` → `accepted` o `rejected`. El pasajero puede pasarla a `cancelled` y volver a pedir lugar.
- **Lo que ve el pasajero:** "Aceptado" = `myRequest.status === "accepted"` con el viaje `Disponible`. El conductor puede definir el punto de encuentro al publicar o después de aceptar pasajeros.

## Estacionamiento

| Ruta | Body | Respuesta |
| --- | --- | --- |
| `GET /parking/zones` | | Lista de zonas con `occupied`, `available`, `occupancyPercentage`, `source: "registrado"`, `capacityEstimated` y `updatedAt`. Conserva `sensorOnline` y los metadatos anteriores |
| `GET /parking/session` | | `{ session }` activa o `null` |
| `POST /parking/entry` | `{ zoneId }` | `{ session }`; suma un ocupado y crea la sesión atómicamente. 409 si hay una activa, no hay capacidad o la zona aún no está configurada |
| `POST /parking/exit` | | `{ session, exitedAt, minutes }`; 409 si no hay activa |
| `GET /parking/presence` | | `{ byWeekday: { 0-6: number[] }, max }`: cuántos alumnos tienen clase en cada bloque de 10 min de 6:00 a 21:00 (llegan 20 min antes, se van 10 min después). Solo conteos de todos los horarios, nunca horarios individuales |
| `POST /parking/sensor-events` | `{ zoneId, sensorType: "entrada" \| "salida" }` | Lo que manda un contador infrarrojo (hoy, el simulador): `sensorCount` ±1 entre 0 y `capacity`, guarda la lectura en `recentEvents` (últimas 10). 409 si los sensores de la zona están apagados |
| `POST /parking/zones/{zoneId}/sensor` | `{ online: boolean }` | Prende o apaga los sensores de una zona (simulador) |
| `POST /parking/demo/reset` | | Restablece solo los campos del simulador. Conserva `registeredOccupied`, capacidades y sesiones reales |

El simulador muestra `sensorCount` o `manualCount`, identificado como "Simulado". Parking muestra exclusivamente `registeredOccupied`, identificado como "Registrado". Las proyecciones conservan `/parking/presence` y la fórmula de `frontend/lib/projections.ts`.

Las rutas existentes conservan respuesta HTTP 200 y errores `{ message }`. La sesión incluye
`userId`, `zoneId`, `zoneName`, `enteredAt`, `sessionId` y `occupancyCounted: true`.
La salida conserva `{ session, exitedAt, minutes }`, donde `session` es la sesión cerrada.
El usuario siempre se obtiene del token; el body no puede registrar movimientos de otro alumno.

La ocupación real de registros se guarda en `registeredOccupied` en la tabla existente
`aventon-parking-zones`, separada de `currentCount`/lecturas físicas. No se suman ambos conteos.
La salida y `DELETE /me` descuentan únicamente sesiones con `occupancyCounted: true`.
Las sesiones antiguas se pueden cerrar, pero no descuentan un auto que nunca fue sumado por este flujo.
La entrada verifica que exista el perfil y que no tenga `deletingAt`; `DELETE /me` marca
el perfil antes de cerrar su sesión, evitando nuevas entradas durante la eliminación.
Las zonas sin inicializar devuelven `occupied`, `available` y `occupancyPercentage` en `null`;
no se interpretan como vacías. Ejecutar la sincronización documentada en `backend/README.md`.

Las diez zonas y capacidades aproximadas se comparten mediante
`backend/src/lib/parking-catalog.json`. La sincronización conserva contadores, sesiones,
lecturas de sensores y zonas antiguas. El catálogo no convierte capacidades en cifras oficiales.
El frontend consulta zonas y sesión cada cinco segundos y después de cada operación, incluso ante 409.
Los datos no se sustituyen por demostraciones locales cuando falla la API.
El conteo representa entradas registradas, no vehículos sin registrar. Los pronósticos existentes
siguen siendo estimados y no modifican el conteo almacenado.

## Perfil y horario

| Ruta | Body | Respuesta |
| --- | --- | --- |
| `GET /me` | | `{ userId, email, name, colonia, phone, photoUrl, activeMode, privacyAcceptedAt, createdAt }` |
| `PUT /me` | `{ name, colonia, phone, photoUrl, activeMode, privacyAcceptedAt }` | Reemplaza el perfil completo. El email sale del token. `phone` es un celular de 10 dígitos (acepta `+52`, espacios y guiones; se guarda solo con los 10 dígitos) y solo lo ven otros alumnos con un viaje aceptado contigo (ver Privacidad). `photoUrl` es una imagen pequeña (data URL de hasta 200 KB) |
| `DELETE /me` | | Borra la cuenta y todos sus datos |
| `GET /me/schedule` | | Clases del alumno |
| `PUT /me/schedule/{slotId}` | `{ day: 1-7 (lunes-domingo), start: "HH:MM", end: "HH:MM", subject?, building?, room? }` | La clase guardada |
| `DELETE /me/schedule/{slotId}` | | |
