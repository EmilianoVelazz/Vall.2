# VALLNews

Plataforma de inteligencia económica y financiera: finanzas, mercados de
insumos, geopolítica, México y un asistente de análisis (VALL-AI).

## Arrancar

```bash
npm install
cd frontend && npm install && cd ..
npm run dev
```

`scripts/dev.mjs` levanta las dos piezas a la vez:

| Puerto | Qué | |
|---|---|---|
| **5273** | Vite + React | **es el que se abre** |
| 3101 | Express | sirve `/api`; Vite le hace proxy |

Abre siempre **http://localhost:5273**. Si entras al 3101 te redirige a la SPA.

No son el 5173 y el 3001 de siempre a propósito: el 5173 lo toma cualquier otro
proyecto con Vite de la máquina, y con dos abiertos a la vez uno acababa
sirviendo la app equivocada. Para moverlos, sin editar nada:

```powershell
$env:VN_API_PORT=3102; $env:VN_WEB_PORT=5274; npm run dev
```

Hace falta `backend/.env`; parte de `backend/.env.example`. Sin `JWT_SECRET` el
servidor no arranca, a propósito.

## Cómo está organizado

```
frontend/          SPA de React (Vite + React Router). Las 9 rutas.
  src/pages/         una por sección, con su .css
  src/lib/           hooks y utilidades compartidas
backend/           API en Express
  routes/            un archivo por familia de endpoints
  ai/                orquestación de VALL-AI
assets/            CSS, JS heredado e imágenes que el frontend carga en runtime
scripts/           herramientas: arranque, build y verificadores
```

**`assets/` no es código muerto.** Los `.jsx` no incluyen ni el CSS de las
secciones ni los motores de datos (`finanzas-page.js`, `finanzas-favro.js`,
`live-engine.js`, `data-service.js`): se cargan desde `/assets` al montar. Por
eso el build lo copia a `dist/`.

## Dos cosas que conviene saber antes de tocar nada

**El CSS depende del orden.** Las hojas heredadas van *antes* que el CSS propio
de cada página, para que este último gane. De eso se encarga
`lib/usePageStyles.js`, que las inserta antes del bundle en lugar de añadirlas
al final. Las hojas comunes están en `lib/hojasComunes.js`: no las copies en
cada página o las versiones se desincronizan.

**Los ids son un contrato.** Varias secciones (Finanzas sobre todo) las pinta
JavaScript heredado que escribe por `getElementById`. Renombrar un id en el JSX
deja su recuadro congelado en el texto inicial **sin dar ningún error**.

## Verificar antes de dar algo por bueno

```bash
npm run lint             # revisión estática de backend, frontend y scripts
npm run test:all         # seguridad, IA, datos y pruebas de recuperación
npm run build            # compila React y arma el directorio de despliegue
```

`test:resilience` cubre respuestas JSON inválidas, cancelación y timeout,
sesiones con almacenamiento bloqueado, respuestas antiguas de autenticación,
reintento de bibliotecas, entradas mal formadas y errores en streams HTTPS.
Las pruebas de entrenamiento usan evidencia ficticia y no llaman al modelo.

```bash
node scripts/verify-page.mjs /finanzas /inicio     # renderizado y codificación
node scripts/verify-finanzas.mjs                   # recorrido funcional completo
node scripts/verify-dark.mjs                       # modo oscuro, contraste incluido
```

`verify-page` marca **FALLA con cualquier error de consola**, y hoy varias
fuentes externas dan 404 o limitan por ritmo. Compara las cifras (texto, canvas,
mojibake), no el veredicto.

## Publicar

```bash
node scripts/build-dist.mjs      # compila React y arma dist/
```

Vercel sirve `dist/` y enruta solo `/api` al Express.

Los reportes base de Finanzas, Mercados y México se regeneran todos los días a
las **06:00 y 14:00 de `America/Mexico_City`**. El servidor local programa ambos
cortes mientras está en ejecución; Vercel tiene dos cron equivalentes a las
12:00 y 20:00 UTC con el desfase actual. Los tres catálogos, su próxima
actualización y la opción «con cada corte» comparten el mismo calendario.
Los horarios personalizados de envío diario o semanal se conservan. Un corte
nuevo utiliza las observaciones disponibles de cada fuente; si una no responde,
se declara la cobertura o el corte anterior conservado.

El proyecto existente es `pruebasvall/vallpruebas`, conectado a la rama `main`
de `EmilianoVelazz/Valla`. Su dominio es https://vallpruebas.vercel.app.
El build instala el frontend con su archivo de bloqueo y conserva las texturas
de la presentación. La función incluye las plantillas de informes y el catálogo
sectorial; usa Fluid Compute con un plazo máximo de 300 segundos.

El plan Hobby admite un solo disparo diario por cada tarea. La comprobación
de correos se ejecuta a las 15:00 UTC y después de los dos cortes diarios.
Las horas personalizadas pueden esperar hasta la siguiente comprobación y
Vercel no garantiza el minuto exacto en este plan. Para comprobarlas cada hora,
se necesita un plan o un programador externo que admita esa frecuencia.
Las claves se configuran en Vercel; los `.env` y resultados locales de auditoría
no se publican en el repositorio.

## Mercolleida en ORION

La arquitectura del chat usa MCP para sus herramientas y mantiene Gemini para
generar respuestas. Consulta [MCP y evaluación de pronósticos](docs/orion-mcp-y-pronosticos.md)
para ver alcance, controles, métricas y pruebas de la integración.

ORION reconoce consultas sobre Mercolleida y sus seguimientos. La conexión lee
únicamente la portada pública oficial: tendencias cualitativas, extractos de
comentarios con fecha y noticias con enlace. No requiere una nueva clave de API.
Ejemplos: «¿Qué comenta Mercolleida sobre el porcino?» y «¿Y los cereales?».

Las respuestas conservan las fechas publicadas y sus fuentes. La portada no
aporta precios absolutos ni históricos completos; el chat indica esa limitación
y ofrece el enlace oficial cuando se solicitan. Los boletines de suscripción
necesitarían una integración y autorización adicionales.

El conector usa HTTPS validado con las raíces de Node y, cuando está disponible,
el almacén de certificados del sistema. Tiene un plazo de 4,5 segundos, caché de
10 minutos y freno de 30 segundos tras un error. Ante una caída puede conservar
datos de hasta 6 horas, siempre identificados como caché sin actualización
confirmada; después declara la fuente no disponible. Si cambia el HTML y no se
reconocen los datos, tampoco inventa una cotización.

Prueba específica: `node scripts/test-mercolleida.cjs`, incluida en `test:ai` y
`test:all`.

Las preguntas sobre acuerdos comerciales activan investigación documental,
aunque no incluyan la palabra «noticias». Para China–Estados Unidos, el conector
`backend/services/trade-research.js` lee publicaciones públicas de la Casa Blanca
y MOFCOM: combina un catálogo inicial de enlaces con el descubrimiento de
anuncios en sus índices oficiales. Cada documento se descarga por HTTPS y se
valida por país, contenido comercial, productos y fecha de publicación. Los
enlaces iniciales no contienen una respuesta precalculada. El alcance público
es parcial; no accede al archivo de suscripción de Mercolleida.

El periodo predeterminado es de seis meses, declarado en la respuesta; también
se reconocen periodos relativos, años e intervalos ISO explícitos. Los documentos
leídos alimentan al modelo aun si Google Search no devuelve metadatos o se usa
un modelo de respaldo. Las búsquedas complementarias permanecen habilitadas.
La portada de Mercolleida no sustituye esa investigación: sus tendencias y las
cotizaciones ajenas al asunto no se cuentan como fuentes de un acuerdo.

El plan diferencia compromisos, recomendaciones arancelarias y autorizaciones
sanitarias de su ejecución. Los efectos financieros se presentan como
inferencias condicionadas. La conexión tiene un plazo de 4,5 segundos por
página, caché de diez minutos y reintento tras treinta segundos si la cobertura
falla. Si no se recuperan documentos ni resultados de búsqueda, no afirma que
no existen acuerdos. En streaming la comprobación precede a la entrega. Las
pruebas de recuperación, periodos, relevancia y ambos canales están en
`scripts/test-trade-research.cjs`.

## Rabobank en ORION

ORION consulta el catálogo público de RaboResearch del Knowledge Hub de
[Rabobank North America](https://www.rabobankna.com/knowledge-hub/) por su API
pública de WordPress. No necesita una nueva clave. Recupera hasta tres páginas
de veinte publicaciones y declara si el catálogo es parcial. Selecciona los
artículos por producto, países y periodo, conservando fecha de publicación,
enlace y extractos breves; distingue análisis históricos y pronósticos de
datos observados o cotizaciones actuales.

Ejemplos: «Rabobank: panorama de proteínas», «¿Y los cereales?» y «Análisis de
Rabobank sobre carne de res en China y Estados Unidos en 2025». También se
consulta como complemento en panoramas agropecuarios y preguntas sobre acuerdos
de proteínas. Rabobank aporta análisis sectorial; la comprobación de un acuerdo
requiere documentos oficiales o investigación web adicional. Se añadió una
sugerencia Rabobank en la página de ORION.

Esta conexión no representa todo el archivo mundial de RaboResearch y no
accede a informes exclusivos, PDFs ni transcripciones de podcasts. Si el canal
no cubre la fecha, país o producto pedido, ORION explica esa brecha sin afirmar
que el banco no haya publicado otros análisis. La búsqueda web complementaria
permanece habilitada.

El conector usa HTTPS validado, plazos de 4,5 segundos por página, caché de
quince minutos y reintentos tras treinta segundos ante fallos. El caché anterior
se identifica como no actualizado y se descarta después de seis horas. Las
consultas simultáneas comparten la descarga y vuelven a filtrar los registros
para cada pregunta. La salud y cobertura se incluyen en `response.meta.rabobank`.
Pruebas específicas: `node scripts/test-rabobank.cjs`, incluidas en `test:ai`.

## Extensión de los informes PDF

Los informes individuales del catálogo se exportan en un máximo de **tres páginas** legibles, salvo Proteínas, que admite **hasta seis páginas** para incluir gráficas y precios específicos de cerdo, res y huevo. Mantiene la matriz USD/kg, Mercolleida, América y la historia de 2020. Panorama general integrado conserva sus capítulos completos y está exento de ese límite. La selección del PDF no modifica los datos completos de la página, los informes guardados, CSV o Excel. Consulta la [política general](docs/informes-maximo-tres-paginas-2026-10-28.md), el [enfoque de compras](docs/proteinas-compras-homologacion-2026-11-05.md) y la [ampliación gráfica de Proteínas](docs/proteinas-graficas-especies-2026-11-05.md).

La [auditoría de Proteínas](docs/auditoria-informe-proteinas-2026-11-04.md) documenta los horizontes recuperados, equivalencias en pesos, procedencia del catálogo y límites de validación externa. `npm run test:reports:protein-audit` comprueba sus cálculos, fechas, persistencia y composición.

## Archivos PDF conservados en el chat

Las exportaciones se guardan por propietario en
`backend/generated-reports/chat/`, fuera de los archivos públicos y excluidas
de Git. No vencen a los diez minutos ni se eliminan al descargarse. Sus enlaces
siguen requiriendo una sesión del propietario; la vista previa y las descargas
repetidas reutilizan el mismo archivo, incluso tras reiniciar el backend.

ORION guarda la referencia del PDF en la respuesta del historial, también cuando
se genera con el botón PDF o desde el editor de informes. Antes de abrir una
vista previa comprueba el enlace. Si un archivo antiguo ya no existe, lo recrea
con el contenido de esa respuesta, sin consultar otra vez al modelo, y guarda
el nuevo enlace. Los errores de sesión o conexión permiten reintentar sin
duplicar archivos ni mostrar una respuesta JSON dentro del visor.

`VALL_REPORT_STORAGE_DIR` permite elegir una carpeta o volumen persistente.
En Vercel, `/tmp` es temporal: para conservar los mismos bytes entre instancias
se necesita un volumen o almacenamiento persistente compatible con el hosting.
Mientras tanto, el historial permite recrear el documento al volver a abrirlo.
Conservar una copia de seguridad de la carpeta elegida preserva los PDF locales.

Prueba: `node scripts/test-report-persistence.cjs`; verifica reinicios,
antigüedad, integridad, aislamiento entre usuarios, vista previa y descargas
repetidas, y recuperación de enlaces vencidos.

## Tema oscuro

Hay dos mecanismos, y no son lo mismo:

- **Piloto por clase** (`dark-pilot.css`): Inicio y Finanzas, siempre activo.
- **Global por atributo** (`dark-theme.css`): todo el sitio, se enciende en
  Configuración → Apariencia. Ese archivo **se genera**:
  `node scripts/build-dark-theme.mjs`. No lo edites a mano.
