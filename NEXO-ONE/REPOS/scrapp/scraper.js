#!/usr/bin/env node
'use strict';

require('dotenv').config();
const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ─── Configuración ─────────────────────────────────────────────────────────────

const CONFIG = {
  sgi: {
    url: process.env.SGI_URL || 'https://sgi.swissmedical.com.ar/sgi-app/#index',
    user: process.env.SGI_USER,
    pass: process.env.SGI_PASS,
  },
  sheets: {
    spreadsheetId: process.env.SPREADSHEET_ID,
    sheetName: process.env.SHEET_NAME || 'Hoja 1',
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    colTramite: 'A',      // Columna con número de trámite
    colTelefono: 'F',     // Columna donde escribir teléfono
    colEmail: 'H',        // Columna donde escribir email
  },
  browser: {
    headless: process.env.SHOW_BROWSER !== 'true',
    slowMo: process.env.SHOW_BROWSER === 'true' ? 80 : 0,
  },
  delayBetween: parseInt(process.env.DELAY_BETWEEN || '3000', 10),
  startRow: parseInt(process.env.START_ROW || '2', 10),
};

// ─── Parseo de argumentos CLI ──────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { mode: 'all', row: null };

  if (args.includes('--help') || args.includes('-h')) {
    opts.mode = 'help';
    return opts;
  }
  if (args.includes('--test')) {
    opts.mode = 'test';
    return opts;
  }
  const rowIdx = args.indexOf('--row');
  if (rowIdx !== -1 && args[rowIdx + 1]) {
    opts.mode = 'row';
    opts.row = parseInt(args[rowIdx + 1], 10);
    return opts;
  }
  return opts;
}

// ─── Helpers de log ────────────────────────────────────────────────────────────

const COLORES = {
  reset: '\x1b[0m',
  verde: '\x1b[32m',
  rojo: '\x1b[31m',
  amarillo: '\x1b[33m',
  cyan: '\x1b[36m',
  gris: '\x1b[90m',
  blanco: '\x1b[37m',
  negrita: '\x1b[1m',
};

function log(msg, color = 'reset') {
  const ts = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`${COLORES.gris}[${ts}]${COLORES.reset} ${COLORES[color] || ''}${msg}${COLORES.reset}`);
}

function logOk(msg) { log(`✅ ${msg}`, 'verde'); }
function logErr(msg) { log(`❌ ${msg}`, 'rojo'); }
function logWarn(msg) { log(`⚠️  ${msg}`, 'amarillo'); }
function logInfo(msg) { log(`ℹ️  ${msg}`, 'cyan'); }
function logPaso(msg) { log(`   ${msg}`, 'blanco'); }

function mostrarAyuda() {
  console.log(`
${COLORES.negrita}${COLORES.cyan}SGI Scraper — Swiss Medical${COLORES.reset}
Extrae teléfono y email de trámites SGI y los escribe en Google Sheets.

${COLORES.negrita}Uso:${COLORES.reset}
  node scraper.js            → Procesa todos los trámites pendientes
  node scraper.js --test     → Procesa solo el primer trámite pendiente (modo test)
  node scraper.js --row 5    → Procesa solo la fila 5 de la planilla
  node scraper.js --help     → Muestra esta ayuda

${COLORES.negrita}Configuración (.env):${COLORES.reset}
  SGI_USER        Usuario SGI
  SGI_PASS        Contraseña SGI
  SGI_URL         URL del sistema SGI
  SPREADSHEET_ID  ID de la Google Sheet
  SHEET_NAME      Nombre de la hoja (pestaña)
  SHOW_BROWSER    true = navegador visible, false = headless
  DELAY_BETWEEN   Milisegundos de espera entre trámites (default: 3000)
  START_ROW       Fila de inicio (default: 2, saltea el header)

${COLORES.negrita}Columnas de la planilla:${COLORES.reset}
  A → Número de trámite (entrada)
  F → Teléfono (salida)
  H → Email (salida)
`);
}

// ─── Google Sheets ─────────────────────────────────────────────────────────────

async function crearClienteSheets() {
  const credPath = path.resolve(CONFIG.sheets.credentialsPath);
  if (!fs.existsSync(credPath)) {
    throw new Error(`No se encontró el archivo de credenciales: ${credPath}\nCopiá credentials.json de tu Service Account de Google.`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: credPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

async function leerFilas(sheets) {
  logInfo('Leyendo planilla de Google Sheets...');
  const rango = `'${CONFIG.sheets.sheetName}'!A:H`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.sheets.spreadsheetId,
    range: rango,
  });
  const filas = res.data.values || [];
  logOk(`Planilla leída: ${filas.length - 1} filas de datos (sin header)`);
  return filas;
}

async function escribirDatos(sheets, fila, telefono, email) {
  const updates = [];

  if (telefono) {
    updates.push({
      range: `'${CONFIG.sheets.sheetName}'!F${fila}`,
      values: [[telefono]],
    });
  }
  if (email) {
    updates.push({
      range: `'${CONFIG.sheets.sheetName}'!H${fila}`,
      values: [[email]],
    });
  }

  if (updates.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: CONFIG.sheets.spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });
  logOk(`Fila ${fila} actualizada → Tel: ${telefono || '—'} | Email: ${email || '—'}`);
}

// ─── Puppeteer — Login ─────────────────────────────────────────────────────────

async function hacerLogin(page) {
  logInfo('Navegando al SGI...');
  await page.goto(CONFIG.sgi.url, { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(2000);

  // Selectores posibles para el campo usuario
  const selectoresUser = [
    'input[name="username"]',
    'input[name="user"]',
    'input[id="username"]',
    'input[id="user"]',
    'input[type="text"]',
    'input[placeholder*="usuario"]',
    'input[placeholder*="Usuario"]',
    'input[placeholder*="user"]',
  ];

  const selectoresPass = [
    'input[name="password"]',
    'input[id="password"]',
    'input[type="password"]',
    'input[placeholder*="contraseña"]',
    'input[placeholder*="password"]',
  ];

  const selectoresSubmit = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button.btn-login',
    'button.login',
    'button:contains("Ingresar")',
    'button:contains("Entrar")',
    'button:contains("Login")',
    '[class*="login"] button',
    '[class*="btn"][type="button"]',
  ];

  // Intentar encontrar campo de usuario
  let campoUser = null;
  for (const sel of selectoresUser) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      campoUser = sel;
      logPaso(`Campo usuario encontrado: ${sel}`);
      break;
    } catch (_) { /* continuar */ }
  }

  if (!campoUser) {
    await page.screenshot({ path: 'debug-login-no-user-field.png' });
    throw new Error('No se encontró el campo de usuario. Screenshot guardado: debug-login-no-user-field.png');
  }

  // Limpiar y escribir usuario
  await page.click(campoUser, { clickCount: 3 });
  await page.type(campoUser, CONFIG.sgi.user, { delay: 50 });

  // Intentar encontrar campo de contraseña
  let campoPass = null;
  for (const sel of selectoresPass) {
    try {
      const el = await page.$(sel);
      if (el) {
        campoPass = sel;
        logPaso(`Campo contraseña encontrado: ${sel}`);
        break;
      }
    } catch (_) { /* continuar */ }
  }

  if (!campoPass) {
    await page.screenshot({ path: 'debug-login-no-pass-field.png' });
    throw new Error('No se encontró el campo de contraseña. Screenshot guardado: debug-login-no-pass-field.png');
  }

  await page.click(campoPass, { clickCount: 3 });
  await page.type(campoPass, CONFIG.sgi.pass, { delay: 50 });

  // Intentar hacer submit
  let submitOk = false;
  for (const sel of selectoresSubmit) {
    try {
      const el = await page.$(sel);
      if (el) {
        logPaso(`Botón submit encontrado: ${sel}`);
        await el.click();
        submitOk = true;
        break;
      }
    } catch (_) { /* continuar */ }
  }

  if (!submitOk) {
    // Intentar Enter como fallback
    logWarn('No se encontró botón submit, intentando con Enter...');
    await page.keyboard.press('Enter');
  }

  // Esperar navegación post-login
  const urlAntes = page.url();
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
  } catch (_) {
    await delay(3000);
  }

  // Verificar si el login fue exitoso: la URL debe haber cambiado o la página no debe mostrar error de credenciales
  const url = page.url();
  const contenido = await page.content();
  const urlCambio = url !== urlAntes;
  const hayErrorCredenciales = !urlCambio &&
    contenido.toLowerCase().includes('error') &&
    contenido.toLowerCase().includes('contraseña');

  if (hayErrorCredenciales) {
    await page.screenshot({ path: 'debug-login-error.png' });
    throw new Error('Login fallido: credenciales incorrectas. Screenshot: debug-login-error.png');
  }

  logOk(`Login exitoso → ${url}`);

  // Navegar al home del SPA si quedó sin el hash #index
  const urlActual = page.url();
  if (!urlActual.includes('#index')) {
    logPaso('Navegando al home de la aplicación...');
    await page.goto(CONFIG.sgi.url, { waitUntil: 'networkidle2', timeout: 30000 });
  }

  // Esperar a que la SPA cargue completamente
  logPaso('Esperando a que la aplicación cargue...');
  await delay(8000);
}

// ─── Puppeteer — Búsqueda y extracción ────────────────────────────────────────

async function buscarTramite(page, numeroTramite) {
  logPaso(`Buscando trámite: ${numeroTramite}`);

  // Esperar a que el SPA Angular cargue el buscador (hasta 20s)
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('input').length > 0 &&
            document.readyState === 'complete',
      { timeout: 20000 }
    );
    await new Promise(r => setTimeout(r, 2000)); // pausa adicional para Angular
  } catch (_) { /* continuar igual */ }

  // Selectores posibles para el buscador
  // Prioridad: selector específico del SGI primero
  const selectoresBuscador = [
    'input[placeholder*="inteligente"]',   // SGI: "Búsqueda inteligente"
    'input[placeholder*="Búsqueda"]',       // con tilde
    'input[placeholder*="Busqueda"]',       // sin tilde
    'input[type="search"]',
    '#searchInput',
    '.search-input',
    '[placeholder*="rámite"]',
    '[placeholder*="tramite"]',
    '[placeholder*="Buscar"]',
    '[placeholder*="buscar"]',
  ];

  let campoBusqueda = null;
  for (const sel of selectoresBuscador) {
    try {
      const el = await page.$(sel);
      if (el) {
        const isVisible = await page.evaluate((el) => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0;
        }, el);
        if (isVisible) {
          campoBusqueda = sel;
          break;
        }
      }
    } catch (_) { /* continuar */ }
  }

  if (!campoBusqueda) {
    await page.screenshot({ path: `debug-busqueda-${numeroTramite}.png` });
    throw new Error(`No se encontró el campo de búsqueda. Screenshot: debug-busqueda-${numeroTramite}.png`);
  }

  // Usar el valor de la columna A tal cual, sin agregar ni quitar nada
  const textoABuscar = String(numeroTramite).trim();
  logPaso(`Texto a buscar: ${textoABuscar}`);

  // Limpiar el campo y escribir el número
  // Triple click selecciona todo el texto actual
  await page.click(campoBusqueda, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(campoBusqueda, textoABuscar, { delay: 80 });

  // Pausa breve para que Angular procese el binding antes de buscar
  await new Promise(r => setTimeout(r, 500));

  // Buscar botón rojo de búsqueda (botón con ícono lupa en el SGI)
  const selectoresBtnBuscar = [
    'button.btn-danger',           // SGI usa btn-danger para el botón rojo de búsqueda
    'button[class*="danger"]',
    'button[class*="red"]',
    '.btn-search',
    '[class*="search"] button',
    'button[type="submit"]',
    'button.btn-primary',
    'button[ng-click*="search"]',
    'button[ng-click*="buscar"]',
  ];

  let botonBuscar = null;
  for (const sel of selectoresBtnBuscar) {
    try {
      const el = await page.$(sel);
      if (el) {
        botonBuscar = el;
        break;
      }
    } catch (_) { /* continuar */ }
  }

  if (botonBuscar) {
    await botonBuscar.click();
  } else {
    // Fallback: Enter en el campo de búsqueda
    logWarn('No se encontró botón de búsqueda rojo, usando Enter...');
    await page.keyboard.press('Enter');
  }

  // Esperar resultados
  await delay(2500);
}

async function abrirDetalleTramite(page, numeroTramite) {
  const textoTramite = String(numeroTramite).trim();

  // Estrategia principal: doble click sobre la fila del trámite (abre el detalle igual que el botón Ver)
  try {
    const fila = await page.evaluateHandle((texto) => {
      const filas = Array.from(document.querySelectorAll('tr'));
      return filas.find(f => f.innerText?.includes(texto)) || null;
    }, textoTramite);

    if (fila && fila.asElement()) {
      logPaso(`Fila del trámite ${textoTramite} encontrada. Haciendo doble click...`);
      await fila.asElement().click({ clickCount: 2 });
      // Esperar a que Angular cargue el detalle del trámite
      try {
        await page.waitForFunction(
          () => document.body.innerText.trim().length > 200,
          { timeout: 10000 }
        );
      } catch (_) { /* continuar aunque no haya contenido aún */ }
      await delay(3000);
      return true;
    }
  } catch (err) { /* continuar al fallback */ }

  await page.screenshot({ path: `debug-results-${numeroTramite}.png` });
  logWarn(`No se encontró botón Ver. Screenshot: debug-results-${numeroTramite}.png`);
  return false;
}

async function extraerContacto(page, numeroTramite) {
  logPaso('Extrayendo datos de contacto...');
  await delay(1500);

  // El detalle del trámite se renderiza dentro de un iframe — buscar el frame que lo contiene
  const idTramite = String(numeroTramite).trim().replace('#', '');
  let frameDetalle = null;
  for (const frame of page.frames()) {
    if (frame.url().includes(idTramite) || frame.url().includes('form-cotizaciones')) {
      frameDetalle = frame;
      break;
    }
  }
  const contexto = frameDetalle || page;

  const datos = await contexto.evaluate(() => {
    const texto = document.body.innerText;
    const html = document.body.innerHTML;

    // ─── Fuentes de texto: innerText + valores de atributos DOM ─────────────
    // En SPAs Angular los datos pueden estar en atributos ng-bind, value, data-*
    const atributosExtra = Array.from(document.querySelectorAll('[ng-bind],[data-email],[data-telefono],[data-tel],[value]'))
      .map(el => el.getAttribute('ng-bind') || el.getAttribute('data-email') || el.getAttribute('data-telefono') || el.getAttribute('data-tel') || el.value || '')
      .join(' ');
    const textoCompleto = texto + ' ' + atributosExtra;

    // ─── Extracción de email ─────────────────────────────────────────────────
    let email = null;

    // Regex genérico de email aplicado tanto al texto visible como a atributos DOM
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const emailsEncontrados = textoCompleto.match(emailRegex);
    if (emailsEncontrados && emailsEncontrados.length > 0) {
      // Filtrar emails del sistema (dominio swissmedical)
      const emailFiltrado = emailsEncontrados.find(e =>
        !e.includes('swissmedical') && !e.includes('noreply')
      );
      email = emailFiltrado || null;
    }

    // Buscar por labels: email, correo, e-mail
    if (!email) {
      const labelsEmail = ['email', 'correo', 'e-mail', 'mail'];
      for (const label of labelsEmail) {
        const regex = new RegExp(`${label}[^\\n]*([a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,})`, 'i');
        const match = textoCompleto.match(regex);
        if (match) { email = match[1]; break; }
      }
    }

    // ─── Extracción de teléfono ──────────────────────────────────────────────
    let telefono = null;

    // Formatos argentinos:
    // +54 9 11 1234-5678
    // 011 1234-5678
    // 15 1234-5678
    // 1123456789
    // 11 2345-6789
    const telefonoRegexPatterns = [
      /\+54[\s\-]?9[\s\-]?(\d{2,4})[\s\-]?(\d{4})[\s\-]?(\d{4})/,
      /\+54[\s\-]?(\d{2,4})[\s\-]?(\d{4})[\s\-]?(\d{4})/,
      /0?11[\s\-]?(\d{4})[\s\-]?(\d{4})/,
      /15[\s\-]?(\d{4})[\s\-]?(\d{4})/,
      /(\d{10,11})/,
    ];

    // Buscar por labels: teléfono, celular, phone, tel
    const labelsPhone = ['teléfono', 'telefono', 'celular', 'phone', 'tel\.', 'cel\.', 'móvil', 'movil'];
    for (const label of labelsPhone) {
      const regex = new RegExp(
        `${label}[:\\s]*([+\\d][\\d\\s\\-().+]{6,20})`,
        'i'
      );
      const match = textoCompleto.match(regex);
      if (match) {
        const tel = match[1].replace(/\s+/g, ' ').trim();
        if (tel.replace(/\D/g, '').length >= 7) {
          telefono = tel;
          break;
        }
      }
    }

    // Si no encontró por label, buscar patrón genérico
    if (!telefono) {
      for (const pattern of telefonoRegexPatterns) {
        const match = textoCompleto.match(pattern);
        if (match) {
          telefono = match[0].trim();
          break;
        }
      }
    }

    return { email, telefono };
  });

  if (!datos.email && !datos.telefono) {
    await page.screenshot({ path: `debug-extraccion-${numeroTramite}.png` });
    logWarn(`No se encontraron datos de contacto. Screenshot: debug-extraccion-${numeroTramite}.png`);
  } else {
    logPaso(`Encontrado → Tel: ${datos.telefono || '—'} | Email: ${datos.email || '—'}`);
  }

  return datos;
}

async function volverAlInicio(page) {
  try {
    await page.goto(CONFIG.sgi.url, { waitUntil: 'networkidle2', timeout: 20000 });
    await delay(4000);
  } catch (_) {
    await delay(4000);
  }
}

// Devuelve true si la sesión sigue activa (campo de búsqueda visible), false si hay login
async function sesionActiva(page) {
  try {
    const campoBusqueda = await page.$('input[placeholder*="inteligente"], input[placeholder*="Búsqueda"], input[placeholder*="Busqueda"]');
    if (campoBusqueda) return true;
    // Si hay un campo de tipo password, estamos en la pantalla de login
    const campoPass = await page.$('input[type="password"]');
    if (campoPass) return false;
    return true;
  } catch (_) {
    return false;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function verificarEnv() {
  const faltantes = [];
  if (!CONFIG.sgi.user) faltantes.push('SGI_USER');
  if (!CONFIG.sgi.pass) faltantes.push('SGI_PASS');
  if (!CONFIG.sheets.spreadsheetId) faltantes.push('SPREADSHEET_ID');
  if (faltantes.length > 0) {
    throw new Error(`Variables de entorno faltantes: ${faltantes.join(', ')}\nCopiá .env.example como .env y completá los valores.`);
  }
}

// ─── Flujo principal ──────────────────────────────────────────────────────────

async function procesarTramites(filas, opts, sheets) {
  const browser = await puppeteer.launch({
    headless: CONFIG.browser.headless,
    slowMo: CONFIG.browser.slowMo,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );

  const stats = { exitosos: 0, fallidos: 0, saltados: 0 };
  let loginHecho = false;

  try {
    // Determinar filas a procesar
    let filasAProcesar = [];

    if (opts.mode === 'row') {
      // Solo la fila especificada
      const idxFila = opts.row - 1;
      if (idxFila < 0 || idxFila >= filas.length) {
        throw new Error(`La fila ${opts.row} no existe en la planilla.`);
      }
      filasAProcesar = [{ datos: filas[idxFila], numFila: opts.row }];
    } else {
      // Todas las filas desde START_ROW en adelante
      for (let i = CONFIG.startRow - 1; i < filas.length; i++) {
        const fila = filas[i];
        const numFila = i + 1;
        const tramite = fila?.[0]?.toString().trim();
        const telefono = fila?.[5]?.toString().trim(); // col F (índice 5)
        const email = fila?.[7]?.toString().trim();    // col H (índice 7)

        if (!tramite) continue;

        if (telefono && email) {
          logInfo(`Fila ${numFila} → Trámite ${tramite} ya tiene datos. Saltando.`);
          stats.saltados++;
          continue;
        }

        filasAProcesar.push({ datos: fila, numFila });

        // En modo test, solo la primera
        if (opts.mode === 'test') break;
      }
    }

    if (filasAProcesar.length === 0) {
      logOk('No hay trámites pendientes para procesar.');
      return stats;
    }

    logInfo(`Procesando ${filasAProcesar.length} trámite(s)...`);
    console.log('');

    for (let i = 0; i < filasAProcesar.length; i++) {
      const { datos, numFila } = filasAProcesar[i];
      const tramite = datos?.[0]?.toString().trim();

      if (!tramite) {
        logWarn(`Fila ${numFila} → Sin número de trámite. Saltando.`);
        stats.saltados++;
        continue;
      }

      log(`─── Trámite ${tramite} (fila ${numFila}) [${i + 1}/${filasAProcesar.length}] ───`, 'negrita');

      try {
        // Login la primera vez o si la sesión expiró
        if (!loginHecho || !(await sesionActiva(page))) {
          await hacerLogin(page);
          loginHecho = true;
        }

        await buscarTramite(page, tramite);
        const detalleAbierto = await abrirDetalleTramite(page, tramite);

        if (!detalleAbierto) {
          logErr(`No se pudo abrir el detalle del trámite ${tramite}`);
          stats.fallidos++;
        } else {
          const { telefono, email } = await extraerContacto(page, tramite);
          await escribirDatos(sheets, numFila, telefono, email);
          stats.exitosos++;
        }

        await volverAlInicio(page);

        // Delay entre trámites (salvo el último)
        if (i < filasAProcesar.length - 1) {
          logPaso(`Esperando ${CONFIG.delayBetween / 1000}s antes del siguiente...`);
          await delay(CONFIG.delayBetween);
        }

      } catch (err) {
        logErr(`Error procesando trámite ${tramite}: ${err.message}`);
        stats.fallidos++;
        // Intentar recuperar la sesión
        try {
          await page.screenshot({ path: `debug-error-${tramite}.png` });
          loginHecho = false; // Forzar re-login en el siguiente
          await page.goto(CONFIG.sgi.url, { waitUntil: 'networkidle2', timeout: 20000 });
          await delay(2000);
        } catch (_) { /* ignorar */ }
      }

      console.log('');
    }

  } finally {
    await browser.close();
  }

  return stats;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (opts.mode === 'help') {
    mostrarAyuda();
    process.exit(0);
  }

  console.log('');
  log('══════════════════════════════════════', 'cyan');
  log('  SGI Scraper — Swiss Medical', 'negrita');
  log(`  Modo: ${opts.mode.toUpperCase()}${opts.row ? ` (fila ${opts.row})` : ''}`, 'cyan');
  log(`  Browser: ${CONFIG.browser.headless ? 'headless' : 'visible'}`, 'cyan');
  log('══════════════════════════════════════', 'cyan');
  console.log('');

  try {
    verificarEnv();

    const sheets = await crearClienteSheets();
    const filas = await leerFilas(sheets);

    if (filas.length <= 1) {
      logWarn('La planilla no tiene filas de datos (solo header o está vacía).');
      process.exit(0);
    }

    const stats = await procesarTramites(filas, opts, sheets);

    console.log('');
    log('══════════════════════════════════════', 'cyan');
    log('  Resumen final', 'negrita');
    log(`  ✅ Exitosos:  ${stats.exitosos}`, 'verde');
    log(`  ❌ Fallidos:  ${stats.fallidos}`, 'rojo');
    log(`  ⏭️  Saltados:  ${stats.saltados}`, 'amarillo');
    log('══════════════════════════════════════', 'cyan');
    console.log('');

    process.exit(stats.fallidos > 0 ? 1 : 0);

  } catch (err) {
    logErr(`Error fatal: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }
}

main();
