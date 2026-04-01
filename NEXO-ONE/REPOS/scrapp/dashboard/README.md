# 🖥️ SGI Scraper Dashboard

Dashboard web en tiempo real para controlar y monitorear el scraper de trámites SGI.

## Características

- ✅ **Monitoreo en tiempo real** - Visualiza el estado del scraper mientras ejecuta
- 📊 **Estadísticas en vivo** - Exitosos, fallidos y saltados actualizados automáticamente
- 📋 **Logs en tiempo real** - Todos los logs del scraper se muestran instantáneamente
- ⚡ **Control total** - Inicia, detiene y configura el scraper desde el navegador
- 🎨 **Interfaz moderna** - Diseño dark mode responsive y profesional

## Inicio rápido

1. **Instalar dependencias** (si no lo hiciste):
   ```bash
   npm install
   ```

2. **Iniciar el dashboard**:
   ```bash
   npm run dashboard
   ```

3. **Abrir en el navegador**:
   ```
   http://localhost:3000
   ```

## Modos de ejecución

Desde el dashboard puedes ejecutar el scraper en tres modos:

1. **Todos los trámites** - Procesa todos los trámites pendientes de la planilla
2. **Modo Test** - Procesa solo el primer trámite (ideal para pruebas)
3. **Fila específica** - Procesa un trámite en una fila específica de la planilla

## Personalización

Puedes cambiar el puerto del dashboard editando tu archivo `.env`:

```env
DASHBOARD_PORT=3000
```

## Arquitectura

- **Backend**: Express + Socket.IO
- **Frontend**: HTML5 + Vanilla JavaScript
- **Comunicación**: WebSockets para actualizaciones en tiempo real
- **Proceso**: El dashboard ejecuta el scraper como proceso hijo y captura su output

## Capturas

El dashboard muestra:

- Estado actual del scraper (Ejecutando, Detenido, Completado, Error)
- Contador de trámites exitosos
- Contador de trámites fallidos
- Contador de trámites saltados
- Logs en tiempo real con colores por tipo (info, error, warning)
- Controles para iniciar/detener la ejecución

## Troubleshooting

### El dashboard no inicia
Verifica que el puerto 3000 no esté siendo usado por otra aplicación.

### No se muestran los logs
Asegúrate de que el scraper esté ejecutándose. Los logs solo aparecen cuando el scraper está activo.

### El navegador no carga la interfaz
Verifica que hayas ejecutado `npm install` para instalar express y socket.io.
