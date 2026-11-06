// El plazo abarca la conexión y la lectura del cuerpo. El límite también se
// cumple si una operación deja de responder sin rechazar al recibir abort.
export async function withReportRequest(operation, { signal, timeoutMs = 20000, timeoutMessage = 'La consulta tardó demasiado. Puedes volver a intentarlo.' } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(Object.assign(new Error(timeoutMessage), { name: 'TimeoutError' })), timeoutMs);
  let onAbort;
  try {
    const aborted = new Promise((resolve, reject) => {
      onAbort = () => reject(controller.signal.reason || new DOMException('Cancelado', 'AbortError'));
      if (controller.signal.aborted) onAbort();
      else controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([aborted, Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

export function reportJsonRequest(url, options = {}, { fetcher = fetch, errorMessage = 'No fue posible cargar el informe.', expectedOwner, ...deadline } = {}) {
  return withReportRequest(async signal => {
    const response = await fetcher(url, { credentials: 'include', cache: 'no-store', ...options, signal });
    const payload = await response.json().catch(error => {
      signal.throwIfAborted();
      if(response.status===429) throw Object.assign(new Error('Hay demasiadas solicitudes. Espera unos minutos y vuelve a intentarlo.'),{cause:error,status:429,code:'REPORT_RATE_LIMIT'});
      throw new Error(response.status === 401 ? 'Tu sesión venció. Inicia sesión de nuevo.' : errorMessage, { cause: error });
    });
    if(expectedOwner && payload?.accountEmail && String(payload.accountEmail).toLowerCase()!==expectedOwner.toLowerCase()) throw Object.assign(new Error('La sesión cambió de cuenta. Recarga la cuenta para continuar.'),{status:409,code:'REPORT_ACCOUNT_CHANGED'});
    if (!response.ok || !payload?.success) throw Object.assign(new Error(response.status === 401 ? 'Tu sesión venció. Inicia sesión de nuevo.' : payload?.error || errorMessage), { status: response.status, code: payload?.code });
    return payload;
  }, { signal: options.signal, ...deadline });
}

export async function verifyReportOwner(owner,signal) {
  const session=await reportJsonRequest('/api/verify-token',{signal},{timeoutMs:10000,errorMessage:'No pudimos comprobar la cuenta antes de entregar el archivo.'});
  if(!owner || String(session.email || '').trim().toLowerCase()!==owner.toLowerCase()) throw Object.assign(Error('La sesión cambió de cuenta. Recarga la cuenta para continuar.'),{status:409,code:'REPORT_ACCOUNT_CHANGED'});
}
