#!/usr/bin/env node
'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.DASHBOARD_PORT || 3000;

// Estado global del scraper
let scraperProcess = null;
let scraperStats = {
  estado: 'detenido',
  exitosos: 0,
  fallidos: 0,
  saltados: 0,
  tramiteActual: null,
  iniciado: null,
  logs: []
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json(scraperStats);
});

app.post('/api/start', (req, res) => {
  if (scraperProcess) {
    return res.status(400).json({ error: 'El scraper ya está ejecutándose' });
  }

  const { mode, row } = req.body;
  const args = [];

  if (mode === 'test') {
    args.push('--test');
  } else if (mode === 'row' && row) {
    args.push('--row', row);
  }

  // Resetear stats
  scraperStats = {
    estado: 'ejecutando',
    exitosos: 0,
    fallidos: 0,
    saltados: 0,
    tramiteActual: null,
    iniciado: new Date().toISOString(),
    logs: []
  };

  // Iniciar scraper con las variables de entorno correctas
  // NO heredar process.env, usar solo las variables necesarias del .env
  const dotenv = require('dotenv');
  const envConfig = dotenv.config({ path: path.resolve(__dirname, '../.env') }).parsed || {};

  scraperProcess = spawn('node', [path.join(__dirname, '../scraper.js'), ...args], {
    env: {
      ...envConfig,
      SHOW_BROWSER: 'true',
      PATH: process.env.PATH,
      HOME: process.env.HOME
    }
  });

  scraperProcess.stdout.on('data', (data) => {
    const log = data.toString();
    agregarLog('info', log);
    parsearEstadisticas(log);
  });

  scraperProcess.stderr.on('data', (data) => {
    agregarLog('error', data.toString());
  });

  scraperProcess.on('close', (code) => {
    scraperStats.estado = code === 0 ? 'completado' : 'error';
    agregarLog('info', `Scraper finalizado con código: ${code}`);
    scraperProcess = null;
    io.emit('status', scraperStats);
  });

  io.emit('status', scraperStats);
  res.json({ success: true, message: 'Scraper iniciado' });
});

app.post('/api/stop', (req, res) => {
  if (!scraperProcess) {
    return res.status(400).json({ error: 'El scraper no está ejecutándose' });
  }

  scraperProcess.kill('SIGTERM');
  scraperStats.estado = 'detenido';
  agregarLog('warning', 'Scraper detenido por el usuario');
  io.emit('status', scraperStats);

  res.json({ success: true, message: 'Scraper detenido' });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: scraperStats.logs });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Cliente conectado al dashboard');
  socket.emit('status', scraperStats);

  socket.on('disconnect', () => {
    console.log('Cliente desconectado del dashboard');
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function agregarLog(tipo, mensaje) {
  const timestamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
  const log = {
    timestamp,
    tipo,
    mensaje: mensaje.trim()
  };

  scraperStats.logs.push(log);

  // Mantener solo los últimos 200 logs
  if (scraperStats.logs.length > 200) {
    scraperStats.logs.shift();
  }

  io.emit('log', log);
}

function parsearEstadisticas(log) {
  // Parsear estadísticas del output del scraper
  if (log.includes('✅ Exitosos:')) {
    const match = log.match(/✅ Exitosos:\s*(\d+)/);
    if (match) scraperStats.exitosos = parseInt(match[1]);
  }

  if (log.includes('❌ Fallidos:')) {
    const match = log.match(/❌ Fallidos:\s*(\d+)/);
    if (match) scraperStats.fallidos = parseInt(match[1]);
  }

  if (log.includes('⏭️  Saltados:')) {
    const match = log.match(/⏭️  Saltados:\s*(\d+)/);
    if (match) scraperStats.saltados = parseInt(match[1]);
  }

  if (log.includes('Trámite #')) {
    const match = log.match(/Trámite #(\S+)/);
    if (match) scraperStats.tramiteActual = match[1];
  }

  io.emit('status', scraperStats);
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║                                                        ║');
  console.log('║          🖥️  SGI Scraper Dashboard                     ║');
  console.log('║                                                        ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  🌐 Dashboard: http://localhost:${PORT}`);
  console.log('');
  console.log('  Presiona Ctrl+C para detener el servidor');
  console.log('');
});

// Manejo de cierre
process.on('SIGINT', () => {
  console.log('\n\nCerrando dashboard...');
  if (scraperProcess) {
    scraperProcess.kill('SIGTERM');
  }
  process.exit(0);
});
