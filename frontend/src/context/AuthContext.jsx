import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { apiGet, apiPost } from '../api/client.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    apiGet('/api/verify-token')
      .then(({ ok, data }) => {
        if (active) setUser(ok ? data.email : null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, []);

  const login = useCallback((email) => {
    setUser(email);
  }, []);

  const logout = useCallback(async () => {
    try { await apiPost('/api/logout', {}); } catch { /* cerrar estado local igualmente */ }
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, login, logout, isAuthed: !!user, checking }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
