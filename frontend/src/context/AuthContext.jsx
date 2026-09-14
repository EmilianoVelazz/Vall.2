import { createContext, useContext, useState, useCallback } from 'react';
import { useEffect } from 'react';
import { apiGet } from '../api/client.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('vn_auth'));
  const [user, setUser] = useState(() => sessionStorage.getItem('vn_user'));
  const [sessionChecked, setSessionChecked] = useState(false);

  const login = useCallback((email) => {
    // Es solo una marca para el router: la sesión real vive en la cookie
    // httpOnly y el servidor la verifica en cada petición protegida.
    const marker = '1';
    sessionStorage.setItem('vn_auth', marker);
    sessionStorage.setItem('vn_user', email);
    setToken(marker);
    setUser(email);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('vn_auth');
    sessionStorage.removeItem('vn_user');
    setToken(null);
    setUser(null);
  }, []);

  // sessionStorage solo sirve para que React recuerde el estado visual. La
  // autoridad real es la cookie httpOnly que valida el backend. Sin esta
  // comprobación, una pestaña que conservaba el marcador tras expirar la cookie
  // dejaba entrar al chat y este terminaba mostrando “No autenticado”.
  useEffect(() => {
    let active = true;
    apiGet('/api/verify-token')
      .then(({ ok, data }) => {
        if (!active) return;
        if (ok && data?.success) {
          const marker = '1';
          sessionStorage.setItem('vn_auth', marker);
          sessionStorage.setItem('vn_user', data.email || '');
          setToken(marker);
          setUser(data.email || '');
        } else {
          sessionStorage.removeItem('vn_auth');
          sessionStorage.removeItem('vn_user');
          setToken(null);
          setUser(null);
        }
      })
      .catch(() => {
        if (!active) return;
        sessionStorage.removeItem('vn_auth');
        sessionStorage.removeItem('vn_user');
        setToken(null);
        setUser(null);
      })
      .finally(() => { if (active) setSessionChecked(true); });
    return () => { active = false; };
  }, []);

  return (
    <AuthCtx.Provider value={{ token, user, login, logout, isAuthed: !!token, sessionChecked }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
