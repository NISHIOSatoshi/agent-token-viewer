import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCodex } from './lib/codex.mjs';
import { normalizeCodex, normalizeClaude, normalizeCursor, present, REFRESH_MS } from './lib/usage.mjs';
import { createViewers } from './lib/viewers.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const local = path.join(root, '.local');
const port = Number(process.env.PORT ?? 4317);
const origin = `http://127.0.0.1:${port}`;
await mkdir(local, { recursive: true });
let token;
try { token = (await readFile(path.join(local, 'connection-key'), 'utf8')).trim(); }
catch { token = randomBytes(32).toString('hex'); await writeFile(path.join(local, 'connection-key'), token, { mode: 0o600 }); }
const initial = id => ({ id, plan: null, source: null, meters: [], updatedAt: null, error: null });
const state = Object.fromEntries(['codex', 'claude', 'cursor'].map(id => [id, initial(id)]));
const viewers = createViewers();
let lastAttempt = 0;
try {
  const saved = JSON.parse(await readFile(path.join(local, 'snapshot.json'), 'utf8'));
  for (const id of Object.keys(state)) if (saved[id]?.id === id && Array.isArray(saved[id].meters)) state[id] = saved[id];
} catch { /* 初回は未取得で開始する。 */ }
let writeQueue = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(state);
  writeQueue = writeQueue.catch(() => {}).then(() => writeFile(path.join(local, 'snapshot.json'), snapshot));
  writeQueue.catch(() => console.error('利用状況の保存に失敗しました。'));
}
function receive(id, data, source, collectedAt) {
  if (!['claude', 'cursor', 'codex'].includes(id)) throw new Error('サービスが不正です。');
  const normal = id === 'codex' ? normalizeCodex(data) : id === 'cursor' ? normalizeCursor(data) : normalizeClaude(data, source);
  if (!normal.meters.length || normal.meters.every(m => m.usedPercent == null)) throw new Error('有効な利用枠がありません。プランとログイン状態を確認してください。');
  // statusLine経由の更新ではプランが届かないため、直前のWeb取得の値を引き継ぐ。
  if (source === 'statusline' && normal.plan == null) normal.plan = state[id].plan;
  state[id] = { id, ...normal, source, updatedAt: collectedAt ?? new Date().toISOString(), error: null };
  persist();
}
let refreshing;
function refreshCodex() {
  if (refreshing) return refreshing;
  lastAttempt = Date.now();
  refreshing = (async () => {
    try { receive('codex', await readCodex(), '公式 App Server'); }
    catch (error) { state.codex.error = error.message; persist(); }
    finally { refreshing = null; }
  })();
  return refreshing;
}
function authorized(request) {
  const supplied = Buffer.from(request.headers.authorization?.replace(/^Bearer /, '') ?? '');
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function readBody(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 128_000) throw new Error('リクエストが大きすぎます。');
  }
  return JSON.parse(text);
}
const publicFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
const server = http.createServer(async (request, response) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const remoteOrigin = request.headers.origin;
  const extensionOrigin = typeof remoteOrigin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(remoteOrigin);
  if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) { response.writeHead(403); return response.end(); }
  const reply = (code, body) => { response.writeHead(code, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); };
  if (remoteOrigin && ![origin, `http://localhost:${port}`].includes(remoteOrigin) && !extensionOrigin) return reply(403, { error: '許可されていない接続元です。' });
  if (extensionOrigin) Object.assign(headers, { 'Access-Control-Allow-Origin': remoteOrigin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  if (request.method === 'OPTIONS') { response.writeHead(204, headers); return response.end(); }
  const url = new URL(request.url, origin);
  try {
    if (url.pathname === '/api/state' && request.method === 'GET') return reply(200, { app: 'agent-token-viewer', version: 2, active: viewers.active(), services: Object.values(state).map(record => present(record)), refreshMs: REFRESH_MS });
    if (url.pathname === '/api/setup' && request.method === 'GET') {
      if (extensionOrigin || request.headers['sec-fetch-site'] === 'cross-site') return reply(403, {});
      return reply(200, { token, extensionPath: path.join(root, 'extension') });
    }
    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      if (!authorized(request)) return reply(401, {});
      if (!viewers.active()) return reply(409, { error: 'メーターを開いてください。' });
      void refreshCodex(); return reply(202, { ok: true });
    }
    if (url.pathname === '/api/viewer' && request.method === 'POST') {
      if (!authorized(request)) return reply(401, {});
      const body = await readBody(request);
      if (typeof body.id !== 'string' || body.id.length > 100) return reply(400, {});
      const wasActive = viewers.active();
      if (body.closed) viewers.remove(body.id); else viewers.touch(body.id);
      if (!body.closed && (!wasActive || Date.now() - lastAttempt >= REFRESH_MS)) void refreshCodex();
      return reply(200, { active: viewers.active() });
    }
    if (url.pathname === '/api/ingest' && request.method === 'POST') {
      if (!authorized(request)) return reply(401, {});
      const body = await readBody(request);
      if (!['cursor', 'claude'].includes(body.service)) return reply(400, { error: 'サービスが不正です。' });
      if (body.error) {
        state[body.service].error = String(body.error).slice(0, 300); persist();
      } else receive(body.service, body.data, body.source === 'statusline' ? 'statusline' : 'Web 利用状況');
      return reply(200, { ok: true });
    }
    if (request.method === 'GET' && publicFiles[url.pathname]) {
      const [file, type] = publicFiles[url.pathname];
      response.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
      return response.end(await readFile(path.join(root, 'public', file)));
    }
    return reply(404, { error: '見つかりません。' });
  } catch (error) { return reply(400, { error: error.message }); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `ポート${port}は使用中です。既存のメーターを確認してください。` : error.message); process.exitCode = 1; });
export const ready = new Promise((resolve, reject) => {
server.once('error', reject);
server.listen(port, '127.0.0.1', () => {
  if (process.env.NATIVE_HOST !== '1') console.log(`Agent Token Viewer: ${origin}`);
  resolve();
  if (process.env.OPEN_BROWSER === '1' && process.platform === 'win32') {
    const browser = spawn('explorer.exe', [origin], { windowsHide: true, stdio: 'ignore' });
    browser.on('error', () => console.error(`ブラウザーで ${origin} を開いてください。`));
  }
});
});
ready.catch(() => {});
setInterval(() => { if (viewers.active() && Date.now() - lastAttempt >= REFRESH_MS) void refreshCodex(); }, 5000).unref();
// 公式statusLineから保存されたデータはWeb取得より新しい場合のみ採用する。
setInterval(async () => {
  if (!viewers.active()) return;
  try {
    const saved = JSON.parse(await readFile(path.join(local, 'claude-status.json'), 'utf8'));
    if (Date.parse(saved.collectedAt) > Date.parse(state.claude.updatedAt ?? '1970-01-01')) receive('claude', saved.data, 'statusline', saved.collectedAt);
  } catch (error) { if (error.code !== 'ENOENT') console.error('Claudeの公式出力ファイルを読み取れませんでした。'); }
}, 5000).unref();
