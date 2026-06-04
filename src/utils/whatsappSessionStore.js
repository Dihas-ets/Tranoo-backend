const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../../data/whatsapp-sessions.json');
const WINDOW_MS = 24 * 60 * 60 * 1000;

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(data) {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 0));
}

function recordInbound(waId) {
  const id = String(waId || '').replace(/\D/g, '');
  if (!id || id.length < 8) return;
  const store = readStore();
  store[id] = { lastInboundAt: Date.now() };
  writeStore(store);
}

function hasOpenSession(waId) {
  const id = String(waId || '').replace(/\D/g, '');
  if (!id) return false;
  const entry = readStore()[id];
  if (!entry?.lastInboundAt) return false;
  return Date.now() - entry.lastInboundAt < WINDOW_MS;
}

function sessionAgeMinutes(waId) {
  const id = String(waId || '').replace(/\D/g, '');
  const entry = readStore()[id];
  if (!entry?.lastInboundAt) return null;
  return Math.floor((Date.now() - entry.lastInboundAt) / 60000);
}

module.exports = {
  recordInbound,
  hasOpenSession,
  sessionAgeMinutes,
  WINDOW_MS,
};
