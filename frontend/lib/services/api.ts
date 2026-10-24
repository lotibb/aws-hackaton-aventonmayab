// Calls the Aventón Mayab API with the student's Cognito token.
// Example: const trips = await api<Trip[]>("/trips?colonia=Montebello");
//          await api("/trips", { method: "POST", body: { colonia, departureTime, seatsTotal, meetingPoint } });
import { authService } from "./authService";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

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
  if (res.status === 401) throw new Error("Tu sesión expiró, vuelve a iniciar sesión");
  if (res.status === 429) throw new Error("Demasiadas solicitudes, intenta en un momento");
  const data = await res.json().catch(() => null);
  // The backend's error messages are already in Spanish and ready to show.
  if (!res.ok) throw new Error(data?.message ?? "Error de conexión");
  return data as T;
}
