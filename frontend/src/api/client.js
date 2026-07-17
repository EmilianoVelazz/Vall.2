// Cliente API de VALLNews.
// En dev, Vite hace proxy de /api → http://localhost:3001 (backend Express).
// En prod, frontend y backend comparten origen, así que /api relativo funciona.
export const API_BASE = '';

async function request(path, init, opts) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 12000);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiPost(path, body, opts = {}) {
  return request(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(body),
  }, opts);
}

export async function apiGet(path, opts = {}) {
  return request(path, {
    credentials: 'include',
    headers: { ...(opts.headers || {}) },
  }, opts);
}
