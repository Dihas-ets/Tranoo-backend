#!/usr/bin/env node
/**
 * Vérifie que chaque endpoint Express monté est documenté dans src/docs/openapi/paths/.
 * Usage: npm run swagger:verify
 */
const fs = require('fs');
const path = require('path');
const { loadPaths } = require('../src/docs/openapi');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'src', 'app.js');
const ROUTES_DIR = path.join(ROOT, 'src', 'routes');

/** Normalise :id → {id} */
function normalizePath(p) {
  return p
    .replace(/\/+/g, '/')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/\/$/, '') || '/';
}

function joinMount(mount, routePath) {
  const base = mount.endsWith('/') ? mount.slice(0, -1) : mount;
  if (!routePath || routePath === '/') return normalizePath(base || '/');
  const sub = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return normalizePath(`${base}${sub}`);
}

/** Lit app.js séquentiellement : require('./routes/x') puis app.use('/api/...') */
function parseAppMounts() {
  const src = fs.readFileSync(APP_JS, 'utf8');
  const lines = src.split('\n');
  const mounts = [];
  let lastRouteFile = null;

  for (const line of lines) {
    const reqMatch = line.match(/require\('\.\/routes\/([^']+)'\)/);
    if (reqMatch && !line.trim().startsWith('//')) {
      lastRouteFile = `${reqMatch[1]}.js`;
    }

    const useMatch = line.match(/app\.use\(\s*['"](\/api[^'"]*)['"]/);
    if (useMatch && lastRouteFile && !line.trim().startsWith('//')) {
      const prefix = useMatch[1].replace(/\/$/, '');
      if (prefix !== '/api-docs') {
        mounts.push({ prefix, routeFile: lastRouteFile });
      }
    }

    if (/app\.get\(\s*['"]\/['"]/.test(line) && !line.trim().startsWith('//')) {
      mounts.push({ prefix: '', routeFile: '__health__' });
    }
  }

  return mounts;
}

function parseRouteFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const endpoints = [];
  const re = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi;
  let m;
  while ((m = re.exec(src))) {
    endpoints.push({ method: m[1].toLowerCase(), routePath: m[2] });
  }
  return endpoints;
}

function collectExpressEndpoints() {
  const mounts = parseAppMounts();
  const expressPaths = new Map();

  for (const { prefix, routeFile } of mounts) {
    if (routeFile === '__health__') {
      expressPaths.set('GET /', true);
      continue;
    }
    const filePath = path.join(ROUTES_DIR, routeFile);
    if (!fs.existsSync(filePath)) continue;

    for (const { method, routePath } of parseRouteFile(filePath)) {
      const full = joinMount(prefix, routePath);
      expressPaths.set(`${method.toUpperCase()} ${full}`, true);
    }
  }

  return expressPaths;
}

function collectDocumentedEndpoints() {
  const paths = loadPaths();
  const documented = new Map();

  for (const [route, methods] of Object.entries(paths)) {
    const normRoute = normalizePath(route);
    for (const method of Object.keys(methods)) {
      if (method === 'parameters' || method === 'summary' || method === 'description') continue;
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
        documented.set(`${method.toUpperCase()} ${normRoute}`, true);
      }
    }
  }

  return documented;
}

/** Alias invoice : /api/invoice et /api/factures = même routes que /api/invoices */
function expandAliases(express) {
  const expanded = new Map(express);
  for (const key of express.keys()) {
    if (key.includes(' /api/invoices')) {
      const method = key.split(' ')[0];
      const route = key.slice(key.indexOf(' ') + 1);
      expanded.set(`${method} ${route.replace('/api/invoices', '/api/invoice')}`, true);
      expanded.set(`${method} ${route.replace('/api/invoices', '/api/factures')}`, true);
    }
  }
  return expanded;
}

function main() {
  const express = expandAliases(collectExpressEndpoints());
  const documented = collectDocumentedEndpoints();

  const missing = [];
  for (const key of express.keys()) {
    if (!documented.has(key)) missing.push(key);
  }

  const extra = [];
  for (const key of documented.keys()) {
    if (!express.has(key)) extra.push(key);
  }

  const totalExpress = express.size;
  const covered = totalExpress - missing.length;

  console.log(`\n📋 Swagger coverage: ${covered}/${totalExpress} endpoints documentés\n`);

  if (missing.length) {
    console.log('❌ Manquants dans la doc OpenAPI:');
    missing.sort().forEach((k) => console.log(`   ${k}`));
  }

  if (extra.length) {
    console.log('\n⚠️  Documentés mais absents des routes montées (vérifier manuellement):');
    extra.sort().forEach((k) => console.log(`   ${k}`));
  }

  if (!missing.length) {
    console.log('\n✅ Tous les endpoints montés sont documentés.');
  } else {
    console.log(`\n➡️  Ajouter les manquants dans src/docs/openapi/paths/`);
    process.exit(1);
  }
}

main();
