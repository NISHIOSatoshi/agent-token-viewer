const SERVICES = { codex: { name: 'Codex', icon: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z", className: 'codex', href: 'https://chatgpt.com/codex/settings/usage' }, claude: { name: 'Claude', icon: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z", className: 'claude', href: 'https://claude.ai/settings/usage' }, cursor: { name: 'Cursor', icon: "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23", className: 'cursor', href: 'https://cursor.com/dashboard/spending' } };
const WARN_USED_PERCENT = 50; // 使用量がこの値以上で黄
const DANGER_USED_PERCENT = 75; // 使用量がこの値以上で赤
// ブランドアイコン（Simple Icons、24x24 の SVG パス）を描画する。
const iconNode = pathData => {
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); const path = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'glyph'); path.setAttribute('d', pathData); path.setAttribute('fill', 'currentColor'); svg.append(path); return svg;
};
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
    const head = el('div', 'card-head'); const brand = el('div', 'brand'); brand.append(iconNode(info.icon), el('h2', '', info.name));
    head.append(brand, el('span', 'plan', service.plan ?? '—')); card.append(head);
    const stale = !service.updatedAt || service.stale || Date.now() - Date.parse(service.updatedAt) > 360_000;
    const syncing = isSyncing(service);
    if (syncing) card.classList.add('is-syncing');
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
