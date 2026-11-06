import { useEffect, useRef, useState } from 'react';
import { normalizePreferences } from './executiveReportPreferences.js';
import { createReportPreferenceStore } from './reportPreferenceStore.js';

export function useReportPreferences() {
  const store = useRef(null);
  const [state, setState] = useState(() => ({ preferences: normalizePreferences(), ready: false, status: 'loading', email: '' }));
  useEffect(() => {
    let storage;
    try { storage = window.sessionStorage; } catch { /* Editing still works without browser storage. */ }
    const controller = createReportPreferenceStore({ storage, notify: setState });
    store.current = controller;
    controller.load();
    const reconnect = () => controller.reconnect();
    window.addEventListener('online', reconnect);
    const visible = () => { if (document.visibilityState === 'visible') reconnect(); };
    window.addEventListener('focus', reconnect);
    document.addEventListener('visibilitychange', visible);
    return () => { controller.dispose(); window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return { ...state, setPreferences: updater => store.current?.update(updater), retryPreferences: () => store.current?.retry() };
}
