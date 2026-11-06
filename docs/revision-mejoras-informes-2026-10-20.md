# Revisión de mejoras del centro de informes

Revisión del código local y reproducciones aisladas del 20 de octubre de 2026. Se analizaron lectura, generación de México, exportación textual, actualización automática, traducción, librería, anexos y programación. No se modificó la lógica de la aplicación durante esta revisión. Las pruebas de envíos utilizaron una función simulada; no se enviaron mensajes ni se consultaron cuentas privadas.

## Correcciones prioritarias

### 1. Conservar el contenido de informes creados desde cero

**Prioridad alta.** `frontend/src/lib/reportLayout.js:7` asigna a las ediciones personales sin base la composición predeterminada `weekly-sheet`. `frontend/src/lib/reportOutline.js:31` utiliza entonces los bloques diarios. `backend/lib/report-export-content.js:32` exporta esos bloques en lugar del cuerpo narrativo propio.

**Reproducción:** informe personal con resumen, sección escrita y cierre identificables. Su índice devuelve `results`, `charts`, `comparisons`, `causes`. La exportación textual no contiene ninguno de los tres textos originales.

**Mejora:** utilizar una composición narrativa para documentos desde cero. Exigir que el resumen, las secciones y el cierre sobrevivan a lectura, guardado y exportación. Mantener la estructura diaria en los informes base de mercados.

### 2. Comparar sesiones reales después de fines de semana

**Prioridad alta.** `backend/lib/report-daily-evidence.js:48` y `backend/lib/report-daily-evidence.js:53` limitan la proyección a hoy y ayer calendario. La construcción de México pasa por esa proyección antes de componer el informe. Esto puede eliminar una sesión previa válida, aunque el modelo de lectura posterior sí sepa comparar sesiones separadas por un fin de semana.

**Reproducción:** Bolsa México con precios observados el 15, 16 y 19 de octubre. El informe del lunes 19 conserva únicamente el precio del lunes; desaparece el viernes 16. Resultado: `previous: null` y `delta: null`, pese a contar con el cierre anterior.

**Mejora:** preservar el historial fechado hasta elegir las dos últimas observaciones comparables de la misma referencia. Mostrar ambas fechas y respetar frecuencia, unidad y plaza; no fabricar registros de sábados, domingos o festivos.

### 3. Conservar el último corte válido cuando falle una consulta

**Prioridad alta.** En `backend/services/mexico-executive-reports.js:157`, las fuentes rechazadas se registran en `sourceErrors`, pero el informe se construye sin sus tablas anteriores y se guarda como nuevo corte. La recuperación de evidencia diaria no restaura todo el detalle previo, en particular el contexto mensual y anual.

**Reproducción:** corte anterior con un indicador macro y cerdo en Puebla a `38 MXN/kg vivo`. Al simular fallos de las tres consultas, el nuevo panorama pasa de un indicador a ninguno y la tabla cambia el precio de Puebla a `No disponible`.

**Mejora:** conservar datos anteriores por fuente y referencia, manteniendo su fecha original y el estado «Último dato conservado». Distinguir consulta fallida, dato ausente, dato antiguo y precio sin cambio. Una fecha nueva de preparación no debe rejuvenecer un dato conservado.

### 4. Verificar la vigencia en todos los envíos programados

**Prioridad alta.** `backend/services/report-scheduled-delivery.js:42` exige el corte esperado sólo cuando la frecuencia es `twice_daily` o la hora coincide exactamente con un corte. Una programación diaria a otra hora puede aceptar un snapshot anterior. `backend/routes/export.js:100` carga directamente los almacenes de Finanzas y Mercados.

**Reproducción simulada:** ejecución diaria a las 08:00 CDMX del 19 de octubre y snapshot del 18 de octubre a las 14:00 CDMX. El resultado es `sent: 1`, sin diferir la entrega, aunque ya corresponde el corte de las 06:00 del día 19.

**Mejora:** exigir el último corte esperado para cualquier frecuencia; actualizarlo o diferir el envío cuando todavía no exista. Registrar fecha prevista, corte usado, resultado y próximo intento.

### 5. Completar la traducción en librería, anexos y portada

**Prioridad media.** La traducción reforzada de la lectura diaria no cubre todas las superficies. `frontend/src/components/AnnualReportsLibrary.jsx:27` exporta explícitamente en español y la línea 32 fija `reportText('es')`. `ReportAnnexes.jsx` y la portada `Informes.jsx` contienen rótulos españoles sin el mismo mecanismo nativo de localización. En `frontend/src/lib/reportLibrary.js` la tabla de procedencia también presenta códigos internos de frecuencia.

**Mejora:** compartir el idioma seleccionado entre diarios, anuales, anexos y descargas; traducir los nombres de frecuencia para mostrarlos; conservar nombres oficiales, monedas, unidades, cantidades y fechas. Aplicar pruebas de coherencia a toda la página, además del cuerpo del informe.

### 6. Mantener la posición mientras se actualiza la lectura

**Prioridad media.** `frontend/src/components/ReportWorkspace.jsx:72` reinicia el desplazamiento cuando cambia `reading`. La actualización de biblioteca de `ExecutiveReportsHub.jsx:725` provoca renderizados aunque el corte devuelto sea idéntico.

**Reproducción en navegador aislado:** abrir Proteínas, desplazar la lectura a 1,200 píxeles y activar un intervalo automático con la misma respuesta de datos. El desplazamiento pasa de `1200` a `0`, con dos consultas a la biblioteca.

**Mejora:** conservar bloque y posición cuando el informe seleccionado no cambia. Si llega un corte nuevo, mostrar un aviso discreto y permitir abrirlo; al cambiar de informe sí corresponde comenzar desde el principio.

## Mejoras editoriales y de uso

Estas propuestas se basan en la estructura actual; no son defectos reproducidos de generación.

1. **Estado del dato visible desde la tarjeta.** Indicar «Actualizado», «Parcial», «Conservado» o «Sin datos», junto con la fecha del corte y la última observación. Actualmente la tarjeta se centra en título y selección; la ruta de México devuelve `sourceErrors`, pero esa señal no se presenta de forma uniforme en la biblioteca.
2. **Explicaciones específicas por mercado.** Los factores y efectos del boletín de proteínas parten de plantillas por especie en `shared/report-protein-bulletin.mjs`. Añadir una lectura del movimiento observado, la hipótesis, la evidencia del mismo mercado y periodo y su posible repercusión. Si no hay evidencia suficiente, conservar explícitamente «por confirmar». Mantener las fuentes en Anexos, como se solicitó.
3. **Anexos de la misma edición.** Añadir acceso desde cada informe diario y mantener su corte original. Hoy la librería anual tiene ese enlace; el componente de anexos vuelve a consultar el catálogo al recibir una selección y puede terminar mostrando un corte posterior.
4. **Filtros por país y producto.** Permitir localizar rápidamente pollo, huevo, cerdo, res o un país, conservando la cobertura mundial como vista inicial. Las tarjetas de cobertura territorial actuales son informativas.
5. **Historial diario por fecha.** Guardar ediciones cerradas por corte para consultar o descargar un informe anterior. Diferenciar ese archivo de la librería anual y de las copias personales; las comparaciones dentro de cada informe continuarían siendo de una sola sesión.
6. **Dos niveles de lectura.** Mantener el informe completo y añadir un resumen ejecutivo breve con los principales cambios, repercusiones y pendientes. No recortar tablas ni gráficas del documento completo para obtener una versión breve.
7. **Persistencia verificable en el despliegue.** Las copias personales se guardan en disco; en Vercel el destino predeterminado es temporal. Para Dokploy conviene verificar un volumen persistente o un almacén compartido. Esta revisión no comprobó el montaje del servidor ni su configuración remota.

## Orden recomendado

Primero, conservación de contenido, comparación de sesiones, recuperación del último dato válido y vigencia de los envíos. Después, continuidad de lectura y traducción de toda la página. Finalmente, calidad editorial, acceso a anexos, filtros e historial diario.

La corrección anterior que restauró la generación de los cuatro informes de México sigue siendo independiente de los escenarios adicionales descritos aquí.
