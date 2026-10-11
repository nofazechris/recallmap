/** Thin fetch wrapper: JSON in, JSON out, errors carry the server's user-safe message and code. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body?: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network', 'You appear to be offline. Check your connection and try again.');
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = (json.error ?? {}) as { code?: string; message?: string };
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? 'Something went wrong. Please try again.', json);
  }
  return json as T;
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
