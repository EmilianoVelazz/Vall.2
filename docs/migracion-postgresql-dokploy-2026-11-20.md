# PostgreSQL en Dokploy: migración de VALLNews

Estado: conexión de producción y del proyecto local cambiada el 20 de noviembre de 2026. No se desplegaron los cambios de código pendientes del directorio de trabajo.

## Servicios y conexiones

| Componente | Configuración |
| --- | --- |
| Base principal | `vallnews-postgres`, PostgreSQL 17.12 |
| Imagen de PostgreSQL | `pgvector/pgvector:0.8.7-pg17` |
| Base / propietario | `vallnews` / `vallnews_owner` |
| Host interno | `vallnewscom-vallnewspostgres-z4c40d:5432` |
| Puerto público PostgreSQL | Ninguno |
| Volumen de datos | `vallnewscom-vallnewspostgres-z4c40d-data` |
| API compatible | `vallnews-data-api`, `postgrest/postgrest:v16.4` |
| URL usada por el backend | `https://vallnews.com/_data` |
| Ruta de compatibilidad adicional | `https://vallnews.com/rest/v1` |

Se conservan los nombres `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para que los clientes existentes funcionen con PostgREST. Sus valores corresponden al servicio alojado en Dokploy. La clave privada permanece en la configuración del servidor; no se debe poner en una variable `VITE_*`.

Se retiraron las credenciales y direcciones de conexión SQL directa al origen, tanto en producción como en los archivos de entorno locales. Una caída del destino no debe provocar escrituras en Supabase.

El acceso entre PostgREST y PostgreSQL utiliza TLS con `sslmode=verify-full`, verificación del nombre del host y certificado de confianza en `/etc/vallnews/postgres-ca.crt`. El certificado y su clave privada del servidor están en el volumen de PostgreSQL; su vencimiento es el 22 de febrero de 2029. Renovar el certificado y actualizar la copia pública de confianza antes de esa fecha. El acceso TCP de PostgreSQL exige TLS; el acceso local por socket exige contraseña SCRAM.

`authenticator` puede asumir únicamente el rol de servicio autorizado. `service_role` conserva `BYPASSRLS` y los permisos originales del backend, con autorización explícita del usuario. Para `report_history_editions` se conservaron únicamente los permisos originales de inserción y lectura. PostgREST no tiene rol anónimo configurado. Las 38 tablas conservan RLS.

MariaDB existente se conserva para sus usos anteriores.

## Validaciones realizadas

- Copia final con las aplicaciones de producción y local detenidas: 38 tablas, 21,530 registros, 9 funciones y 29 políticas.
- Las huellas SHA-256 de las 38 tablas del origen y destino coincidieron antes de reabrir las escrituras. Se compararon los datos completos mediante JSONB canónico y huellas ordenadas, sin imprimir registros privados.
- Los 5 perfiles conservaron sus datos y contraseñas almacenadas. Se copiaron 70 programaciones de correo.
- Acceso privado a las 38 tablas mediante la API, lectura de los cinco informes de Finanzas y los cinco de Mercados, búsqueda de perfiles, relación entre conversaciones y mensajes y llamada vacía a `orion_observe_market_series`.
- Diagnóstico de almacenamiento de ORION: cinco comprobaciones con HTTP 200.
- Inserción y actualización de un perfil sintético dentro de una transacción revertida. Cero registros de esa prueba después de `ROLLBACK`.
- Peticiones anónimas y con credenciales inválidas: HTTP 401.
- Comprobación desde el contenedor publicado: conexión nueva, credencial SQL del origen ausente, consultas privadas con HTTP 200, tareas en segundo plano y automatización de correos activas. El archivo de programaciones persistente conserva 70 entradas, 15 activas.
- `https://vallnews.com/api/health`, backend local y la interfaz `http://localhost:5273/informes`: HTTP 200.
- Pruebas existentes `test-supabase-server-client.cjs` y `test-report-email-schedule.cjs`: correctas.

La instancia local mantiene las tareas en segundo plano y el envío automático desactivados para no duplicar el trabajo de producción.

## Copia de migración y recuperación

En el volumen privado del nuevo PostgreSQL:

```text
/var/lib/postgresql/data/migration-backups/source-final.dump
/var/lib/postgresql/data/migration-backups/source-final-hashes.txt
/var/lib/postgresql/data/migration-backups/target-final-hashes.txt
```

SHA-256 del archivo de copia final:

```text
b772622e2826b2cd6361089feb3bf1f7696e68a10cee9b40630b926bb420dbb8
```

El directorio tiene permisos 0700 y sus archivos 0600, propiedad de PostgreSQL. La base original de Supabase no se borró ni se modificó para la migración; representa el estado previo al cambio. Después de abrir escrituras en Dokploy, Supabase deja de estar actualizado: volver a conectarlo requiere reconciliar primero los cambios posteriores. No habilitar dos primarios ni un respaldo de escritura automático al origen.

Las claves anteriores deben recuperarse desde su proveedor autorizado si se necesita una reversión. No se creó un archivo adicional de credenciales.

Pendiente operativo: configurar un destino corporativo para copias automáticas fuera del servidor. El panel de Dokploy no mostró destinos disponibles. La copia en el mismo volumen y la base anterior no sustituyen un respaldo externo periódico de los datos nuevos. También deben respaldarse los volúmenes de archivos, informes y cachés de la aplicación.

Los resultados detallados de esta sesión están en `output/migration-feasibility-20261120/` y no se versionan; no contienen filas de usuarios ni claves privadas.
