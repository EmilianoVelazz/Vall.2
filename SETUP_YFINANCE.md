# 📊 Configuración - Carrusel BMV con yfinance

## Paso 1: Instalar Python yfinance

En tu terminal/cmd, ejecuta:

```bash
pip install yfinance
```

O si tienes Python 3:
```bash
pip3 install yfinance
```

## Paso 2: Instalar dependencias del Backend

En la carpeta `backend/`, ejecuta:

```bash
npm install
```

## Paso 3: Verificar .env del Backend

El archivo `backend/.env` debe tener:

```
GEMINI_API_KEY=tu_clave_gemini_aqui
PORT=3001
```

## Paso 4: Iniciar el Backend

En la carpeta `backend/`, ejecuta:

```bash
npm start
```

Deberías ver:
```
🚀 VALLNEWS Backend · http://localhost:3001
   GET  /api/bmv-market       → Datos de Bolsa (yfinance)
   GET  /api/finanzas         → Datos página Finanzas
   POST /api/finanzas/refresh → Forzar actualización
   GET  /api/noticias         → Noticias genéricas
```

## Paso 5: Abrir el Frontend

- Abre `index.html` en tu navegador
- El carrusel debería cargarse con datos en tiempo real de:
  - **Bolsa de Valores México** (GRUMA, BIMBO, FEMSA, USD/MXN)
  - **Sector Porcino** (Lean Hogs Futures)
  - **Gasolina** (Petróleo WTI)
  - **Criptomonedas** (Bitcoin, Ethereum)

## Paso 6: Diagnosticar Problemas

Si el carrusel no muestra datos:

1. **Abre la consola del navegador** (F12)
2. **Verifica los logs:**
   - ✓ Debe decir: "Market data received: {...}"
   - ✗ Si dice error, revisa que el backend esté corriendo
   
3. **Verifica que el backend esté disponible:**
   - Abre en el navegador: `http://localhost:3001/api/bmv-market`
   - Debería ver un JSON con datos de mercado

## Archivos Modificados

```
backend/
  ├── server.js              ← Nuevo endpoint /api/bmv-market
  └── market-data.py         ← Script Python con yfinance (NUEVO)

index.html
  └── Script del carrusel actualizado para consumir backend
```

## Características del Carrusel

✅ **Bolsa de Valores México** - Acciones principales
✅ **Cambio de Divisas** - USD/MXN en tiempo real  
✅ **Sector Porcino** - Carne de cerdo (futures)
✅ **Gasolina** - Petróleo WTI
✅ **Criptomonedas** - Bitcoin y Ethereum
✅ **Datos en Tiempo Real** - Actualizados con yfinance
✅ **Carrusel Infinito** - Scroll automático
✅ **Cambios de Color** - Verde (alza) / Rojo (baja)

## Limitaciones

- El carrusel se actualiza cada vez que recargas la página
- Para updates más frecuentes, puedes agregar un `setInterval` que llame a `loadBMVCarousel()` cada X segundos

## Próximas Mejoras

- [ ] Agregar refresh automático cada 5 minutos
- [ ] Caché en el backend para reducir llamadas a yfinance
- [ ] Gráficos inline con cambios históricos
- [ ] Agregar más acciones BMV
