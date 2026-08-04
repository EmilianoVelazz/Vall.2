// Punto de entrada serverless para Vercel.
//
// El package.json de la raíz declara "type": "commonjs", así que este archivo
// se parsea como CommonJS. La versión anterior usaba `import` con un comentario
// que afirmaba que la raíz era "type":"module": eso era cierto en el repo Valla
// original, pero no en este árbol. El desajuste hacía que Node fallara al
// cargar el módulo y Vercel devolviera FUNCTION_INVOCATION_FAILED en todas las
// rutas /api, incluida la de login.
//
// backend/server.js termina con `module.exports = app`, de modo que exportar
// directamente ese require entrega la app de Express que Vercel espera.
module.exports = require('../backend/server.js');
