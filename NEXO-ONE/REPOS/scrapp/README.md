# SGI Scraper — Swiss Medical

Automatización en Node.js + Puppeteer que extrae **teléfono y email** de trámites del sistema SGI de Swiss Medical y los escribe directamente en una planilla de Google Sheets.

---

## Estructura del proyecto

```
sgi-scraper/
├── scraper.js          # Script principal
├── package.json
├── .env.example        # Template de variables de entorno
├── .env                # Tus credenciales reales (NO subir a git)
├── credentials.json    # Service Account de Google (NO subir a git)
├── .gitignore
└── README.md
```

---

## Requisitos previos

- **Node.js 18+** instalado
- **Cuenta de Google** con acceso a Google Cloud Console
- Acceso al sistema **SGI de Swiss Medical**
- La **Google Sheet** donde están los trámites

---

## Paso 1 — Crear la Service Account de Google

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto nuevo (o usar uno existente)
3. En el menú izquierdo ir a **APIs y servicios → Credenciales**
4. Clic en **+ Crear credenciales → Cuenta de servicio**
5. Completar nombre (ej: `sgi-scraper`) y clic en **Crear y continuar**
6. En el paso de roles, asignar **Editor** (o "Editor de hojas de cálculo" si está disponible)
7. Clic en **Listo**
8. En la lista de cuentas de servicio, clic en la que acabás de crear
9. Ir a la pestaña **Claves → Agregar clave → Crear clave nueva → JSON**
10. Se descarga automáticamente un archivo `.json`
11. **Renombrarlo a `credentials.json`** y copiarlo en la raíz del proyecto

> ⚠️ **Nunca subas `credentials.json` a un repositorio.**

---

## Paso 2 — Habilitar la Google Sheets API

1. En Google Cloud Console ir a **APIs y servicios → Biblioteca**
2. Buscar "Google Sheets API"
3. Clic en **Habilitar**

---

## Paso 3 — Compartir la planilla con la Service Account

1. Abrir el archivo `credentials.json` que descargaste
2. Copiar el valor del campo `"client_email"` (algo como `sgi-scraper@tu-proyecto.iam.gserviceaccount.com`)
3. Abrir tu Google Sheet
4. Clic en **Compartir** (botón arriba a la derecha)
5. Pegar el email de la Service Account
6. Asignar rol **Editor**
7. Clic en **Enviar**

---

## Paso 4 — Configurar el entorno

```bash
# Clonar / descomprimir el proyecto
cd sgi-scraper

# Copiar el template de variables
cp .env.example .env

# Editar .env con tus datos reales
nano .env   # o el editor que prefieras
```

Variables clave a verificar en `.env`:

| Variable | Descripción |
|---|---|
| `SGI_USER` | Usuario de SGI |
| `SGI_PASS` | Contraseña de SGI |
| `SPREADSHEET_ID` | ID de la Google Sheet (parte de la URL entre `/d/` y `/edit`) |
| `SHEET_NAME` | Nombre exacto de la hoja/pestaña |
| `SHOW_BROWSER` | `true` para ver el navegador, `false` para modo silencioso |
| `DELAY_BETWEEN` | Milisegundos de espera entre trámites (mínimo recomendado: 2000) |
| `START_ROW` | Fila de inicio (default 2, para saltear el header) |

---

## Paso 5 — Instalar y ejecutar

```bash
# Instalar dependencias
npm install
```

### 🖥️ Opción 1: Dashboard Web (Recomendado)

```bash
# Iniciar el dashboard en el navegador
npm run dashboard

# Abrir en el navegador
# http://localhost:3000
```

El dashboard te permite:
- ✅ Controlar el scraper desde el navegador
- 📊 Ver estadísticas en tiempo real
- 📋 Monitorear logs mientras ejecuta
- ⚡ Iniciar/detener la ejecución
- 🎨 Interfaz moderna y profesional

### ⌨️ Opción 2: Línea de comandos

```bash
# Verificar que todo está ok
node scraper.js --help

# Modo test (procesa solo 1 trámite)
node scraper.js --test

# Procesar solo una fila específica
node scraper.js --row 5

# Procesar todos los trámites pendientes
node scraper.js
```

---

## Estructura de la planilla

| Columna | Contenido |
|---|---|
| **A** | Número de trámite (entrada — ya debe estar cargado) |
| **F** | Teléfono (salida — el scraper lo escribe) |
| **H** | Email (salida — el scraper lo escribe) |

> Si una fila ya tiene tanto teléfono como email, el scraper la saltea automáticamente.

---

## Screenshots de debug

Cuando algo falla, el scraper guarda automáticamente screenshots en la raíz del proyecto:

| Archivo | Cuándo se genera |
|---|---|
| `debug-login-no-user-field.png` | No se encontró el campo de usuario en el login |
| `debug-login-no-pass-field.png` | No se encontró el campo de contraseña |
| `debug-login-error.png` | El login falló (credenciales incorrectas) |
| `debug-busqueda-TRAMITE.png` | No se encontró el buscador |
| `debug-results-TRAMITE.png` | No se encontró el botón Ver en los resultados |
| `debug-extraccion-TRAMITE.png` | No se encontraron datos de contacto en el detalle |
| `debug-error-TRAMITE.png` | Error inesperado durante el procesamiento |

---

## Troubleshooting

### "No se encontró el archivo de credenciales"
Asegurate de que `credentials.json` esté en la raíz del proyecto (mismo directorio que `scraper.js`).

### "Login fallido: credenciales incorrectas"
Verificá `SGI_USER` y `SGI_PASS` en tu `.env`. Revisá el screenshot `debug-login-error.png`.

### "The caller does not have permission"
La Service Account no tiene acceso a la planilla. Repetí el Paso 3 y verificá que compartiste con el email correcto.

### "Spreadsheet not found"
Verificá que `SPREADSHEET_ID` en `.env` sea correcto (es la parte entre `/d/` y `/edit` en la URL de la planilla).

### "SHEET_NAME not found"
El nombre de la hoja en `.env` debe ser exactamente igual al nombre de la pestaña en Sheets (respeta mayúsculas, acentos y espacios).

### El scraper se traba en el login
Activá `SHOW_BROWSER=true` en `.env` para ver qué está pasando. Revisá los screenshots de debug.

### Puppeteer no arranca en Linux
```bash
sudo apt-get install -y libgbm-dev libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2
```

---

## Seguridad

> 🔐 **IMPORTANTE**: Nunca subas a un repositorio ni compartas:
> - El archivo `.env` (tiene tus contraseñas)
> - El archivo `credentials.json` (tiene acceso a tus servicios de Google)
>
> Ambos están en `.gitignore` por defecto. Siempre verificá antes de hacer un `git push`.

---

## Flujo de procesamiento

```
Google Sheets (col A)
       ↓
 ¿Fila tiene tel Y email?
       ├─ Sí → Saltear
       └─ No → Abrir SGI
                  ↓
               Login (si no está logueado)
                  ↓
            Buscar #TRAMITE
                  ↓
          Click en ícono "ojo" (Ver)
                  ↓
       Extraer teléfono + email del HTML
                  ↓
       Escribir en Google Sheets (col F y H)
                  ↓
            Siguiente trámite
```
