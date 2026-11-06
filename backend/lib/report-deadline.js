'use strict';

// El límite incluye la lectura del cuerpo y proveedores que ignoran abort.
async function reportDeadline(operation, timeoutMs = 14000) {
    const controller = new AbortController();
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(() => operation(controller.signal)),
            new Promise((resolve, reject) => {
                timer = setTimeout(() => {
                    const error = Object.assign(Error('La fuente del informe agotó su plazo.'), {code:'REPORT_SOURCE_TIMEOUT'});
                    controller.abort(error); reject(error);
                }, timeoutMs);
            }),
        ]);
    } finally { clearTimeout(timer); }
}

module.exports = {reportDeadline};
