import { API_BASE, API_TIMEOUT_MS } from "../config";

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export class ApiError extends Error {}

export async function apiPost<T>(
  path: string,
  body: unknown,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<T> {
  const combined = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (cause) {
    throw new ApiError(
      `Peira engine unreachable at ${API_BASE} — is the backend running?`,
      { cause },
    );
  }
  const envelope = (await response.json()) as Envelope<T>;
  if (!response.ok || !envelope.success || envelope.data === null) {
    throw new ApiError(envelope.error ?? `engine error (HTTP ${response.status})`);
  }
  return envelope.data;
}
