# Revisión de código y compatibilidad — 14 de octubre de 2026

El proyecto funciona con la aplicación React actual y no necesita recuperar las pantallas HTML ni el editor anterior. La revisión encontró un módulo abandonado y dos fallos en el adaptador de contraseñas antiguas; se corrigieron y las comprobaciones descritas abajo pasaron.

## Cambios realizados

- **Editor retirado:** eliminado `frontend/src/lib/reportEditorPresets.js`. El grafo desde `main.jsx`, incluidos imports dinámicos, confirmó que ninguna pantalla lo consumía. Sus opciones pertenecían al editor que ya se había sustituido. Se añadió al registro de archivos retirados para impedir su reintroducción accidental.
- **Credenciales modernas:** el login podía pasar `VALL_AUTH_PASSWORD` al migrador antiguo, que escribía únicamente `USER_PASSWORD`. Ahora ese migrador solo opera sobre la credencial antigua que sigue siendo la configuración activa.
- **Cambio concurrente de contraseña:** el hash se calcula de forma asíncrona. Ahora se comprueba otra vez la configuración antes de escribir, de modo que una migración pendiente no revierte una contraseña cambiada por el usuario ni escribe después de activar la configuración moderna.
- **Prevención en el build:** la compilación ejecuta la auditoría de referencias antes de generar la distribución. Rechaza archivos retirados, módulos sin consumidores e imports o assets literales inexistentes. `espree` se declaró como dependencia directa, con la versión ya instalada, para que esa auditoría no dependa indirectamente de ESLint y esté disponible también al instalar sin dependencias de desarrollo.
- **Regresión:** `scripts/test-auth-legacy-migration.cjs` prueba acceso antiguo y moderno, hashes existentes, cambio de contraseña durante una migración y cambio de configuración durante el cálculo. Está integrado en `test:resilience`. Usa un archivo `.env` en memoria y perfiles ficticios; no modifica credenciales reales.

## Compatibilidad que todavía está activa

| Pieza | Consumidores comprobados | Decisión |
| --- | --- | --- |
| `shared/legacy-routes.json` | Express y React | Conservar las redirecciones de enlaces guardados; no ejecutan las páginas anteriores. |
| `assets/js/vall-ai-page-v4.js` y motores de Finanzas | Pantallas React y carga de scripts | Conservar: el número del archivo no indica que esté sin uso. |
| `backend/lib/gemini.js` y `@google/generative-ai` | Streaming de `/api/chat` y generadores de Finanzas | Compatibilidad aún operativa. Migrar estos consumidores y sus contratos antes de eliminar el SDK anterior. |
| `mysql2` | Recuperación de evidencia, worker e ingesta/migración | Conservar mientras esas entradas sigan utilizándose. La existencia de Supabase no convierte el adaptador en código muerto. |
| `backend/auth-server.js` | `api/auth.js` y rewrites de Vercel | Conservar: es la entrada ligera de cuentas, no un segundo login abandonado. |
| Normalización de informes guardados anteriores | Almacenes y rutas de lectura/exportación | Conservar para mantener los documentos existentes de los usuarios. |

## Pendientes relevantes

1. **Prioridad alta — persistencia de Mis informes en Vercel.** `createUserReportStore` utiliza por defecto `/tmp/vall-private-editions` en ese entorno. Ese almacenamiento es temporal y no está compartido entre instancias. Las pruebas de guardado/idempotencia local no convierten ese almacenamiento en persistente. Hace falta un almacén remoto por cuenta, con control de versiones y migración de documentos. Esta revisión no cambió ni eliminó datos de usuarios.
2. **Prioridad media — unificar los adaptadores de Gemini.** Hay consumidores activos de ambos SDK. La retirada debe cubrir streaming, cancelación, errores y los generadores de Finanzas; eliminarlos por nombre rompería funciones vigentes.
3. **Prioridad media — terminar de separar motores globales de la interfaz React.** La auditoría cubre imports y rutas literales, pero los scripts cargados dinámicamente y sus variables globales requieren pruebas de montaje, desmontaje y navegación además del grafo estático.

## Verificación ejecutada

- ESLint: 378 archivos revisados inicialmente, cero errores y cero advertencias; revisión repetida tras los cambios.
- `test:legacy`: 283 fuentes, 110 módulos del backend y 19 archivos retirados; sin módulos huérfanos ni referencias literales rotas.
- `build` y `test:legacy:ui`: distribución compilada y 17 enlaces comprobados con y sin sesión; sin errores JavaScript ni assets 404 en esos recorridos. APIs y autenticación simuladas.
- `test:security`: 38 comprobaciones HTTP/recursos, 20 casos de XSS y 24 del renderer activo de ORION, más sus controles positivos.
- `test:resilience`: frontend, entrenamiento, validación de credenciales, migración de contraseñas y streaming.
- `test:reports:user`: 10 casos de guardado, 23 entradas inválidas, sesión/cuenta, 17 recorridos de usuario y 12 de usabilidad; incluyendo reintentos, doble clic, respuesta perdida, desconexión, varias pestañas y eliminación.
- `test:reports:loading`: proveedores/IA/base sin respuesta, arranque en frío, caché corrupta, reinicio, aislamiento, cancelación y reintentos. Proveedores y correo simulados.

El build mantiene avisos de recursos públicos resueltos en ejecución y de un bundle de la presentación superior a 500 kB. La prueba del bundle comprobó sus recursos en ejecución; el aviso de tamaño queda como oportunidad de rendimiento, no como fallo de compilación.

Esta revisión no equivale a verificar todas las combinaciones posibles, las cotizaciones externas, la disponibilidad real de proveedores o todo el historial Git. Los cambios permanecen locales y las pruebas no enviaron correos ni escribieron en bases de producción.