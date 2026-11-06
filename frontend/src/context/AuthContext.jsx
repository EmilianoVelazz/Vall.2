import { createContext, useContext, useState, useEffect, useSyncExternalStore } from 'react';
import { createAuthSession } from '../lib/authSession.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session] = useState(() => createAuthSession());
  const { token, user, sessionChecked } = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    const controller = new AbortController();
    session.check(controller.signal);
    return () => controller.abort();
  }, [session]);

  return (
    <AuthCtx.Provider value={{ token, user, login: session.login, logout: session.logout, isAuthed: !!token, sessionChecked }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

//if constnat()=0;
//select the folder