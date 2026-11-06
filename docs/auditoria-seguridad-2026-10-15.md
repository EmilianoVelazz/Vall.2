# Revisión de seguridad de VALLNews — 15 de octubre de 2026

Se corrigieron cuatro áreas de riesgo en la copia local: aislamiento de análisis, consumo de IA, validación de entradas y capacidad del archivo permanente. La revisión combina lectura de código, reproducciones con proveedores simulados, pruebas HTTP y navegador con cuentas de prueba, y auditoría de dependencias. Las prioridades siguientes son una valoración contextual, no una puntuación CVSS formal.

## Hallazgos corregidos

### SEC-01 · Alta · Caché compartida e incompleta en análisis privados

`POST /api/ml/insight-proteinas` usaba sólo los primeros 50 caracteres de un JSON como clave, omitía las alertas WOAH y compartía la respuesta entre cuentas. Se reprodujo con dos cuentas de prueba: la primera envió la referencia 111 y la segunda 222; hubo una sola generación y la segunda recibió la respuesta de la primera.

`GET /api/scenarios` usaba solamente TIIE y Fed redondeadas como clave, aunque el cálculo también dependía de USD/MXN, VIX y WTI. Además, sobrescribía la cabecera privada de autenticación con `Cache-Control: public, s-maxage=...`. Esa cabecera autorizaba almacenamiento compartido; no se probó una exposición efectiva en un CDN desplegado.

Corrección: ambas claves incorporan la identidad autenticada y todos los valores utilizados, mediante SHA-256 del contenido completo. Los escenarios conservan `private, no-store`. Las pruebas verifican cambios de precio, alertas, cuenta, caché válida de la misma cuenta y los cinco parámetros de escenarios.

Archivos: `backend/lib/private-analysis.js`, `backend/routes/external.js`, `backend/routes/finanzas.js`.

### SEC-02 · Alta · Consumo de IA sin límites específicos y caché sin cupo

Ambas rutas permitían generación bajo demanda sin el control de concurrencia y frecuencia aplicado al chat. La caché de escenarios era un Map sin límite de tamaño. El limitador general de la API no impone por sí solo un presupuesto adecuado para inferencias de pago.

Corrección: cupo compartido de 30 solicitudes por cuenta cada 15 minutos, máximo cuatro trabajos simultáneos entre estas dos rutas y uno por cuenta. Cada caché queda limitada a 64 entradas y 1 MiB. El SDK de escenarios recibe un plazo de 20 segundos. Se autentica antes del parser propio de proteínas; su JSON está limitado a 10 KiB.

Pruebas: exceso por cuenta devuelve 429, exceso global devuelve 503, cambiar de ruta no duplica la concurrencia y finalizar los trabajos libera el cupo. Las generaciones del ensayo son simuladas y no consumen cuota real.

### SEC-03 · Media · Valores manipulables tratados como datos verificados

El análisis de proteínas interpolaba texto libre del cuerpo en el contexto y en una respuesta HTML de respaldo, presentándolo como información verificada. Los escenarios aceptaban entradas parcialmente numéricas con `parseFloat`, infinitos y parámetros repetidos; también sustituían incorrectamente cero por valores predeterminados.

Corrección: se admiten sólo números finitos dentro de rangos definidos; se rechazan objetos, arrays, HTML, infinitos y texto agregado a una cifra. Se conserva el cero válido y se rechazan análisis sin datos. El contexto identifica los valores del cliente como referencias no comprobadas. Las alertas sólo aportan un conteo acotado, no texto incorporable al prompt. Estas comprobaciones no certifican que un número enviado por un cliente sea una cotización verdadera.

Las pruebas XSS ya existentes también pasaron. No se afirma que el texto de respaldo anterior constituyera un XSS explotable: la interfaz cuenta con saneadores independientes.

### SEC-04 · Media · Archivo permanente sin cupo agregado

El archivo de reportes limitaba el tamaño individual, pero permitía acumulación indefinida hasta ocupar el disco. Se conservaron la permanencia y las descargas repetidas, añadiendo admisión limitada para nuevas escrituras.

Límites predeterminados:

| Entorno | Por cuenta | Total de reportes | Cantidad |
| --- | --- | --- | --- |
| Local | 512 MiB | 2 GiB | 1.000 por cuenta / 5.000 en total |
| Serverless | 64 MiB | 256 MiB | 1.000 por cuenta / 5.000 en total |

Se reservan además 32 MiB libres para el resto del proyecto. `VALL_REPORT_MAX_OWNER_MB` y `VALL_REPORT_MAX_TOTAL_MB` permiten ajustar los límites en configuración. Una denegación responde 507 con `REPORT_STORAGE_FULL`: **no elimina ni vence documentos anteriores**. Las escrituras se serializan por carpeta dentro del proceso y se vuelven a contar los archivos almacenados, incluso tras reiniciar. Se validan también nombres y metadatos antes de escribir.

Pruebas: competencia entre dos instancias del almacén en el mismo proceso, cuotas por usuario y total, número de archivos, descarga del archivo anterior tras agotar el cupo y rechazo de metadatos inválidos.

## Verificación realizada

- `npm audit --json`: cero vulnerabilidades conocidas reportadas en el árbol raíz, incluidas dependencias de desarrollo.
- `npm audit --json` en `frontend/`: cero vulnerabilidades conocidas reportadas.
- Escaneo de patrones reconocibles de credenciales en 571 fuentes versionadas y archivos JavaScript del bundle: sin coincidencias. Es un detector acotado, no una garantía de ausencia de secretos. Sólo `.env.example` apareció entre los archivos de entorno versionados.
- `npm run test:all`: completado correctamente, incluida la nueva prueba `test-private-analysis-security.cjs`.
- `npm run test:reports:user`: completado correctamente; incluye 17 recorridos y 12 casos adicionales con navegador real y datos sintéticos.
- Persistencia de PDF: pruebas de cuota, antigüedad, reinicio, propiedad, integridad y descargas repetidas completadas.
- ESLint dirigido: sin errores ni avisos. `git diff --check`: sin errores de espacios.
- `npm run build`: completado. El build conserva avisos de tamaño de chunks y referencias a estáticos que se resuelven en ejecución; no son resultados de un escáner de vulnerabilidades.

La regresión inicial encontró además una prueba de noticias con fecha fija del 1 de octubre dentro de una consulta relativa de siete días. Su dato de prueba pasó a usar la fecha de ejecución, manteniendo intacto el filtro temporal de producción y la comprobación de que la fecha de indexación no se convierta en fecha de publicación.

Resultados de auditoría y registro de la regresión: `output/auditoria-seguridad-2026-10-15/`.

## Límites y recomendaciones de despliegue

- Los limitadores, cachés y exclusión de escrituras son locales al proceso. Antes de escalar a varias instancias, coordinar límites y cuotas con un almacén compartido; un volumen usado por varios procesos necesita bloqueo o transacciones entre procesos.
- El cierre de sesión elimina la cookie, pero un JWT previamente copiado conserva su vigencia de hasta ocho horas. La revocación centralizada de sesiones y la invalidación tras cambios de credenciales son mejoras pendientes.
- Configurar límites de gasto y alertas en los proveedores de IA. El control de concurrencia de estas rutas no sustituye un presupuesto agregado de toda la cuenta del proveedor.
- En los registros del servidor previo ya aparecían fallos de perfiles de Supabase (`JWT issued at future` y resolución DNS). Son una incidencia de configuración/disponibilidad remota que requiere diagnóstico independiente; el HTTP 200 de `/api/health` no verifica todos los proveedores.
- La revisión local no equivale a una prueba de penetración de la infraestructura de producción ni acredita ausencia de todas las vulnerabilidades.

Los controles de consumo responden a la categoría [OWASP API4: consumo de recursos sin límites adecuados](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/). El aislamiento de caché se relaciona con [CWE-524: información sensible en cachés](https://cwe.mitre.org/data/definitions/524.html).
