import { createContext, useContext, useState, useEffect, useSyncExternalStore } from 'react';
import { createAuthSession } from '../lib/authSession.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session] = useState(() => createAuthSession());
  const { token, user, sessionChecked } = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    let controller;
    const check=()=>{controller?.abort();controller=new AbortController();void session.check(controller.signal);};
    const visible=()=>{if(document.visibilityState==='visible')check();};
    check();
    window.addEventListener('focus',check);
    window.addEventListener('vn:session-refresh',check);
    document.addEventListener('visibilitychange',visible);
    return () => {controller?.abort();window.removeEventListener('focus',check);window.removeEventListener('vn:session-refresh',check);document.removeEventListener('visibilitychange',visible);};
  }, [session]);

  return (
    <AuthCtx.Provider value={{ token, user, login: session.login, logout: session.logout, isAuthed: !!token, sessionChecked }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
