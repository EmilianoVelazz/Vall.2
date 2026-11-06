# Recuperación de la biblioteca de informes

El error «La biblioteca tardó demasiado» se reprodujo con un arranque sin
corte en memoria: la consulta intentaba acceder a Supabase, regenerar los
datos y esperar al editor de IA antes de responder. La interfaz vencía a los
20 segundos. Los registros locales mostraban rechazo del JWT remoto y fallos
de conexión PostgreSQL; no se modificaron credenciales ni controles de sesión.

## Corrección

- Finanzas y Mercados comparten un almacén con respaldo JSON privado,
  escritura temporal y publicación atómica. Se valida colección, fecha y
  estructura. El corte se conserva aunque falle su persistencia remota.
- La lectura tras reiniciar usa primero el respaldo disponible. Las lecturas
  simultáneas comparten el mismo acceso y la generación mantiene su bloqueo
  por colección. Un cambio de esquema del PDF no bloquea el corte anterior.
- Cada acceso remoto del almacén tiene un plazo de 4 segundos; las fuentes,
  14 segundos; el editor, 15 segundos en total, incluidos sus respaldos de
  modelo. Una edición de IA sin respuesta conserva el análisis determinista
  identificado como tal, con las cifras y las fuentes del corte.
- Daily News no se genera con IA dos veces para abrir la biblioteca. Mercados
  recupera sus fuentes informativas en paralelo y conserva las que responden.
  Se filtran respuestas oficiales nulas antes de leer sus propiedades.
- Las colecciones base permiten hasta 60 segundos para su primera generación.
  Mis informes mantiene 20 segundos. Un error de carga se distingue de una
  colección vacía. Los cortes anteriores conservan fecha y aviso de vigencia.

El disco es un respaldo local o de la instancia, no sustituye la persistencia
compartida entre instancias de Vercel. El rechazo de Supabase y su conexión de
respaldo siguen requiriendo revisión de configuración del servicio remoto.

## Comprobación

`npm run test:reports:loading` incluye un arranque que supera 20 segundos,
caída del perfil, red/IA/DB que no responden, noticias parciales, tres aperturas
simultáneas, caché corrupto, recuperación tras reinicio, formato anterior,
reintentos, documentos completos y liberación de conexiones tardías.

También pasaron sincronización, calidad, IA, 17 recorridos de guardado/uso y
`node scripts/test-report-languages.mjs --ui`: seis idiomas, descargas y
adjuntos, cambios entre pestañas e invalidación del visor anterior.

Se regeneraron cortes reales locales: 5 informes de Finanzas con 31
indicadores y 5 noticias, y 5 de Mercados con 19 indicadores y 5 noticias.
Ambos quedaron en disco; el proceso completo paralelo terminó en unos 29 s.
En un navegador aislado usando esos cortes, la primera lectura fue visible
en unos 0.5 s; cambios de colección y recarga devolvieron 200 sin errores de
JavaScript, aun simulando un perfil no disponible. Son mediciones de esta
comprobación, no garantías de latencia. No se enviaron correos reales.
