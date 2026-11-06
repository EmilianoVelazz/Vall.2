// Cliente API de VALLNews.
// En dev, Vite hace proxy de /api → el backend Express (:3101 por defecto).
// En prod, frontend y backend comparten origen, así que /api relativo funciona.
export const API_BASE = '';
const DEFAULT_TIMEOUT_MS = 30_000;

async function request(path, method, body, opts) {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS, headers: suppliedHeaders, ...init } = opts;
  const headers = new Headers(suppliedHeaders);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (method === 'POST' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(new DOMException('El servidor tardó demasiado en responder.', 'TimeoutError')), timeoutMs)
    : null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init, method, credentials: 'include', headers, signal: controller.signal,
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return { ok: res.ok, status: res.status, data: {} };
    try {
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch {
      if (controller.signal.aborted) throw controller.signal.reason;
      // Una página HTML de error con HTTP 200 no es una respuesta API válida.
      return { ok: false, status: res.status, data: { success: false, error: 'El servidor devolvió una respuesta inválida.' } };
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function apiPost(path, body, opts = {}) {
  return request(path, 'POST', body, opts);
}

export function apiGet(path, opts = {}) {
  return request(path, 'GET', undefined, opts);
}
