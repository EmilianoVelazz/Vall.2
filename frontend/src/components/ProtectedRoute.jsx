import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { isAuthed, sessionChecked } = useAuth();
  // No montamos componentes protegidos —incluido el chat— hasta comprobar la
  // cookie real. Evita solicitudes 401 de una marca visual obsoleta.
  if (!sessionChecked) return null;
  if (!isAuthed) return <Navigate to="/" replace />;
  return children;
}
