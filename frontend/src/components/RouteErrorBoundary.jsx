import { Component } from 'react';

function isModuleLoadError(error) {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk .+ failed|Unable to preload CSS/i.test(String(error?.message || ''));
}

// Los errores de render y chunks que ya caducaron tras un despliegue deben
// ofrecer recuperación en lugar de desmontar toda la aplicación.
export default class RouteErrorBoundary extends Component {
  state = { failed: false, moduleLoad: false };
  static getDerivedStateFromError(error) { return { failed: true, moduleLoad: isModuleLoadError(error) }; }
  componentDidCatch(error) {
    console.error('No se pudo cargar la sección:', error);
    if (!isModuleLoadError(error) || window.navigator.onLine === false) return;
    // React.lazy conserva el rechazo del módulo. Una recarga recupera el HTML
    // actual; el marcador limita los reintentos incluso si el archivo sigue caído.
    try {
      const key = 'vn:route-recovery:' + window.location.pathname;
      const now = Date.now(), previous = Number(window.sessionStorage.getItem(key));
      if (previous > 0 && now - previous < 60_000) return;
      window.sessionStorage.setItem(key, String(now));
      window.location.reload();
    } catch { /* Sin almacenamiento no se recarga automáticamente: evita bucles. */ }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#111827', color: '#EDEDED', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 26, lineHeight: 1.3 }}>No pudimos cargar esta sección.</h1>
        <p style={{ marginTop: 16, color: '#9CA3AF', lineHeight: 1.7 }}>{this.state.moduleLoad
          ? 'No se pudo completar la carga de esta sección. Recarga la página para volver a intentarlo.'
          : 'Ocurrió un error al mostrar esta sección. Recarga la página para volver a intentarlo.'}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 24, padding: '14px 20px', borderRadius: 8, border: '1px solid #EDEDED', background: '#EDEDED', color: '#111827', cursor: 'pointer', font: 'inherit' }}>Recargar página</button>
      </div>
    </main>;
  }
}
