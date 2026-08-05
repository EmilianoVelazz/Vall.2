import { createContext, useContext, useState, useCallback } from 'react';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('vn_auth'));
  const [user, setUser] = useState(() => sessionStorage.getItem('vn_user'));

  const login = useCallback((tok, email) => {
    sessionStorage.setItem('vn_auth', tok);
    sessionStorage.setItem('vn_user', email);
    setToken(tok);
    setUser(email);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('vn_auth');
    sessionStorage.removeItem('vn_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ token, user, login, logout, isAuthed: !!token }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
