# Revisión de seguridad local — 22 de octubre de 2026

## Alcance y tecnología

El repositorio de VALLNews no contiene fuentes PHP, `composer.json`, `php.ini` ni configuración de PHP-FPM. El servidor y las funciones de Vercel utilizan Node.js/Express; la interfaz usa React/Vite. El Dockerfile también ejecuta Node. No corresponde emitir un certificado de seguridad de PHP para este proyecto.

Se revisaron fuentes activas, configuración del servidor, dependencias raíz y frontend, copia pública de Mermaid y controles HTTP locales. No se realizó una prueba de penetración del alojamiento ni una auditoría de un servidor PHP externo. No se modificaron contraseñas, claves ni datos de usuarios.

## Alertas corregidas

La auditoría inicial de npm identificó cuatro paquetes afectados: dos de severidad alta en frontend y dos de severidad baja en el árbol raíz. No son cuatro explotaciones demostradas: Mermaid hereda una alerta de KaTeX y Vite agrupa varios avisos.

| Componente | Antes | Después | Corrección |
| --- | --- | --- | --- |
| Vite | 6.4.3 | 6.4.5 | Actualización de la rama 6 que corrige los avisos detectados, incluidos los del editor en Windows. |
| source-map-js | 1.2.1 | 1.2.2 | Validación corregida de offsets de mapas de código; dependencia de desarrollo. |
| Mermaid | 11.17.2 | 12.2.0 | Nueva versión compatible con las pruebas de diagramas de esta aplicación. |
| KaTeX transitivo | 0.16.47 | 0.18.10 | Versión posterior al parche 0.18.2. |

Los avisos de Vite afectan herramientas del servidor de desarrollo; no se afirma que se haya conseguido ejecutar comandos ni leer archivos en el despliegue. El aviso de KaTeX necesita además contaminación previa de prototipos o control de opciones; no se reprodujo esa condición en VALLNews.

Se sustituyó también `assets/js/vendor/mermaid.min.js`, que contenía una copia independiente y más antigua cargada por el navegador. La copia nueva es idéntica, byte por byte, al bundle oficial de Mermaid instalado; mantiene sus avisos de licencia. El bundle incluye KaTeX 0.18.11, también posterior al parche. SHA-256: `a8a6a6f805b074a8261a2825c86f99c8054acb3b35f50bb7e24a4f9f2c3c3b9f`.

`npm run sync:vendor:mermaid` actualiza esa copia. `npm run test:security` comprueba primero su igualdad con la versión instalada, evitando que una actualización futura del paquete deje inadvertidamente otra versión pública.

## Verificación

- Auditorías oficiales de npm posteriores: cero alertas conocidas en raíz, incluidas dependencias de desarrollo; cero en frontend.
- Pruebas HTTP: 39 comprobaciones correctas de autenticación, orígenes, límites, TLS, SSRF, adjuntos y errores sin detalles internos.
- Análisis privados: seis grupos correctos de aislamiento por cuenta, validación y límites de recursos.
- XSS: 20 payloads en renderizadores y 24 casos más dos controles en el renderizador activo de ORION.
- Navegador local con la nueva copia de Mermaid: cinco pruebas correctas, con flujo, secuencia, fórmula matemática, etiqueta HTML maliciosa y enlace `javascript:`. Los tres diagramas funcionales se generaron y los dos casos de entrada peligrosa no dejaron contenido ejecutable.
- Compilación completa correcta. Se mantiene el aviso de tamaño de algunos bundles; no es un resultado de vulnerabilidad.
- Doce lecturas locales de rutas de entorno, Git y fuentes privadas, incluidos intentos mediante `/@fs/` de Vite: sin contenido privado detectado; no se guardaron cuerpos de respuestas.
- Cuatro perfiles ficticios completaron las pruebas de acceso y aislamiento. La rama exacta del despliegue superó la validación de origen; los orígenes ajenos se rechazaron.
- Página de acceso, API directa y API a través de Vite respondieron HTTP 200 después del reinicio con las dependencias corregidas.

Evidencias: `output/auditoria-raiz-verificada-2026-10-22.json`, `output/auditoria-frontend-verificada-2026-10-22.json`, `output/auditoria-raiz-final-2026-10-22.json`, `output/auditoria-frontend-final-2026-10-22.json`, `output/seguridad-http-2026-10-22.log`, `output/seguridad-aislamiento-2026-10-22.log` y `output/build-seguridad-2026-10-22.log`.

## Límites y pendientes

Las correcciones de esta revisión están en la copia local. No se publicaron automáticamente en Vercel. `npm audit` consulta avisos conocidos del registro; cero alertas no demuestra ausencia de fallos desconocidos, secretos de formatos no reconocidos o errores de lógica.

Se conservan limitaciones documentadas del diseño de sesiones y de escalado: cerrar sesión borra la cookie, pero una copia previa de un JWT puede conservar vigencia hasta su caducidad; los límites de concurrencia y frecuencia son por proceso. La revocación central por sesión y los límites compartidos requieren trabajo específico. La revisión complementaria siguiente corrige el tratamiento de tokens antiguos sin versión.

## Revisión complementaria del código

Se volvió a comprobar el código después de los ajustes de informes. Las auditorías actuales del registro de npm reportan cero avisos conocidos en raíz y frontend, incluidas dependencias de desarrollo. No se cambiaron versiones en esta segunda revisión.

### Hallazgos corregidos y reproducidos

1. **Acceso de cuentas desactivadas con sesiones antiguas — prioridad alta.** `verifyToken` sólo consultaba el estado actual del perfil cuando el JWT incluía una versión numérica de credenciales. Una sesión antigua sin ese campo obtenía HTTP 200 tanto en verificación como en una operación protegida después de desactivar su cuenta. Ahora todos los usuarios ordinarios se validan contra su perfil activo; una sesión antigua equivale a la versión inicial cero. Un cambio posterior de contraseña invalida también esa sesión, y versiones inválidas se rechazan. La indisponibilidad del perfil devuelve 503 y no concede acceso. Las pruebas de cuatro perfiles ficticios siguen pasando.
2. **Consentimiento de entrenamiento desactualizado — prioridad media.** El chat confiaba en el consentimiento guardado al iniciar sesión. Se reprodujo una escritura simulada de entrenamiento después de desactivar esa opción en el perfil. Ahora se vuelve a consultar el perfil justo antes de guardar, después de generar la respuesta; sin confirmación actual de cuenta activa y consentimiento no se recopila esa conversación para entrenamiento. Se comprobó también un cambio de consentimiento durante la generación y la ausencia de acceso al perfil. El registro operativo de ORION sigue siendo independiente del entrenamiento, tal como está definido en la aplicación.
3. **Imágenes de exportación sin límite de expansión — prioridad media, requiere acceso autenticado.** El límite anterior de bytes comprimidos no limitaba dimensiones ni expansión PNG. La exportación ahora inspecciona PNG/JPEG, limita cada lado a 8192 píxeles, cada imagen a 8 millones de píxeles y el conjunto a 24 millones. Conserva el límite de ocho gráficas y 2,5 MB por imagen. Para PNG se validan estructura, profundidad, tipo, filtros y longitud real descomprimida con `maxOutputLength`; no basta con confiar en las dimensiones declaradas. Entradas inválidas reciben 400 y entradas excesivas 413 antes de traducir o construir el documento. Se comprobó una expansión excesiva con cabecera pequeña, imágenes truncadas, filtros inválidos y exportación HTTP de un PNG real válido. No se provocó una caída ni se ejecutó una prueba de agotamiento contra el servidor del usuario.

Los cambios están en `backend/routes/auth.js`, `backend/routes/chat.js`, `backend/lib/report-chart-images.js` y su integración en `backend/routes/export.js`. Las nuevas regresiones se incorporaron a `npm run test:security`. Se adaptaron dos fixtures antiguos para simular el perfil consultado y el programador de correos; no necesitan cuentas ni servicios reales.

### Comprobaciones de esta revisión

- `npm run test:security`: aprobado; incluye 39 comprobaciones HTTP, seis grupos de análisis privado, los casos XSS existentes y las nuevas pruebas de sesión e imágenes.
- `test-profile-access.cjs`, `test-auth-validation.cjs`, `test-report-input-abuse.cjs` y `test-report-session-binding.cjs`: aprobados con datos ficticios. La primera ejecución de los dos fixtures adaptados reveló sus supuestos anteriores; las repeticiones corregidas pasaron.
- Doce lecturas locales de rutas privadas: sin contenido privado detectado; los cuerpos de las respuestas no se guardaron.
- Escaneo por patrones de credenciales de 706 archivos de texto del código y documentación: cero coincidencias de los formatos buscados. Excluye archivos ignorados, binarios, vendors, cachés, salidas y archivos mayores a 2 MB; no demuestra ausencia de secretos en otros formatos o ubicaciones.
- Compilación aprobada y análisis estático de 540 archivos con cero errores y cero advertencias: resultados guardados en `output/security-build-20261022.log` y `output/security-eslint-20261022.json`.

Evidencia adicional: `output/security-audit-root-20261022.json`, `output/security-audit-frontend-20261022.json`, `output/security-tests-final-20261022.log`, `output/security-session-before-20261022.log`, `output/security-session-after-20261022.log`, `output/security-report-images-20261022.log`, `output/security-secret-patterns-20261022.json`, `output/security-extra-before-20261022.log` y `output/security-extra-after-20261022.log`.

### Pendiente confirmado

El diagnóstico adicional conserva **un resultado pendiente**, no una prueba aprobada: `/logout` elimina la cookie pero no revoca una copia previa del JWT en el servidor. Se reprodujo HTTP 200 al reutilizar esa copia tras cerrar sesión. Su ventana máxima ordinaria es de ocho horas. Resolverlo correctamente entre Vercel y Dokploy requiere un registro compartido de sesiones/revocaciones; una lista en memoria de un solo proceso no cubriría otras instancias. Tampoco se afirma revocación inmediata de sesiones administrativas al cambiar la contraseña del despliegue; el acceso administrativo conserva el comportamiento de continuidad documentado para interrupciones del servicio de perfiles.

El diagnóstico pasó de cuatro observaciones fallidas a una: las dos relativas a cuentas antiguas pertenecían al mismo fallo de validación; el consentimiento era un hallazgo distinto. El archivo `audit-security-extra.cjs` devuelve intencionalmente estado de fallo mientras persista el caso de cierre de sesión.

No se cambiaron cuentas, contraseñas, tablas ni permisos de producción. Los envíos programados locales se mantienen desactivados. Esta revisión no es una certificación de ausencia de vulnerabilidades ni una prueba de penetración de los alojamientos.

## Fuentes

- [Documentación oficial de npm audit](https://docs.npmjs.com/cli/commands/npm-audit/).
- [Aviso de KaTeX y parche 0.18.2](https://github.com/advisories/GHSA-238p-pmpm-9mq7).
- [Aviso del editor de Vite en Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
- [Aviso de source-map-js y parche 1.2.2](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- [OWASP: gestión del ciclo de vida de las sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [OWASP: validación y límites de archivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
- [Node.js: límite de salida de descompresión con maxOutputLength](https://nodejs.org/api/zlib.html#class-options).
