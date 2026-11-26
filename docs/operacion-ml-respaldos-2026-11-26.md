# Validación y operación · 26 de noviembre de 2026

## Pronósticos

La versión `orion-protein-ml-v7.0-purged` separa las ventanas de validación y excluye objetivos futuros del entrenamiento y de la calibración de cada ventana. Los priors por especie solo usan meses cerrados anteriores al corte simulado. Las noticias se conservan como contexto, sin sumar probabilidades manuales. Los factores explicativos son asociaciones estadísticas.

El entrenamiento del 26 de noviembre terminó a las 19:55 UTC: 90 series, 21.438 observaciones, 14 series publicables y 76 abstenciones. Entre las aceptadas, el acierto direccional histórico medio fue 64,8% y la mejora media de MAE frente a mantener el último valor fue 18,2%. Son resultados internos del proceso de selección, no una prueba prospectiva independiente ni una garantía de rendimientos. El anterior 74,8% no es comparable porque contenía sesgo temporal.

La auditoría prospectiva del modelo vigente comienza con cero evaluaciones. Las auditorías históricas sembradas, modelos anteriores y registros creados después del objetivo quedan excluidos. La banda calibrada no se presenta como cobertura comprobada fuera de muestra. Las fechas diarias avanzan por días de lunes a viernes; todavía no incorporan calendarios festivos por mercado.

El paquete comprimido en `backend/ml/models` permite instalar el corte validado durante el despliegue si falta el caché o es anterior. Se verifica integridad, versión y vigencia de 26 horas. No sustituye un entrenamiento más reciente. El trabajo diario existente renueva el modelo y el volumen persistente conserva sus resultados.

Comprobaciones: `npm run test:forecast`, `node scripts/test-protein-ml-engine.cjs` (requiere entrenar primero) y `node scripts/test-production-operations.cjs`.

## Vigilancia externa preparada, pendiente de activar

`node --use-system-ca scripts/check-production-operations.cjs https://vallnews.com` consulta salud profunda, comprueba que la respuesta sea reciente y termina con código 1 si encuentra fallos. Solo devuelve códigos operativos. Detecta informes ausentes, vacíos o atrasados; modelo ausente, anterior o atrasado; conexión rechazada; configuración incompleta; fallos recientes del trabajador de correo. No comprueba entrega en la bandeja del destinatario ni calidad de respuesta del proveedor de IA.

Debe ejecutarse en infraestructura independiente de VALLNews (propuesta: cada cinco minutos, alertar tras dos fallos consecutivos y avisar al recuperarse). Ejecutarlo solo dentro de la aplicación no detectaría la caída completa del servidor. Falta elegir el monitor corporativo y el correo/canal de aviso. No se ha creado un envío automático de alertas.

## Respaldo externo pendiente de destino

No hay todavía evidencia de un respaldo externo automático ni de una restauración verificada. Los volúmenes persistentes son almacenamiento, no respaldos. Falta un destino corporativo compatible con S3 y acceso configurado directamente en Dokploy, sin guardar credenciales en el repositorio.

Plan propuesto para activar tras disponer del destino:

1. Respaldo nativo de PostgreSQL mediante exportación consistente; proponer diario antes de la actividad matinal, con zona horaria explícita y retención corporativa acordada.
2. Copia de los volúmenes `vallnews-cache` y `vallnews-reports`, comprobando consistencia y sin programar paradas de servicio sin una ventana acordada.
3. Acceso privado al destino, cifrado y ciclo de retención; comprobar la primera copia en el almacenamiento externo.
4. Restauración en una base y volúmenes aislados, con trabajos y correos desactivados. Validar esquema, conteos, inicio de sesión de prueba y apertura de un informe antes de considerar el respaldo recuperable.
5. Supervisar fallos y antigüedad de la última copia desde el monitor independiente. Registrar fecha, resultado y tiempo de recuperación de cada simulacro.

La copia del propio servidor Dokploy no reemplaza los respaldos de la aplicación. Referencias oficiales: [bases de datos](https://docs.dokploy.com/docs/core/databases/backups), [volúmenes](https://docs.dokploy.com/docs/core/volume-backups) y [servidor Dokploy](https://docs.dokploy.com/docs/core/backups).

## Pruebas publicadas pendientes

Para probar chat y vista previa PDF en producción sigue siendo necesaria una sesión auténtica del usuario. No se fabrican sesiones ni se sustituye esta prueba por un estado HTTP 200 de la página de acceso.
