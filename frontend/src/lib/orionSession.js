// A chat instance keeps its originating account even if the shared cookie changes.
export function safeChatStorage(storage, onUnavailable = () => {}) {
  const memory = new Map();
  let warned = false;
  const unavailable = () => { if (!warned) { warned = true; onUnavailable(); } };
  return {
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try { return storage()?.getItem(key) ?? null; } catch { unavailable(); return null; }
    },
    setItem(key, value) {
      memory.set(key, String(value));
      try { const target=storage(); if (!target) unavailable(); else target.setItem(key, String(value)); } catch { unavailable(); }
    },
    removeItem(key) {
      memory.set(key, null);
      try { storage()?.removeItem(key); } catch { unavailable(); }
    },
  };
}

export function createOrionSession(owner, {fetcher = fetch, onInvalid = () => {}, onStorageUnavailable = () => {}, local = () => window.localStorage, session = () => window.sessionStorage} = {}) {
  owner=String(owner || '').trim().toLowerCase();
  if (!owner) throw Error('Se requiere una cuenta para abrir ORION.');
  const controller=new AbortController();
  const invalidate = () => {
    if (controller.signal.aborted) return;
    controller.abort(Object.assign(Error('La sesión cambió. Verifica tu cuenta antes de continuar.'), {code:'ACCOUNT_CHANGED'}));
    onInvalid();
  };
  return {
    owner,
    signal:controller.signal,
    storage:safeChatStorage(local,onStorageUnavailable),
    sessionStorage:safeChatStorage(session,onStorageUnavailable),
    get current() { return !controller.signal.aborted; },
    close() { controller.abort(); },
    async request(url, options = {}) {
      controller.signal.throwIfAborted();
      if (typeof url!=='string' || !url.startsWith('/api/')) throw Error('La solicitud de ORION debe usar la API del sitio.');
      const headers=new Headers(options.headers); headers.set('X-VALL-Account',owner);
      const signal=options.signal ? AbortSignal.any([controller.signal,options.signal]) : controller.signal;
      const response=await fetcher(url,{...options,headers,credentials:'include',signal});
      controller.signal.throwIfAborted();
      const actual=response.headers.get('X-VALL-Account');
      if (response.status===401 || actual && actual.trim().toLowerCase()!==owner) { invalidate(); controller.signal.throwIfAborted(); }
      return response;
    },
  };
}
