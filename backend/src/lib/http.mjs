// Helpers for API Gateway HTTP API (payload v2) handlers.

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Identity always comes from the verified Cognito token, never from the body.
export function caller(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new HttpError(401, "No autenticado");
  return {
    userId: claims.sub,
    email: claims.email,
    username: claims["cognito:username"] ?? claims.sub,
  };
}

export function readBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString()
      : event.body;
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
}

export function isConditionFailed(err) {
  return err.name === "ConditionalCheckFailedException";
}

// routes: { "POST /trips": fn, ... } keyed by the HTTP API routeKey.
// Every route requires a logged-in student.
export function router(routes) {
  return async (event) => {
    try {
      caller(event);
      const route = routes[event.routeKey];
      if (!route) throw new HttpError(404, "Ruta no encontrada");
      return reply(200, await route(event));
    } catch (err) {
      if (err instanceof HttpError) {
        return reply(err.statusCode, { message: err.message });
      }
      console.error(err);
      return reply(500, { message: "Error interno" });
    }
  };
}

function reply(statusCode, data) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data ?? null),
  };
}
