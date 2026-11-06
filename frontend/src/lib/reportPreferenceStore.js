import { normalizePreferences } from './executiveReportPreferences.js';

// A draft belongs to the verified account and lasts only for this browser session.
// The server remains the source of truth for settings synchronized across devices.
export function createReportPreferenceStore({ request = fetch, storage, notify = () => {}, delay = 500, retryDelays = [1000, 3000] } = {}) {
  let state = { preferences: normalizePreferences(), ready: false, status: 'loading', email: '', errorMessage: '' };
  let saved = null, dirty = false, timer, revision = 0, disposed = false, writing = false, pendingSave, queue = Promise.resolve();
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; notify(state); } };
  const key = () => state.email ? `vallnews:report-edition:v1:${encodeURIComponent(state.email)}` : null;
  const persist = pending => {
    try { if (key()) storage?.setItem(key(), JSON.stringify({ preferences: state.preferences, pending })); } catch { /* Storage can be unavailable in private browsing. */ }
  };
  const api = async (path, options = {}) => {
    const response = await request(path, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(options.method === 'POST' ? 30000 : 12000), ...options });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.success === false) {
      const retryAfter = Number(response.headers?.get('Retry-After'));
      throw Object.assign(new Error('Preferencias no disponibles'), { status: response.status, retryAfter: Number.isFinite(retryAfter) ? Math.min(60000, Math.max(0, retryAfter * 1000)) : 0 });
    }
    return payload;
  };
  const save = () => {
    clearTimeout(timer);
    if (!state.email || !state.ready) return;
    const version = revision, preferences = state.preferences, serialized = JSON.stringify(preferences);
    if (pendingSave?.version === version) return pendingSave.promise;
    emit({ status: 'saving', errorMessage: '' });
    const operation = queue.catch(() => {}).then(async () => {
      if (disposed || version !== revision) return;
      writing = true;
      try {
        for (let attempt = 0; ; attempt++) {
          if (disposed || version !== revision) return;
          try {
            const payload = await api('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: { executiveReports: preferences } }) });
            if (payload.success !== true) throw new Error('Guardado no confirmado');
            break;
          } catch (error) {
            if (disposed || version !== revision) return;
            const transient = !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
            // A lost response does not imply a lost write. Read back the same
            // account's exact settings before attempting another write.
            if (transient && error.status !== 429) {
              emit({ status: 'verifying' });
              try {
                const recovered = await api('/api/profile');
                if (String(recovered.profile?.email || '').toLowerCase() === state.email && JSON.stringify(normalizePreferences(recovered.profile?.preferences?.executiveReports)) === serialized) break;
              } catch (readError) { if (readError.status === 401) throw readError; }
            }
            if (!transient || attempt >= retryDelays.length) throw error;
            emit({ status: 'retrying' });
            await new Promise(resolve => setTimeout(resolve, Math.max(retryDelays[attempt], error.retryAfter || 0)));
          }
        }
        saved = serialized;
        if (disposed || version !== revision) return;
        dirty = false; persist(false); emit({ status: 'saved' });
      } catch (error) {
        if (disposed || version !== revision) return;
        const messages = { 403: 'No se pudo guardar desde este dominio. Abre la plataforma desde su enlace principal.', 404: 'Tu perfil no está disponible. Inicia sesión nuevamente para sincronizar.', 429: 'El servicio está recibiendo demasiadas solicitudes. Conservamos tu edición; puedes reintentar.' };
        emit(error.status === 401 ? { status: 'session-error', ready: false } : { status: 'save-error', errorMessage: messages[error.status] || 'No pudimos confirmar el guardado en tu cuenta. Conservamos tu edición; puedes reintentar.' });
      } finally { writing = false; }
    });
    queue = operation;
    pendingSave = { version, promise: operation };
    operation.finally(() => { if (pendingSave?.promise === operation) pendingSave = null; });
    return operation;
  };
  const load = async (attempt = 0) => {
    emit({ status: 'loading' });
    const version = revision;
    const [session, profile] = await Promise.allSettled([api('/api/verify-token'), api('/api/profile')]);
    if (disposed || version !== revision) return;
    if ([session, profile].some(result => result.status === 'rejected' && result.reason.status === 401)) {
      emit({ status: 'session-error', ready: false }); return;
    }
    const email = String(session.value?.email || profile.value?.profile?.email || '').trim().toLowerCase();
    if (profile.value?.profile?.email && email !== String(profile.value.profile.email).toLowerCase()) {
      emit({ status: 'session-error', ready: false }); return;
    }
    emit({ email });
    let draft;
    try { draft = key() ? JSON.parse(storage?.getItem(key()) || 'null') : null; } catch { /* Ignore an invalid draft. */ }
    const remote = profile.status === 'fulfilled' ? normalizePreferences(profile.value?.profile?.preferences?.executiveReports) : null;
    saved = remote ? JSON.stringify(remote) : null;
    const preferences = draft?.pending || !remote ? normalizePreferences(draft?.preferences || remote) : remote;
    dirty = Boolean(draft?.pending && JSON.stringify(preferences) !== saved);
    emit({ preferences, ready: true, status: remote ? 'idle' : 'load-error' });
    if (dirty && email) await save();
    else if (profile.status === 'rejected' && email && attempt < retryDelays.length) {
      const error = profile.reason;
      if (!error.status || error.status === 408 || error.status === 429 || error.status >= 500) {
        emit({ status: 'retrying' });
        await new Promise(resolve => setTimeout(resolve, Math.max(retryDelays[attempt], error.retryAfter || 0)));
        if (!disposed && version === revision) return load(attempt + 1);
      }
    }
  };
  return {
    getState: () => state,
    load,
    update(updater) {
      if (!state.ready) return;
      const preferences = normalizePreferences(typeof updater === 'function' ? updater(state.preferences) : updater);
      revision += 1; dirty = writing || JSON.stringify(preferences) !== saved;
      emit({ preferences, status: dirty ? 'saving' : 'saved' }); persist(dirty); clearTimeout(timer);
      if (dirty && state.email) timer = setTimeout(save, delay);
      else if (dirty) emit({ status: 'load-error' });
    },
    retry: () => dirty && state.email ? save() : load(),
    reconnect: () => { if (dirty && state.ready && state.email) return save(); },
    dispose: () => { disposed = true; revision += 1; clearTimeout(timer); },
  };
}
