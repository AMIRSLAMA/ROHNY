#!/usr/bin/env node
'use strict';

// ROHNY private preview server. Bound to loopback; Tailscale Serve fronts port 4174.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RIDER_DIR = path.join(ROOT, 'apps', 'rider');
const ADMIN_FILE = path.join(ROOT, 'apps', 'admin', 'index.html');
const HOST = '127.0.0.1';
const PORT = Number(process.env.ROHNY_PREVIEW_PORT || 4174);
const API_HOST = '127.0.0.1';
const API_PORT = Number(process.env.ROHNY_API_PORT || 3001);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(body);
}

function proxyApi(req, res) {
  const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` };
  const upstream = http.request({
    hostname: API_HOST,
    port: API_PORT,
    method: req.method,
    path: req.url,
    headers,
  }, (apiRes) => {
    res.writeHead(apiRes.statusCode || 502, apiRes.headers);
    apiRes.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) send(res, 502, 'ROHNY API unavailable');
    else res.destroy();
  });
  req.pipe(upstream);
}

function staticFile(req, res, pathname) {
  let file;
  if (pathname === '/' || pathname === '/rider' || pathname === '/rider/') {
    file = path.join(RIDER_DIR, 'index.html');
  } else if (pathname === '/booking-api.js') {
    file = path.join(RIDER_DIR, 'booking-api.js');
  } else if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index.html') {
    file = ADMIN_FILE;
  } else if (pathname.startsWith('/rider/')) {
    let relative;
    try { relative = decodeURIComponent(pathname.slice('/rider/'.length)); }
    catch { return send(res, 400, 'Bad path'); }
    file = path.resolve(RIDER_DIR, relative);
    if (file !== RIDER_DIR && !file.startsWith(RIDER_DIR + path.sep)) {
      return send(res, 403, 'Forbidden');
    }
  } else if (pathname === '/preview-health') {
    return send(res, 200, JSON.stringify({ status: 'ok', service: 'ROHNY preview' }), 'application/json; charset=utf-8');
  } else {
    return send(res, 404, 'Not found');
  }

  fs.readFile(file, (error, data) => {
    if (error) return send(res, error.code === 'ENOENT' ? 404 : 500, 'Not found');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { return send(res, 400, 'Bad request'); }

  const isApi = pathname.startsWith('/auth/')
    || pathname.startsWith('/wallet/')
    || pathname === '/trips'
    || pathname.startsWith('/trips/')
    || pathname === '/admin/trips'
    || pathname.startsWith('/api/');
  if (isApi) return proxyApi(req, res);
  return staticFile(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ROHNY preview listening on http://${HOST}:${PORT}\n`);
});
server.on('error', (error) => {
  process.stderr.write(`ROHNY preview failed: ${error.message}\n`);
  process.exitCode = 1;
});
