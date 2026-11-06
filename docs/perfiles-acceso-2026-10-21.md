# Perfiles y acceso a VALLNews

## Diagnóstico

Se encontraron cinco registros en `public.app_profiles`: el administrador y cuatro usuarios. Las cuatro cuentas de usuario estaban activas y tenían hashes bcrypt válidos. No había usuarios en `auth.users`: esta instalación utiliza el acceso propio de VALLNews, no Supabase Auth.

El correo indicado coincidió exactamente con un perfil activo. La consulta real mediante `user-profile-store`, que usa el login, devolvió el mismo identificador y el mismo hash que PostgreSQL. No se encontró una tabla ausente ni una pérdida de contraseña. No se ha confirmado una coincidencia entre la contraseña introducida y el hash existente.

La dirección finalmente indicada fue `https://vallpruebas-git-main-pruebasvall.vercel.app/login`. Se reprodujo HTTP 403 «Origen no permitido» enviando a la API principal un cuerpo vacío con ese origen. La política omitía `VERCEL_BRANCH_URL`; ahora admite únicamente la dirección exacta de rama proporcionada por Vercel, además de las direcciones existentes. No admite dominios de Vercel arbitrarios ni confía en el encabezado Host.

Por separado, las solicitudes anónimas a la dirección de rama reciben 401 de la protección de despliegues de Vercel. Esa protección se conserva. El acceso habitual de usuarios debe realizarse en `https://vallpruebas.vercel.app/login`, donde la API responde 400 «Credenciales requeridas» al cuerpo vacío y permite su origen. Esa prueba verifica el paso a la API, no una contraseña real.

## Migración y conexión

Se aplicó `017_app_profile_access.sql` sobre la tabla existente. La migración también crea `app_profiles` si no existe, normaliza el correo y exige un índice único y formato de correo válido. Añade versión de credencial y fecha del último cambio, valida hashes bcrypt y conserva acceso privado del servidor mediante RLS y permisos explícitos.

Se comprobó antes y después la huella de los identificadores, correos, hashes, roles, actividad, nombres, preferencias y fecha de creación. Los cinco registros coincidieron exactamente. La migración no restablece contraseñas.

El login consulta el correo normalizado por igualdad exacta, evitando interpretar `_` y `%` como patrones. La conexión PostgreSQL de los scripts de migración y semilla reutiliza el pool y la CA verificada de la aplicación; se retiraron la adivinación de regiones y la desactivación de verificación TLS de esas herramientas.

La semilla ahora omite cuentas existentes en lugar de sobreescribir sus contraseñas, roles, activación o preferencias. Su prueba de regresión verificó cuatro usuarios y el administrador sin escrituras sobre ellos.

## Gestión de perfiles

Configuración → **Perfiles de acceso** muestra las cuentas del servidor, su estado y último acceso. Solo un administrador autenticado con un perfil administrativo activo puede acceder a la API. Los usuarios comunes reciben 403 y las solicitudes sin sesión reciben 401. La tabla no devuelve hashes.

El administrador puede abrir el formulario de restablecimiento de una cuenta de usuario. La persona debe introducir y guardar la nueva contraseña directamente en la página. No se generan contraseñas por defecto ni se envían correos. El perfil, sus preferencias y sus informes se conservan. La cuenta administrativa del despliegue no se puede restablecer mediante este formulario.

La función privada `vall_update_profile_password` actualiza el hash, fecha y versión de forma atómica. Se exige bcrypt, y la función no es ejecutable por `PUBLIC`, `anon` ni `authenticated`. Las sesiones nuevas de usuarios incluyen la versión de credencial; después de un cambio, su versión anterior se rechaza. El cambio realizado por el propio usuario renueva su cookie actual.

Las sesiones antiguas emitidas sin versión, anteriores a esta actualización, conservan su caducidad original de hasta ocho horas. La cuenta administrativa mantiene el mecanismo independiente de contraseña del despliegue.

## Validación

- `node scripts/test-profile-access.cjs`: cuatro cuentas ficticias completan login, verificación y lectura de su propio perfil; controles administrativos, aislamiento entre usuarios, restablecimiento, rechazo de contraseña anterior, revocación de sesiones con versión y renovación tras cambio propio.
- `node scripts/test-profile-seed-preservation.cjs`: conserva las cuatro cuentas existentes y el administrador sin sobrescrituras.
- `node scripts/test-auth-branch-origin.cjs`: producción, despliegue y rama exactos superan preflight y llegan a validación de credenciales; cinco orígenes ajenos se rechazan con 403.
- Regresiones de servidor de cuenta independiente, recuperación del perfil, indisponibilidad del almacén, validación de entradas y migración de contraseña antigua correctas.
- `npm run build`: compilación correcta; aviso de tamaño de paquetes ya existente.
- ESLint sin errores en los archivos modificados.
- Verificación remota: cinco registros y cuatro usuarios conservados; sin acceso público a perfiles ni a la función de contraseña.
- Navegador local: tabla cargada con las cinco cuentas y formulario abierto para la cuenta indicada. Un formulario preparado no demuestra todavía un acceso real con una contraseña nueva.

Evidencias sin contraseñas ni hashes: `output/perfiles-migracion-antes.json`, `output/perfiles-migracion-despues.json` y `output/build-perfiles-acceso.log`.

## Despliegue

La migración se aplicó a la base remota compartida. La nueva interfaz y las rutas de gestión se implementaron y probaron en local. `vercel.json` contiene sus rutas hacia el servidor independiente de cuentas; su publicación debe verificarse por separado. No se debe dar por corregido un acceso real en Vercel solo porque la tabla local carga.
