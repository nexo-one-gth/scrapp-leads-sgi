# 🚀 Inicio Rápido - SGI Scraper

Guía ultra rápida para poner en marcha el scraper en 5 minutos.

---

## ⚡ Pasos básicos

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar Google Sheets

**2.1. Compartir tu planilla con la Service Account**
- Abre tu Google Sheet
- Clic en "Compartir"
- Agrega este email como **Editor**:
  ```
  sgi-scraper@sgi-scraper.iam.gserviceaccount.com
  ```

**2.2. Verificar tu archivo `.env`**

El archivo `.env` ya está configurado con:
- Usuario SGI: `nigonzalezc`
- Planilla ID: `1jFgojauoV7ISHrdQ-P5q3-mV7-gQrCsDObx0LCR9YoA`
- Hoja: `Hoja 1`

Si necesitas cambiar algo, edita el archivo `.env` en la raíz del proyecto.

### 3. Iniciar el dashboard

```bash
npm run dashboard
```

### 4. Abrir en el navegador

Ve a: **http://localhost:3000**

### 5. Ejecutar una prueba

En el dashboard:
1. Selecciona "Modo Test (1 trámite)"
2. Clic en "▶️ Iniciar"
3. Observa los logs en tiempo real

---

## 📊 Usando el Dashboard

### Controles disponibles:

1. **Todos los trámites**
   - Procesa todos los trámites pendientes de la planilla
   - Use con precaución en producción

2. **Modo Test** ✅ *Recomendado para empezar*
   - Procesa solo el primer trámite pendiente
   - Ideal para verificar que todo funciona

3. **Fila específica**
   - Procesa un trámite en una fila específica
   - Útil para reprocesar un trámite que falló

### Estadísticas en vivo:

- **✅ Exitosos**: Trámites procesados correctamente
- **❌ Fallidos**: Trámites con errores
- **⏭️ Saltados**: Trámites que ya tienen datos

### Logs:

- Los logs se actualizan en tiempo real
- Códigos de color:
  - 🔵 Azul: Información
  - 🔴 Rojo: Errores
  - 🟡 Amarillo: Advertencias

---

## 🛠️ Troubleshooting rápido

### ❌ "Login fallido"
- Verifica las credenciales en `.env`
- Asegúrate de que `SGI_USER` y `SGI_PASS` sean correctos

### ❌ "No se encontró el campo de búsqueda"
- El sistema SGI puede haber cambiado su interfaz
- Aumenta el tiempo de espera en el código (actualmente 8 segundos)

### ❌ "Requested entity was not found"
- La Service Account no tiene acceso a la planilla
- Verifica que compartiste la planilla con el email correcto

### ❌ "Chrome not found"
- El scraper usa Chrome del sistema
- Asegúrate de tener Chrome instalado en `/Applications/Google Chrome.app`

---

## 📝 Estructura de la planilla

Tu planilla debe tener esta estructura:

| Columna | Contenido | Tipo |
|---------|-----------|------|
| **A** | Número de trámite | Entrada (ej: `#296743166`) |
| **F** | Teléfono | Salida (el scraper lo completa) |
| **H** | Email | Salida (el scraper lo completa) |

**Nota**: Si una fila ya tiene teléfono Y email, el scraper la saltea automáticamente.

---

## 🎯 Próximos pasos

Una vez que verifiques que el modo test funciona correctamente:

1. **Ejecuta en lotes pequeños**
   - Procesa 10-20 trámites a la vez
   - Verifica los resultados en Google Sheets

2. **Ajusta el delay**
   - Si el sistema SGI te bloquea, aumenta `DELAY_BETWEEN` en `.env`
   - Valor recomendado: entre 3000 y 5000 ms

3. **Monitorea los screenshots**
   - Si algo falla, el scraper guarda screenshots en `debug-*.png`
   - Úsalos para diagnosticar problemas

---

## 💡 Comandos útiles

```bash
# Ver ayuda del scraper
node scraper.js --help

# Procesar solo la fila 5
node scraper.js --row 5

# Modo headless (sin ventana del navegador)
# Edita .env: SHOW_BROWSER=false
```

---

## 📞 ¿Necesitas ayuda?

Si algo no funciona:
1. Revisa los logs en el dashboard
2. Verifica los screenshots de debug
3. Confirma que la configuración en `.env` sea correcta
4. Asegúrate de que la planilla esté compartida con la Service Account
