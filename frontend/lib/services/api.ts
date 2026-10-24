// Calls the Aventón Mayab API with the student's Cognito token.
// Example: const trips = await api<Trip[]>("/trips?colonia=Montebello");
//          await api("/trips", { method: "POST", body: { colonia, destination, departureTime, seatsTotal, meetingPoint? } });
import { authService } from "./authService";
import { ServiceError, type ServiceErrorCode } from "./errors";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

const ERROR_CODES: Record<number, ServiceErrorCode> = {
  400: "INVALID_INPUT",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
};

export async function api<T = unknown>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const token = await authService.getToken();
  const hasBody = options.body !== undefined;
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    throw new ServiceError("FORBIDDEN", "Tu sesión expiró, vuelve a iniciar sesión");
  }
  if (res.status === 429) {
    throw new ServiceError("CONFLICT", "Demasiadas solicitudes, intenta en un momento");
  }
  const data = await res.json().catch(() => null);
  // The backend's error messages are already in Spanish and ready to show.
  if (!res.ok) {
    throw new ServiceError(ERROR_CODES[res.status] ?? "CONFLICT", data?.message ?? "Error de conexión");
  }
  return data as T;
}
