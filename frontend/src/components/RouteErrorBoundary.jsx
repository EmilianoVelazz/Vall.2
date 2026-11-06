import { Component } from 'react';

// Los errores de render y chunks que ya caducaron tras un despliegue deben
// ofrecer recuperación en lugar de desmontar toda la aplicación.
export default class RouteErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('No se pudo cargar la sección:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#111827', color: '#EDEDED', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 26, lineHeight: 1.3 }}>No pudimos cargar esta sección.</h1>
        <p style={{ marginTop: 16, color: '#9CA3AF', lineHeight: 1.7 }}>Comprueba tu conexión y recarga la página para volver a intentarlo.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 24, padding: '14px 20px', borderRadius: 8, border: '1px solid #EDEDED', background: '#EDEDED', color: '#111827', cursor: 'pointer', font: 'inherit' }}>Recargar página</button>
      </div>
    </main>;
  }
}
