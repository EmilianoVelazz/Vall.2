'use strict';

// El timeout del SDK es por intento HTTP. Este límite cubre también la
// espera de fragmentos y funciona si un proveedor no atiende la cancelación.
function generationTimeout(milliseconds, fallback) {
    const value = Number(milliseconds);
    return Number.isFinite(value) && value > 0 ? Math.min(300000, Math.max(1, Math.floor(value))) : fallback;
}
function timeoutError(cancelled = false) {
    return Object.assign(new Error(cancelled ? 'Generación cancelada.' : 'La generación agotó su plazo total.'), {
        code: 'AI_TIMEOUT', status: 504, cancelled,
    });
}
function generationAttempt(parentSignal, milliseconds) {
    const controller = new AbortController();
    let stop;
    const stopped = new Promise((_, reject) => { stop = reject; });
    stopped.catch(() => {});
    const cancel = () => controller.abort(timeoutError(true));
    const onAbort = () => stop(controller.signal.reason || timeoutError());
    controller.signal.addEventListener('abort', onAbort, { once: true });
    parentSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(timeoutError()), milliseconds);
    if (parentSignal?.aborted) cancel();
    return {
        signal: controller.signal,
        wait(run) {
            return Promise.race([stopped, Promise.resolve().then(() => {
                if (controller.signal.aborted) throw controller.signal.reason;
                return run();
            })]);
        },
        dispose() {
            clearTimeout(timer);
            parentSignal?.removeEventListener('abort', cancel);
            controller.signal.removeEventListener('abort', onAbort);
        },
    };
}
module.exports = { generationTimeout, generationAttempt, timeoutError };