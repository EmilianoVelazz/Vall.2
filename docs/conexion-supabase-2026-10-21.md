# Recuperación de la conexión con Supabase

Proyecto: Brain_AI_Vall. Revisión del 21 de octubre de 2026.

## Causas comprobadas

- La clave secreta opaca utilizada por el servidor recibía HTTP 401, `PGRST303`, `JWT issued at future`. Se reprodujo en todas las tablas comprobadas. La hora del gateway y la de la computadora coincidían con aproximadamente un segundo de diferencia. La hora de PostgreSQL también resultó correcta. El error del JWT generado para esa clave apunta al procesamiento remoto de Supabase; no se corrigió cambiando el reloj local.
- La conexión de respaldo usaba el host directo de PostgreSQL, que no se resolvía en esta red. El panel confirmó que esa conexión requiere IPv6 y proporcionó el Session pooler para IPv4.
- El pooler necesitaba confiar explícitamente en la CA de Supabase. La primera conexión se rechazó con `SELF_SIGNED_CERT_IN_CHAIN`.
- Faltaban las tres tablas de las migraciones 014/015 de ORION y cuatro tablas de la migración 007 de pronósticos.

## Cambios aplicados

La configuración privada local `.env.local` utiliza ahora el host del Session pooler copiado del panel, puerto 5432 y la CA pública descargada del enlace oficial de Database → Settings → SSL configuration. La verificación de certificados y de nombre de servidor permanece activa.

Para recuperar REST se configuró la credencial `service_role` heredada que ya existía y estaba habilitada en el mismo proyecto. Se comprobó su correspondencia con el proyecto y vigencia, y después se validó el acceso real por API. No se generaron ni revocaron claves. La clave opaca original sigue existiendo en Supabase; este cambio local evita su rechazo, no demuestra que el incidente remoto haya desaparecido. Las credenciales permanecen exclusivamente en el archivo privado ignorado por Git.

Con autorización explícita del usuario se aplicaron:

- `014_forecast_learning.sql`: registro privado del aprendizaje.
- `015_orion_market_series.sql`: series y observaciones privadas.
- `007_forecasting_supabase.sql`: observaciones, ejecuciones, predicciones y evaluaciones. Se añadió una transacción, recarga del esquema REST y permisos explícitos de servidor, revocando acceso de `anon` y `authenticated`.

Se crearon siete tablas vacías; las migraciones no cargaron precios ni generaron pronósticos. No se eliminaron registros existentes.

## Verificación

- `npm run check:supabase`: catorce tablas críticas con HTTP 200; PostgreSQL `ready`; `remoteReady: true`; sin hallazgos del diagnóstico.
- La comprobación consulta `limit=0` en REST y existencia de tablas en PostgreSQL. No descarga registros privados ni demuestra por sí sola todas las operaciones de negocio.
- RLS y permisos comprobados en las tablas nuevas: acceso de servidor, sin lectura para `anon` ni `authenticated`.
- Pruebas de diagnóstico, recuperación del perfil y aislamiento de cuentas correctas. ESLint de los archivos JavaScript modificados sin errores.
- Proyecto local reiniciado, `/api/health` respondió 200 y la página de cuenta cargó el perfil remoto de Administrador. El log nuevo no registró rechazos de JWT, fallos DNS de Supabase ni indisponibilidad del almacén de perfiles durante esa comprobación.
- `/api/prediction/MSFT` respondió 404 por ausencia de pronósticos publicados, que es el resultado esperado con tablas recién creadas; ya no falla por ausencia del esquema.

El diagnóstico ampliado queda disponible mediante `npm run check:supabase`; su resultado sin secretos se guarda en `output/analisis-inteligencia-orion/storage-health.json`. El comando devuelve error cuando falta alguna de las catorce tablas, hay rechazo de autenticación o no está disponible REST. Distingue esos casos de un servidor web que simplemente responde HTTP 200.

## Alcance y avisos del panel

La configuración corregida está aplicada al proyecto **local**. No se actualizaron variables ni se realizó un despliegue en Vercel. Las migraciones autorizadas sí se aplicaron a la base remota compartida.

En la primera revisión el panel mostró once avisos del asesor por RLS desactivado. En la revisión posterior, con autorización explícita del usuario, se aplicó la migración 016: RLS activo, lectura de referencias conservada y escritura pública revocada. El panel actualizado ya no mostró alertas. Los detalles están en `seguridad-supabase-rls-2026-10-21.md`. Los rechazos anteriores siguen visibles en los gráficos históricos del intervalo seleccionado.

## Referencias

- [Conexiones de PostgreSQL y Session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [CA oficial y verificación SSL](https://supabase.com/docs/guides/platform/ssl-enforcement).
- [Incidencia reportada sobre PGRST303 con claves opacas](https://github.com/supabase/supabase/issues/50651). Es contexto del proveedor; el diagnóstico anterior se basa en las respuestas observadas en este proyecto.
