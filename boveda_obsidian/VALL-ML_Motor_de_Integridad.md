---
tags:
  - machine-learning
  - backend
  - vall-ml
  - arquitectura
  - data-integrity
fecha: 2026-08-31
---

# Motor de Integridad de Datos (VALL-ML)

El motor VALL-ML es un sistema de **Machine Learning No Supervisado** implementado en la plataforma para actuar como un escudo de integridad matemática contra fuentes de datos poco fiables (ej. SNIIM, caídas de la API, errores gubernamentales).

A diferencia de un panel de reportes estático, este modelo opera de forma *invisible* antes de que los datos lleguen al usuario, asegurando que cualquier valor mostrado tenga sentido algorítmico y de mercado.

## 🧠 Core Features

1. **Corrección de Datos (Data Cleansing)**: 
   - Gemini (modelo `pro`) evalúa la matriz cruda de datos. Si detecta anomalías severas (ej. precio del cerdo cae a $0, o los insumos suben 100% pero la proteína baja un 50%), infiere el precio real cruzando variables como los futuros del CME, el tipo de cambio y los costos de alimentación (Feed Cost).
2. **Memoria Continua (Continuous Learning)**: 
   - El sistema tiene "memoria". Cuando detecta un fallo en una fuente, genera una "regla" que almacena para el futuro, aprendiendo qué fuentes suelen ser erráticas y cómo debe manejarlas.
3. **Nivel de Confianza (Confidence Score)**:
   - A cada métrica se le asigna un score de 0 a 100. Si la fuente era fidedigna, el score es alto. Si la IA tuvo que intervenir agresivamente, el score baja.

---

## 🏗️ Arquitectura y Archivos Clave

### 1. El Worker Autónomo (`backend/ai/ml-unsupervised.js`)
Es un script que corre en segundo plano cada 2 horas. 
- **Flujo:** Extrae la data cruda -> Lee la memoria pasada -> Inyecta el tensor a Gemini -> Recibe datos limpios -> Actualiza memoria.

### 2. Memoria y Caché (`backend/cache/`)
- **`ml-memory.json`**: Almacena las reglas aprendidas (ej. *"El 31/08 SNIIM falló en la región Sur, desconfiar si el diferencial es >20%"*). Mantiene las últimas 20 reglas.
- **`verified-market.json`**: El archivo que guarda el JSON final con los datos ya suavizados y listos para servirse a la aplicación.

### 3. Interceptación en API (`backend/routes/market.js`)
El endpoint `/api/sniim` fue modificado. Antes de consultar la fuente cruda, verifica si el archivo `verified-market.json` tiene datos recientes. Si es así, sirve la data limpia adjuntando una flag `is_ml_verified = true`.

### 4. UI Transparente (`MercadoProteinas.jsx`)
No hay dashboards pesados. El frontend simplemente consume la data y, si detecta la flag `is_ml_verified`, muestra un sello verde discreto (🛡️ **Validados por VALL-ML**) garantizando al usuario que los precios han sido depurados de cualquier aleatoriedad gubernamental.

---

## 🚀 Cómo ejecutar manualmente

Si necesitas forzar al motor a repensar y limpiar los datos de inmediato (por ejemplo, tras un pico extraño en el mercado), puedes correr el worker directamente desde la terminal del backend:

```bash
node backend/ai/ml-unsupervised.js
```
