const LOCAL = 'http://127.0.0.1:4317';
const INTERVAL_MINUTES = 3;
let running;
let hostPort, hostReady, controller;
const HOST = 'com.agent_token_viewer.edge';
const meterTabs = () => chrome.tabs.query({ url: `${LOCAL}/*` });
const signal = ms => controller ? AbortSignal.any([controller.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
async function json(url) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: signal(20_000) });
  if (!response.ok) throw new Error(`取得先がHTTP ${response.status}を返しました。ブラウザーでログイン状態を確認してください。`);
  try { return await response.json(); } catch { throw new Error('ログイン画面または確認画面が返りました。サービスのWeb画面を開いてください。'); }
}
async function cursor() {
  const data = await json('https://cursor.com/api/usage-summary');
  if (!data.individualUsage?.plan) throw new Error('Cursorの利用状況の形式を確認できません。');
  return { membershipType: data.membershipType, billingCycleEnd: data.billingCycleEnd, individualUsage: data.individualUsage };
}
async function claude() {
  const organizations = await json('https://claude.ai/api/organizations');
  if (!Array.isArray(organizations) || !organizations.length) throw new Error('Claudeにログインしてください。');
  const found = [];
  for (const org of organizations) {
    if (typeof org.uuid !== 'string') continue;
    const response = await fetch(`https://claude.ai/api/organizations/${encodeURIComponent(org.uuid)}/usage`, { credentials: 'include', cache: 'no-store', signal: signal(20_000) });
    if (response.status === 403) continue;
    if (!response.ok) throw new Error(`Claudeの利用枠取得に失敗しました（HTTP ${response.status}）。`);
    const data = await response.json();
    const selected = Object.fromEntries(['five_hour', 'seven_day', 'seven_day_sonnet', 'seven_day_opus'].filter(key => data[key]).map(key => [key, { utilization: data[key].utilization, resets_at: data[key].resets_at }]));
    if (Object.keys(selected).length) found.push(selected);
  }
  if (found.length > 1) throw new Error('Claudeで複数組織の利用枠が見つかりました。取り違え防止のため取得を停止しています。');
  if (!found.length) throw new Error('Claudeの利用枠がありません。ログインと契約を確認してください。');
  return found[0];
}
async function post(token, payload) {
  const r = await fetch(`${LOCAL}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('ローカルメーターに接続できません。ページを開き直してください。');
}
function collect() {
  if (running) return running;
  running = (async () => {
    if (!(await meterTabs()).length) return;
    const { token } = await chrome.storage.local.get('token');
    if (!token) return;
    try { const health = await fetch(`${LOCAL}/api/state`, { signal: AbortSignal.timeout(3000) }); if (!health.ok || !(await health.json()).active) return; } catch { return; }
    controller = new AbortController();
    await Promise.allSettled([['cursor', cursor], ['claude', claude]].map(async ([service, read]) => {
      let payload;
      try { payload = { service, data: await read() }; }
      catch (error) { payload = { service, error: error.message }; }
      if (!controller.signal.aborted && (await meterTabs()).length) await post(token, payload);
    }));
  })().finally(() => { running = null; controller = null; });
  return running;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!sender.url?.startsWith(`${LOCAL}/`)) return false;
  if (message.type === 'pair' && typeof message.token === 'string' && /^[a-f0-9]{64}$/.test(message.token)) {
    chrome.storage.local.set({ token: message.token }).then(() => { reply({ ok: true }); schedule(); void collect(); });
    return true;
  }
  if (message.type === 'refresh') { void collect(); reply({ ok: true }); }
  return false;
});
function schedule() { chrome.alarms.create('usage', { periodInMinutes: INTERVAL_MINUTES }); }
function ensureHost() {
  if (hostReady) return hostReady;
  hostReady = new Promise((resolve, reject) => {
    let completed = false;
    const timer = setTimeout(() => fail('起動がタイムアウトしました。Edge用の初回登録を確認してください。'), 15000);
    const fail = error => {
      if (completed) return;
      completed = true; clearTimeout(timer); hostReady = null;
      hostPort?.disconnect(); hostPort = null;
      reject(new Error(error));
    };
    try {
      hostPort = chrome.runtime.connectNative(HOST);
      hostPort.onMessage.addListener(message => {
        if (message.type === 'error') return fail(message.error);
        if (message.type !== 'ready' || completed) return;
        if (!/^[a-f0-9]{64}$/.test(message.token)) return fail('起動用プログラムの応答が不正です。');
        completed = true; clearTimeout(timer);
        chrome.storage.local.set({ token: message.token }).then(() => resolve(message.url), reject);
      });
      hostPort.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message;
        hostPort = null; hostReady = null;
        if (!completed) fail(error ?? '起動用プログラムに接続できません。初回登録を確認してください。');
      });
      hostPort.postMessage({ type: 'start' });
    } catch (error) { fail(error.message); }
  });
  return hostReady;
}
async function stopIfClosed() {
  if ((await meterTabs()).length) return;
  controller?.abort();
  await chrome.alarms.clear('usage');
  hostPort?.disconnect(); hostPort = null; hostReady = null;
}
chrome.runtime.onInstalled.addListener(() => { void chrome.alarms.clear('usage'); });
chrome.runtime.onStartup.addListener(() => { void chrome.alarms.clear('usage'); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'usage') void collect(); });
chrome.tabs.onRemoved.addListener(() => { void stopIfClosed(); });
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url) void stopIfClosed(); });
chrome.action.onClicked.addListener(async () => {
  try {
    await ensureHost();
    const tabs = await meterTabs();
    if (tabs.length) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
      await chrome.tabs.reload(tabs[0].id);
    } else await chrome.tabs.create({ url: LOCAL });
    await chrome.action.setBadgeText({ text: '' });
  } catch (error) {
    await chrome.storage.local.set({ launchError: error.message });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
  }
});
