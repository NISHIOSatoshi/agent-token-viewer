const SERVICES = { codex: { name: 'Codex', glyph: '◎', className: 'codex', href: 'https://chatgpt.com/codex/settings/usage' }, claude: { name: 'Claude', glyph: '✳', className: 'claude', href: 'https://claude.ai/settings/usage' }, cursor: { name: 'Cursor', glyph: '◈', className: 'cursor', href: 'https://cursor.com/dashboard/spending' } };
const WARN_USED_PERCENT = 50; // 使用量がこの値以上で黄
const DANGER_USED_PERCENT = 75; // 使用量がこの値以上で赤
const POLL_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const STARTUP_SYNC_MS = 30_000; // 起動直後に更新中表示を続ける最長時間
const pageOpenedAt = Date.now();
const MODE_KEY = 'agent-viewer-display-mode';
const viewerId =crypto.randomUUID();
let setup, current, bridgeConnected = false, manualRefreshing = false;
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const date = value => new Date(value).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const pct = value => value.toLocaleString('ja-JP', { maximumFractionDigits: 0 });
function relativeTime(timestamp, now = Date.now()) {
  const elapsed = now - Date.parse(timestamp);
  if (!Number.isFinite(elapsed)) return '不明';
  const seconds = Math.max(0, Math.floor(elapsed / 1000));
  if (seconds < 10) return 'たった今';
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}
function countdown(timestamp) {
  const minutes = Math.ceil((Date.parse(timestamp) - Date.now()) / 60000);
  if (minutes <= 0) return 'リセット後・更新待ち';
  if (minutes >= 1440) return `あと${Math.floor(minutes / 1440)}日${Math.floor(minutes % 1440 / 60)}時間`;
  return `あと${Math.floor(minutes / 60)}時間${minutes % 60}分`;
}
// 起動後、このページ開始以降の取得が届くまで（上限あり）は更新中として扱う。
function isStartupSyncing(service) {
  if (Date.now() - pageOpenedAt >= STARTUP_SYNC_MS) return false;
  return !(service.updatedAt && Date.parse(service.updatedAt) >= pageOpenedAt);
}
const isSyncing = service => manualRefreshing || isStartupSyncing(service);
// 表示モード（使用量/残量）。既定は使用量で、選択はブラウザーに保存する。
let showUsed = (() => { try { return localStorage.getItem(MODE_KEY) !== 'remaining'; } catch { return true; } })();
function updateModeButton() { document.querySelector('#mode-toggle').textContent = showUsed ? '⚙ 表示: 使用量' : '⚙ 表示: 残量'; }
function toggleMode() {
  showUsed = !showUsed; try { localStorage.setItem(MODE_KEY, showUsed ? 'used' : 'remaining'); } catch {}
  updateModeButton(); if (current) render(current);
}
function render(data) {
  const container = document.querySelector('#services'); container.replaceChildren();
  for (const service of data.services) {
    const info = SERVICES[service.id]; const card = el('article', `card ${info.className}`);
    const head = el('div', 'card-head'); const brand = el('div', 'brand'); brand.append(el('span', 'glyph', info.glyph), el('h2', '', info.name));
    head.append(brand, el('span', 'plan', service.plan ?? '—')); card.append(head);
    const stale = !service.updatedAt || service.stale || Date.now() - Date.parse(service.updatedAt) > 360_000;
    const syncing = isSyncing(service);
    const status = syncing ? '更新中…' : service.error ? '取得失敗' : !service.updatedAt ? '未接続' : stale ? '古いデータ' : '取得済み';
    card.append(el('div', `status ${syncing ? 'syncing' : service.error || stale ? 'uncertain' : ''}`, status)); if (syncing) card.classList.add('is-syncing');
    const meters = service.meters.length ? service.meters : [{ label: '利用枠', remainingPercent: null }];
    for (const meter of meters) {
      const expired = meter.resetsAt && Date.parse(meter.resetsAt) <= Date.now();
      const known = meter.remainingPercent != null && !expired;
      const level = !known || stale || service.error ? 'unknown' : meter.usedPercent >= DANGER_USED_PERCENT ? 'danger' : meter.usedPercent >= WARN_USED_PERCENT ? 'warn' : 'good';
      const block = el('div', `meter ${level}`); block.append(el('div', 'meter-label', meter.label));
      const shown = showUsed ? meter.usedPercent : meter.remainingPercent; const other = showUsed ? meter.remainingPercent : meter.usedPercent;
      const value = el('div', 'value'); value.append(el('span', 'number', known ? pct(shown) : '—')); if (known) value.append(el('span', 'unit', '%')); value.append(el('span', 'remaining', showUsed ? '使用' : '残り')); block.append(value);
      const track = el('div', 'track'); track.setAttribute('role', 'meter'); track.setAttribute('aria-label', `${meter.label}の${showUsed ? '使用量' : '残量'}`); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
      if (known) track.setAttribute('aria-valuenow', Math.min(100, shown)); else track.setAttribute('aria-valuetext', '不明');
      const fill = el('div', 'fill'); fill.style.width = known ? `${Math.min(100, shown)}%` : '0%'; track.append(fill); block.append(track);
      block.append(el('p', 'consumed', known ? `${showUsed ? '残り' : '使用'} ${pct(other)}%${stale || service.error ? ' · 最後に取得した値' : ''}` : expired ? 'リセット後の値は未取得です' : `取得待ち・${showUsed ? '使用量' : '残量'}は不明です`));
      if (meter.resetsAt) { const reset = el('div', 'reset'); reset.append(el('span', '', `${meter.resetLabel ?? 'リセット'} ${date(meter.resetsAt)}`), el('strong', '', countdown(meter.resetsAt))); block.append(reset); }
      card.append(block);
    }
    if (service.error) card.append(el('p', 'error', service.error));
    if (service.note) card.append(el('p', 'note', service.note));
    const bottom = el('div', 'card-bottom');
    const lastUpdated = el('span', '', service.updatedAt ? `最終取得 ${relativeTime(service.updatedAt)} · ${service.source}` : 'ブラウザー連携を設定してください');
    if (service.updatedAt) lastUpdated.title = new Date(service.updatedAt).toLocaleString('ja-JP');
    bottom.append(lastUpdated);
    const link = el('a', '', '利用状況 ↗'); link.href = info.href; link.target = '_blank'; link.rel = 'noreferrer'; bottom.append(link); card.append(bottom); container.append(card);
  }
  const updatedTimes = data.services.map(service => Date.parse(service.updatedAt)).filter(Number.isFinite);
  const latestUpdate = updatedTimes.length ? new Date(Math.max(...updatedTimes)).toISOString() : null;
  const anySyncing = data.services.some(isSyncing);
  document.querySelector('#clock').textContent = anySyncing ? (manualRefreshing ? '更新中…' : '起動時の更新中…') : latestUpdate ? `最終取得 ${relativeTime(latestUpdate)}` : '最終取得 未取得';
}
async function load() {
  try { const r = await fetch('/api/state'); if (!r.ok) throw new Error(); current = await r.json(); render(current); }
  catch { if (current) { for (const s of current.services) s.error = 'サーバーに接続できません。起動ウィンドウを確認してください。'; render(current); } document.querySelector('#clock').textContent = 'サーバーとの接続が切れました'; }
}
window.addEventListener('agent-viewer-connected', () => { bridgeConnected = true; document.querySelector('#bridge').textContent = '拡張に接続済み'; document.querySelector('#setup').open = false; });
async function init() {
  const r = await fetch('/api/setup'); setup = await r.json();
  const meta = document.createElement('meta'); meta.name = 'agent-viewer-key'; meta.content = setup.token; document.head.append(meta);
  document.querySelector('#extension-path').textContent = setup.extensionPath;
  await heartbeat();
  window.dispatchEvent(new Event('agent-viewer-ready'));
  setTimeout(() => { if (!bridgeConnected) { document.querySelector('#bridge').textContent = '拡張未接続'; document.querySelector('#setup').open = true; } }, 2500);
  void refreshNow().catch(() => {});
  await load();
}
async function heartbeat(closed = false) {
  if (!setup) return;
  await fetch('/api/viewer', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setup.token}` }, body: JSON.stringify({ id: viewerId, closed }), keepalive: closed });
}
window.addEventListener('pagehide', () => { void heartbeat(true).catch(() => {}); });
window.addEventListener('pageshow', event => { if (event.persisted) { void heartbeat().catch(() => {}); window.dispatchEvent(new Event('agent-viewer-ready')); } });
document.querySelector('#copy-path').onclick = async () => { await navigator.clipboard.writeText(setup.extensionPath); document.querySelector('#copy-path').textContent = 'コピーしました'; };
// 「今すぐ更新」ボタンの押下と同じ処理。起動時にも自動で実行する。
async function refreshNow() {
  if (manualRefreshing) return;
  const button = document.querySelector('#refresh'); button.disabled = true; button.textContent = '更新中…'; manualRefreshing = true; if (current) render(current);
  try { await fetch('/api/refresh', { method: 'POST', headers: { Authorization: `Bearer ${setup.token}` } }); window.dispatchEvent(new Event('agent-viewer-refresh')); await new Promise(resolve => setTimeout(resolve, 2000)); await load(); }
  finally { manualRefreshing = false; if (current) render(current); button.disabled = false; button.textContent = '今すぐ更新 ↻'; }
}
document.querySelector('#refresh').onclick = refreshNow;
document.querySelector('#mode-toggle').onclick = toggleMode; updateModeButton();
init().catch(() => { document.querySelector('#bridge').textContent = 'サーバーに接続できません'; });
setInterval(load, POLL_MS);
setInterval(() => { void heartbeat().catch(() => {}); }, HEARTBEAT_MS);
