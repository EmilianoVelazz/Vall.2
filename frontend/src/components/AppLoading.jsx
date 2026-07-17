import './AppLoading.css';

export default function AppLoading({ label = 'Preparando tu experiencia…' }) {
  return (
    <div className="vn-app-loading" role="status" aria-live="polite">
      <img src="/Logotipos/logo2.png" alt="" aria-hidden="true" />
      <div className="vn-app-loading-bar"><span /></div>
      <p>{label}</p>
    </div>
  );
}
