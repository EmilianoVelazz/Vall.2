# Corrección de las once alertas de Supabase

El 21 de octubre de 2026 se aplicó, con autorización explícita del usuario, la migración `016_public_reference_rls.sql` al proyecto Brain_AI_Vall.

## Problema y corrección

Las once tablas indicadas por el asesor tenían RLS desactivado, sin políticas, y concedían lectura, inserción, actualización y borrado a `anon`. Se activó RLS en todas ellas y se creó una política exclusivamente de lectura para `anon` y `authenticated`, conservando la compatibilidad con las referencias que usa el sitio.

Se revocaron todos los permisos públicos anteriores y se devolvió solamente `SELECT`. La escritura quedó reservada a `service_role`, que ya tenía ese acceso. Las secuencias asociadas tampoco son accesibles a los roles públicos. No se alteraron las políticas privadas de perfiles, conversaciones, auditoría o pronósticos.

Las referencias conservan su lectura pública de forma intencional. Activar RLS no significa que estos datos de mercado se hayan convertido en información privada. El cambio impide su modificación directa desde clientes públicos.

Los scripts de ingesta de Mercolleida, migración de conocimientos y prueba antigua de escritura ahora requieren una credencial privada del servidor. El nuevo helper rechaza claves publicables y no utiliza una clave pública como respaldo. No se ejecutaron las importaciones ni la antigua prueba que inserta y elimina registros.

## Resultado verificado

- El panel actualizado mostró **“Advisor found no issues”** y **“No security or performance issues found”**. Captura: `output/supabase-rls-sin-alertas.png`.
- Las once tablas mantienen los mismos **164 registros**, con la misma cantidad en cada tabla. La migración únicamente cambia permisos y políticas.
- La comprobación de conexión de las **25 tablas** incluidas en el diagnóstico terminó correctamente por REST y PostgreSQL.
- Las **22 comprobaciones de lectura**, once por cada rol público, devolvieron las mismas cantidades que el servidor.
- Las **66 simulaciones** de inserción, actualización y borrado —tres operaciones, dos roles, once tablas— fueron rechazadas con error de permisos. Se utilizó `EXPLAIN` sin `ANALYZE`, sin ejecutar escrituras.
- No quedaron tablas de `public` sin RLS ni secuencias de estas referencias accesibles a los roles públicos.
- `/api/mercolleida/overview` respondió HTTP 200, con datos disponibles y sus 29 observaciones mensuales. No se publicaron cifras de prueba.
- Pruebas de selección de credenciales y diagnóstico correctas; ESLint sin errores en los archivos JavaScript modificados.

Evidencias sin credenciales ni contenidos de registros:

- `output/supabase-rls-before.json`: estado anterior y cantidades.
- `output/supabase-rls-simulation.json`: permisos posteriores y 66 simulaciones.
- `output/supabase-rls-after.json`: comprobación posterior de permisos y lecturas.
- `output/supabase-conexion-tras-rls.json`: disponibilidad por API y PostgreSQL.

## Revisiones posteriores

`npm run check:supabase` comprueba la conexión. `npm run check:supabase:security` revisa RLS, permisos, secuencias y lecturas en una transacción de solo lectura.

La opción manual `node scripts/check-reference-rls.cjs --simulate-writes` repite las simulaciones. Los rechazos esperados pueden registrarse como errores de PostgreSQL en el historial del panel, aunque ninguna operación modifique datos. Por ese motivo la comprobación habitual no los genera. Los gráficos históricos conservan tanto incidentes previos como rechazos de estas pruebas; no representan la lista actual del asesor.

Los permisos se corrigieron en Supabase remoto. Los cambios de scripts están en el repositorio local y no se realizó un despliegue ni un envío a Git durante esta revisión.

Referencias: [grants y RLS de la API](https://supabase.com/docs/guides/api/securing-your-api), [políticas de seguridad por filas](https://supabase.com/docs/guides/database/postgres/row-level-security).
