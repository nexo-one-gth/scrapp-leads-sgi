#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

console.log('\n🔍 Verificando configuración del SGI Scraper...\n');

// Verificar archivo .env
const envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.log('❌ No se encontró el archivo .env');
  console.log('   Copia .env.example como .env y configúralo\n');
  process.exit(1);
}

// Leer y parsear .env
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

console.log('📋 Variables de entorno:\n');

const checks = [
  { name: 'SGI_USER', label: 'Usuario SGI', required: true },
  { name: 'SGI_PASS', label: 'Contraseña SGI', required: true, hide: true },
  { name: 'SGI_URL', label: 'URL SGI', required: true },
  { name: 'SPREADSHEET_ID', label: 'ID de la planilla', required: true },
  { name: 'SHEET_NAME', label: 'Nombre de la hoja', required: true },
  { name: 'SHOW_BROWSER', label: 'Mostrar navegador', required: false },
  { name: 'DELAY_BETWEEN', label: 'Delay entre trámites', required: false },
  { name: 'START_ROW', label: 'Fila de inicio', required: false }
];

let allOk = true;

checks.forEach(check => {
  const value = envVars[check.name];
  const isDefault = value && (
    value.includes('tu_') ||
    value.includes('Nombre_de_la_pestaña') ||
    value === 'tu_usuario' ||
    value === 'tu_contraseña'
  );

  if (!value && check.required) {
    console.log(`❌ ${check.label} (${check.name}): NO CONFIGURADO`);
    allOk = false;
  } else if (isDefault) {
    console.log(`⚠️  ${check.label} (${check.name}): VALOR POR DEFECTO (necesita configuración)`);
    allOk = false;
  } else if (value) {
    const displayValue = check.hide ? '********' : value;
    console.log(`✅ ${check.label} (${check.name}): ${displayValue}`);
  } else {
    console.log(`⚪ ${check.label} (${check.name}): No configurado (opcional)`);
  }
});

// Verificar credentials.json
console.log('\n📁 Archivos:\n');

const credPath = path.resolve(__dirname, 'credentials.json');
if (!fs.existsSync(credPath)) {
  console.log('❌ credentials.json: NO ENCONTRADO');
  console.log('   Descarga el archivo de credenciales de Google Service Account\n');
  allOk = false;
} else {
  try {
    const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    console.log(`✅ credentials.json: OK`);
    console.log(`   Service Account: ${cred.client_email}`);
  } catch (err) {
    console.log('❌ credentials.json: INVÁLIDO (no es JSON válido)');
    allOk = false;
  }
}

// Verificar node_modules
const nmPath = path.resolve(__dirname, 'node_modules');
if (!fs.existsSync(nmPath)) {
  console.log('❌ node_modules: NO ENCONTRADO');
  console.log('   Ejecuta: npm install\n');
  allOk = false;
} else {
  console.log('✅ node_modules: OK');
}

// Resumen final
console.log('\n' + '═'.repeat(50) + '\n');

if (allOk) {
  console.log('🎉 ¡Configuración completa!\n');
  console.log('Para iniciar el dashboard ejecuta:');
  console.log('   npm run dashboard\n');
  console.log('Luego abre en el navegador:');
  console.log('   http://localhost:3000\n');
} else {
  console.log('⚠️  Hay problemas en la configuración\n');
  console.log('Revisa los errores anteriores y corrígelos antes de continuar.\n');
  process.exit(1);
}
