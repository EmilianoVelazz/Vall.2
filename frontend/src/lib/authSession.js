import { apiGet } from '../api/client.js';

function browserStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

// La cookie del servidor es la autoridad. El almacenamiento es opcional y una
// comprobación anterior no puede sobrescribir un login o logout más reciente.
export function createAuthSession({ verify = apiGet, storage = browserStorage() } = {}) {
  let state = { token: null, user: null, sessionChecked: false };
  let revision = 0;
  const listeners = new Set();
  const publish = next => {
    state = next;
    listeners.forEach(listener => listener());
  };
  const persist = email => {
    try {
      if (email !== null) {
        storage?.setItem('vn_auth', '1');
        storage?.setItem('vn_user', email);
      } else {
        storage?.removeItem('vn_auth');
        storage?.removeItem('vn_user');
      }
    } catch { /* La sesión sigue funcionando con almacenamiento bloqueado. */ }
  };
  const apply = email => {
    persist(email);
    publish({ token: email !== null ? '1' : null, user: email, sessionChecked: true });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    login(email) { revision += 1; apply(email || ''); },
    logout() { revision += 1; apply(null); },
    async check(signal) {
      const current = ++revision;
      try {
        const { ok, data } = await verify('/api/verify-token', { signal, cache: 'no-store' });
        if (current !== revision || signal?.aborted) return;
        apply(ok && data?.success === true ? data.email || '' : null);
      } catch {
        if (current !== revision || signal?.aborted) return;
        apply(null);
      }
    },
  };
}







//continua con loq estabas haciendo de favor para que podanis gacer un mejor informe de favor y gracias
