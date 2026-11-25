#!/usr/bin/env node
// Little Planet game MCP server.
//
// It drives a real Chrome-family browser through the `browse` relay and talks
// to the game's window.__lp debug surface. No browser automation packages are
// required: `browse` is installed by OpenCode, and the game exposes its state
// for exactly this kind of playtesting.
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const BROWSE = process.env.BROWSE_BIN || 'browse';
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PREVIEW_URL = process.env.LP_PREVIEW_URL || 'http://127.0.0.1:4173/';
let activeTab = null;
let previewProc = null;

function runBrowse(args, timeout = 30000) {
  const r = spawnSync(BROWSE, args, { encoding: 'utf8', timeout, windowsHide: true });
  if (r.error) throw new Error(`browse could not run: ${r.error.message}`);
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `browse exited ${r.status}`).trim());
  return (r.stdout || '').trim();
}
function parseMaybeJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}
function tabValue(value) {
  return /^\d+$/.test(String(value)) ? Number(value) : value;
}
function requireTab() {
  if (!activeTab) throw new Error('No game tab yet. Call game_open first.');
  return activeTab;
}
function evalPage(expression, timeout = 30000) {
  const raw = runBrowse(['eval', '--json', JSON.stringify({ tab: tabValue(requireTab()), expression, world: 'main', timeout })], timeout + 5000);
  return parseMaybeJson(raw);
}
function extractTab(value) {
  if (value && typeof value === 'object' && value.tab != null) return tabValue(value.tab);
  const m = String(value).match(/(?:tab[:\s]+)?(\d{4,})/i);
  return m ? Number(m[1]) : null;
}
async function ensurePreview() {
  const up = async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1200);
      const r = await fetch(PREVIEW_URL, { signal: ctrl.signal });
      clearTimeout(timer);
      return r.ok;
    } catch { return false; }
  };
  if (await up()) return;
  if (!previewProc) {
    previewProc = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
      cwd: PROJECT_ROOT, windowsHide: true, detached: true, stdio: 'ignore', shell: process.platform === 'win32',
    });
    previewProc.unref();
  }
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    if (await up()) return;
  }
  throw new Error('Vite preview did not start on ' + PREVIEW_URL);
}
async function openGame(url = PREVIEW_URL) {
  await ensurePreview();
  const openArgs = () => {
    if (activeTab) return { url, tab: tabValue(activeTab) };
    return { url, group: 'little-planet', keepOpen: true, keepVisible: true };
  };
  let out;
  try {
    out = runBrowse(['navigate', '--json', JSON.stringify(openArgs())]);
  } catch (err) {
    // The remembered tab may have been closed by the user. Fall back to a
    // fresh tab without the open-only options.
    if (!activeTab) throw err;
    activeTab = null;
    out = runBrowse(['navigate', '--json', JSON.stringify(openArgs())]);
  }
  const parsed = parseMaybeJson(out);
  const next = extractTab(parsed);
  if (next) activeTab = next;
  if (!activeTab) throw new Error('Could not determine the browse tab id from: ' + out);
  for (let i = 0; i < 30; i++) {
    try {
      if (evalPage('!!window.__lp') === true) break;
    } catch { /* page may still be booting */ }
    await sleep(300);
  }
  return { tab: activeTab, title: evalPage('document.title') };
}
async function startGame() {
  // Open the slot picker.
  evalPage(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/New Game/i.test(x.textContent)); if (b) { b.click(); return true; } return false; })()`);
  await sleep(450);
  // Only use an empty slot. Never overwrite an existing life from the tool.
  const clicked = evalPage(`(() => {
    const empty=[...document.querySelectorAll('button')].find(x=>/Empty/i.test(x.textContent));
    if (empty) { empty.click(); return 'empty'; }
    return 'none';
  })()`);
  if (clicked !== 'empty') {
    return { started: false, reason: 'No empty save slot. Clear a slot in the game UI first; the MCP server will not overwrite a life.' };
  }
  await sleep(1200);
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const ok = evalPage(`!!window.__lp && window.__lp.player.position.length() > 1 && !document.body.innerText.includes('New Game')`);
      if (ok === true) return { started: true, slot: clicked };
    } catch { /* reloading */ }
  }
  return { started: false, slot: clicked };
}
function stateExpression() {
  return `(() => {
    const lp = window.__lp;
    if (!lp) return { ready: false };
    const p = lp.player.position.clone().normalize();
    const lat = Math.asin(p.y) / Math.PI * 180;
    let lon = Math.atan2(p.z, p.x) / Math.PI * 180; if (lon < 0) lon += 360;
    const artifacts = (lp.artifacts && lp.artifacts.list) ? lp.artifacts.list : [];
    const claimed = (lp.artifacts && lp.artifacts.claimed) ? lp.artifacts.claimed : {};
    return {
      ready: true,
      day: lp.life.day, season: lp.season ? lp.season() : null, level: lp.rpg.level,
      health: Math.round(lp.meters.health), energy: Math.round(lp.meters.energy),
      biome: lp.terrain.biome(lat, lon), lat: +lat.toFixed(1), lon: +lon.toFixed(1),
      techEra: lp.tech.era(), techs: lp.tech.list.filter(t => lp.tech.has(t.id)).map(t => t.name),
      artifacts: artifacts.filter(a => claimed[a.id]).map(a => a.name),
      artifactCount: Object.keys(claimed).length,
      wildlife: (lp.ambient.list || []).filter(e => e.hunt && !e.dead).length,
      seaLife: (lp.seaLife || []).filter(e => !e.dead).map(e => e.kind),
      travellers: (lp.travellers || []).map(t => ({ kind: t.kind, title: t.title })),
    };
  })()`;
}

const TOOLS = [
  {
    name: 'game_open',
    description: 'Start the local Vite preview (if needed) and open Little Planet in Chrome. Returns the browse tab id.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'Optional URL; defaults to the local preview.' } } },
  },
  {
    name: 'game_start',
    description: 'Start a fresh game from the title screen, using an empty slot when available.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'game_state',
    description: 'Read a compact snapshot: day, level, biome, health, techs, artifacts, wildlife and sea life.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'game_eval',
    description: 'Run JavaScript in the page main world and return its JSON result. Use window.__lp for game state.',
    inputSchema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] },
  },
  {
    name: 'game_teleport',
    description: 'Fast-travel the explorer to a latitude/longitude on the planet.',
    inputSchema: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' } }, required: ['lat', 'lon'] },
  },
  {
    name: 'game_press',
    description: 'Press a key in the game tab (WASD, E, H, L, Shift, etc.).',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
  },
  {
    name: 'game_screenshot',
    description: 'Capture the game tab to a PNG and return the saved path.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  },
  {
    name: 'game_artifact_hints',
    description: 'List every biome relic, its guardian/task and whether it has been claimed.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'game_close',
    description: 'Close the game tab opened by this server.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function callTool(name, args = {}) {
  if (name === 'game_open') return openGame(args.url || PREVIEW_URL);
  if (name === 'game_start') return startGame();
  if (name === 'game_state') return evalPage(stateExpression());
  if (name === 'game_eval') return evalPage(String(args.expression || 'null'));
  if (name === 'game_teleport') {
    const lat = Number(args.lat), lon = Number(args.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('lat and lon must be numbers');
    return evalPage(`(() => { window.__lp.goto(${lat}, ${lon}, ${lat}, ${lon}); return { ok: true, lat: ${lat}, lon: ${lon} }; })()`);
  }
  if (name === 'game_press') {
    const out = runBrowse(['press', String(args.key || 'E'), '--tab', String(tabValue(requireTab()))]);
    return { ok: true, output: out };
  }
  if (name === 'game_screenshot') {
    const out = runBrowse(['screenshot', '--tab', String(tabValue(requireTab())), '--output', String(args.path || 'little-planet.png')]);
    return { ok: true, output: out };
  }
  if (name === 'game_artifact_hints') {
    return evalPage(`(() => {
      const lp = window.__lp;
      if (!lp || !lp.artifacts) return [];
      return lp.artifacts.list.map(a => ({
        id: a.id, name: a.name, biome: a.biome, claimed: !!lp.artifacts.claimed[a.id],
        guardian: a.guardianName || a.guardianNpc || 'unknown', task: a.taskHint || '', tech: a.tech,
      }));
    })()`);
  }
  if (name === 'game_close') {
    if (!activeTab) return { closed: false };
    runBrowse(['tabs', 'close', '--tab', String(tabValue(activeTab))]);
    const closed = activeTab;
    activeTab = null;
    return { closed: true, tab: closed };
  }
  throw new Error('Unknown tool: ' + name);
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'little-planet', version: '0.1.0' },
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') { reply(id, {}); return; }
  if (method === 'tools/list') { reply(id, { tools: TOOLS }); return; }
  if (method === 'tools/call') {
    try {
      const result = await callTool(params?.name, params?.arguments || {});
      reply(id, { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
    } catch (err) {
      reply(id, { content: [{ type: 'text', text: String(err?.message || err) }], isError: true });
    }
    return;
  }
  if (id != null) replyError(id, -32601, 'Method not found: ' + method);
});
