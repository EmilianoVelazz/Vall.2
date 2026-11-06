// Diagnóstico local con las mismas credenciales y API. Las entregas automáticas
// quedan detenidas en este proceso; enviar ahora requiere la acción del usuario.
process.env.VALL_REPORT_EMAIL_AUTOMATION_ENABLED = 'false';
console.log('[mail-check] Entregas automáticas desactivadas en esta sesión de diagnóstico.');
await import('./dev.mjs');
