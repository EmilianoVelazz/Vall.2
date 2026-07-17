import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AppLoading from './AppLoading.jsx';

export default function ProtectedRoute({ children }) {
  const { isAuthed, checking } = useAuth();
  if (checking) return <AppLoading label="Verificando sesión…" />;
  if (!isAuthed) return <Navigate to="/" replace />;
  return children;
}
