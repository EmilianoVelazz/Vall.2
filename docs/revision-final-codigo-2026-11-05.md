# Revisión final de código — 5 de noviembre de 2026

## Correcciones verificadas

- Las sesiones de usuarios, incluidos administradores distintos del administrador principal configurado, vuelven a comprobar el perfil activo y la versión de sus credenciales. Una cuenta desactivada o con contraseña renovada no conserva acceso mediante una sesión anterior.
- El consentimiento para guardar conversaciones de entrenamiento se verifica nuevamente antes de escribir el contenido.
- Las rutas de chat reservan y liquidan el consumo por usuario, incluidos generación normal, transmisión y modelos de respaldo. El proveedor no ejecuta reintentos ocultos dentro de una solicitud medida. Los informes quedan fuera del saldo del chat.
- Se incorpora la barra de consumo mensual, semanal y de cinco horas, con actualización después de cada mensaje y fecha de recarga al agotar el saldo. La exención corresponde a `admin@vall.com`.
- El acceso nativo a Gemini Live queda bloqueado para cuentas limitadas mientras esa modalidad no permita conciliar su consumo. El texto y el dictado conservan sus rutas habituales.
- Las gráficas cancelan solicitudes al desmontarse. El refresco de Mercados evita consultas superpuestas y no vuelve a programarse después de abandonar la pantalla.
- Finanzas y Mercados comparten las versiones locales de Chart.js, Lightweight Charts y el mapa. Una carga fallida de Chart.js puede reintentarse.
- El panorama reutiliza composiciones concurrentes cuando las instantáneas de origen coinciden; cambiar una instantánea invalida esa reutilización. Se corrige también una discrepancia de versión que provocaba refrescos repetidos del contexto de Bolsa.
- Se corrige la referencia rota al favicon. El análisis estático excluye artefactos generados en `output/`.

## Validación

- 40/40 pruebas de regresión aprobadas: autenticación, seguridad, aislamiento, créditos, persistencia, calendario de actualización, carga y exportación de informes.
- Prueba adicional del SDK de generación y sus recuperaciones: aprobada.
- Prueba de navegador del saldo, las tres barras y el aviso de agotamiento: aprobada.
- Simulación de vista previa y descarga de PDF: 10/10 aprobadas, incluidos los tres panoramas.
- ESLint: 716 archivos, cero errores y cero advertencias.
- Compilación de producción: aprobada. Vite conserva una advertencia de tamaño en algunos paquetes; no es un error de compilación y queda como oportunidad de optimización.
- Servicio local reiniciado: `/login` y `/api/health` responden HTTP 200; las consultas de informes y saldo sin sesión responden HTTP 401.
- Doce lecturas de rutas privadas en ambos servidores: sin contenido privado expuesto. El inventario final no encuentra referencias rotas a imágenes.
- Evidencias locales: `output/revision-final-20261105/`, incluidos `regression.json`, `eslint-final.json`, `build-final.log` y `chat-creditos.png`.

Las pruebas de autenticación, consumo y persistencia usan datos simulados. No sustituyen la comprobación de la base de datos real.

## Pendiente externo: Supabase

La API configurada es `zgzziypiigfsxvrlttth.supabase.co`. El identificador de la URL coincide con el de la clave configurada. La solicitud directa devuelve `ENOTFOUND`; las consultas DNS públicas de Google y Cloudflare devuelven `NXDOMAIN` (estado 3, sin respuestas). El usuario informa que el proyecto sigue activo con la misma URL.

Esto impide validar los perfiles, saldos y la persistencia contra el proyecto real. No se cambiaron URL ni claves, no se aplicaron migraciones y no se debilitó la autenticación para ocultar el fallo. Hace falta contrastar la **Project URL** mostrada por el panel y la disponibilidad de la API. Si esa URL coincide y el proyecto está activo, corresponde revisar la incidencia con Supabase.

## Operación y alcance

- Se mantiene el calendario solicitado: Finanzas a diario y Mercados los viernes. El refresco visual de la pantalla no cambia el calendario de publicación.
- Los envíos automáticos de correo permanecen desactivados. Las pruebas no enviaron correos ni modificaron la base de datos real.
- No se realizó publicación, commit ni envío a Git en esta revisión.
- El inventario de imágenes conserva cinco recursos sin referencias detectadas y dos pares idénticos. No se eliminaron: pertenecen a cambios previos y no impiden el funcionamiento. El detalle está en `output/auditoria-imagenes.json`.
- Los cambios previos del espacio de trabajo se conservaron.
