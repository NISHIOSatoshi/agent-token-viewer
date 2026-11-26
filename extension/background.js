import { normalizeCodex, normalizeClaude, normalizeCursor } from './lib/usage.js';
import { readState, saveSuccess, saveFailure } from './lib/state.js';

const METER_URL = chrome.runtime.getURL('meter/index.html');
const INTERVAL_MINUTES = 3;
const SAND_URL = 'https://cursor.com/api/dashboard/get-sand-usage-status';
const SAND_ORIGIN_RULE_ID = 1;
let running = null, controller = null, refreshing = false;
let lifecycle = Promise.resolve();
const meterTabs = async () => (await chrome.tabs.query({})).filter(tab => tab.url?.split(/[?#]/)[0] === METER_URL && !tab.discarded);
const signal = ms => AbortSignal.any([controller?.signal ?? new AbortController().signal, AbortSignal.timeout(ms)]);
const report = error => console.error('Agent Token Viewer:', error.message);
const background = promise => { void promise.catch(report); };
async function ensureSandOriginRule() {
  // POSTのCSRF検査用。service worker由来だけ Origin/Referer を cursor.com に書き換える。
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [SAND_ORIGIN_RULE_ID],
    addRules: [{
      id: SAND_ORIGIN_RULE_ID,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Origin', operation: 'set', value: 'https://cursor.com' },
          { header: 'Referer', operation: 'set', value: 'https://cursor.com/' },
        ],
      },
      condition: {
        urlFilter: '||cursor.com/api/dashboard/get-sand-usage-status',
        resourceTypes: ['xmlhttprequest', 'other'],
        tabIds: [chrome.tabs.TAB_ID_NONE],
      },
    }],
  });
}
async function json(url) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal: signal(20_000) });
  if (!response.ok) throw new Error(`取得先がHTTP ${response.status}を返しました。ブラウザーでログイン状態を確認してください。`);
  try { return await response.json(); } catch { throw new Error('ログイン画面または確認画面が返りました。サービスのWeb画面を開いてください。'); }
}
function pickSand(data) {
  if (!data || typeof data !== 'object') return null;
  const pick = (...keys) => { for (const key of keys) if (data[key] != null) return data[key]; };
  const selected = {
    usagePercent: pick('usagePercent', 'usage_percent'),
    nextResetTimestampUtc: pick('nextResetTimestampUtc', 'next_reset_timestamp_utc'),
    usesPooledEnterpriseAllowance: pick('usesPooledEnterpriseAllowance', 'uses_pooled_enterprise_allowance'),
    includedLimitZero: pick('includedLimitZero', 'included_limit_zero'),
    hasNonZeroIncludedLimit: pick('hasNonZeroIncludedLimit', 'has_non_zero_included_limit'),
    isUnified: pick('isUnified', 'is_unified'),
  };
  return Object.values(selected).some(value => value != null) ? selected : null;
}
async function sandUsage() {
  try {
    await ensureSandOriginRule();
    const response = await fetch(SAND_URL, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
      signal: signal(20_000),
    });
    if (!response.ok) return null;
    return pickSand(await response.json());
  } catch {
    return null;
  }
}
async function cursor() {
  const data = await json('https://cursor.com/api/usage-summary');
  if (!data.individualUsage?.plan) throw new Error('Cursorの利用状況の形式を確認できません。');
  const sand = await sandUsage();
  return sand
    ? { membershipType: data.membershipType, billingCycleEnd: data.billingCycleEnd, individualUsage: data.individualUsage, sand }
    : { membershipType: data.membershipType, billingCycleEnd: data.billingCycleEnd, individualUsage: data.individualUsage };
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
    // プラン名は利用枠の有無の判定後に付与する（プランだけの組織を有効と誤判定しない）。
    if (Object.keys(selected).length) found.push(typeof org.analytics_subscription_plan === 'string' ? { ...selected, plan: org.analytics_subscription_plan } : selected);
  }
  if (found.length > 1) throw new Error('Claudeで複数組織の利用枠が見つかりました。取り違え防止のため取得を停止しています。');
  if (!found.length) throw new Error('Claudeの利用枠がありません。ログインと契約を確認してください。');
  return found[0];
}
// Webセッションで取得できる場合のみ利用する。認証情報は保存せず、画面にも渡さない。
async function codex() {
  const session = await json('https://chatgpt.com/api/auth/session');
  if (typeof session.accessToken !== 'string' || !session.accessToken) throw new Error('ChatGPTのWebセッションを確認できません。拡張を入れたブラウザーでログインしてください。');
  const headers = { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' };
  if (typeof session.account?.id === 'string' && session.account.id) headers['ChatGPT-Account-Id'] = session.account.id;
  const response = await fetch('https://chatgpt.com/backend-api/wham/usage', { headers, credentials: 'include', cache: 'no-store', signal: signal(20_000) });
  if (!response.ok) throw new Error(`CodexのWeb利用枠を取得できません（HTTP ${response.status}）。ChatGPTのログインとワークスペースを確認してください。`);
  let data;
  try { data = await response.json(); } catch { throw new Error('CodexのWeb利用枠の応答を確認できません。'); }
  const convert = window => window && ({ usedPercent: window.used_percent, windowDurationMins: typeof window.limit_window_seconds === 'number' ? window.limit_window_seconds / 60 : null, resetsAt: window.reset_at });
  const limits = data.rate_limit;
  if (!limits || ![limits.primary_window, limits.secondary_window].some(w => typeof w?.used_percent === 'number' && Number.isFinite(w.used_percent))) throw new Error('CodexのWeb利用枠を確認できません。ChatGPTのログインとプランを確認してください。');
  return { rateLimits: { planType: typeof data.plan_type === 'string' ? data.plan_type : null, primary: convert(limits.primary_window), secondary: convert(limits.secondary_window) } };
}

// 1回の取得を共有する。中断後の処理が次の取得のcontrollerを参照しないよう完了まで保持する。
function collect() {
  if (running) return running;
  const currentController = new AbortController();
  controller = currentController;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; currentController.abort(); }, 60000);
  running = (async () => {
    if (!(await meterTabs()).length) return;
    refreshing = true;
    await chrome.storage.local.set({ collection: { active: true, startedAt: Date.now() } });
    await Promise.allSettled([
      ['cursor', cursor, normalizeCursor], ['claude', claude, normalizeClaude], ['codex', codex, normalizeCodex],
    ].map(async ([id, read, normalize]) => {
      try {
        const data = await read();
        const normal = normalize(data);
        if (!normal.meters.length || normal.meters.every(m => m.usedPercent == null)) throw new Error('有効な利用枠がありません。ログインと契約を確認してください。');
        if (!currentController.signal.aborted && (await meterTabs()).length) await saveSuccess(id, normal);
      } catch (error) {
        if ((!currentController.signal.aborted || timedOut) && (await meterTabs()).length) await saveFailure(id, timedOut ? '取得がタイムアウトしました。更新を押して再試行してください。' : error.message);
      }
    }));
  })().finally(async () => {
    clearTimeout(timeout);
    controller = null;
    // 完了通知の保存中もrunningを保持し、古い完了処理による新しい取得状態の上書きを防ぐ。
    refreshing = false;
    try { await chrome.storage.local.set({ collection: { active: false } }); }
    finally { running = null; }
  });
  return running;
}
async function reconcile(refresh = false) {
  if (!(await meterTabs()).length) {
    controller?.abort();
    await chrome.alarms.clear('usage');
    return;
  }
  if (!(await chrome.alarms.get('usage'))) await chrome.alarms.create('usage', { periodInMinutes: INTERVAL_MINUTES });
  if (refresh) {
    // 全タブを閉じた直後の再オープンでは、古い中断処理が終わってから取得する。
    if (controller?.signal.aborted && running) await running;
    background(collect());
  }
}
function syncTabs(refresh = false) {
  const task = lifecycle.then(() => reconcile(refresh));
  lifecycle = task.catch(report);
  return task;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/)[0] !== METER_URL) return false;
  const handle = async () => {
    if (message?.type === 'state') return { ok: true, ...(await readState()), refreshing };
    if (message?.type === 'open' || message?.type === 'refresh') {
      await syncTabs(true);
      return { ok: true };
    }
    return { ok: false, error: '不明な操作です。' };
  };
  handle().then(reply, error => reply({ ok: false, error: error.message }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'usage') background(syncTabs(true)); });
chrome.tabs.onRemoved.addListener(() => { background(syncTabs()); });
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.url || change.discarded !== undefined || change.status === 'complete') {
    const isMeter = tab.url?.split(/[?#]/)[0] === METER_URL;
    background(syncTabs(isMeter && (change.discarded === false || change.status === 'complete')));
  }
});
chrome.runtime.onInstalled.addListener(() => { background(syncTabs(true)); });
chrome.runtime.onStartup.addListener(() => { background(syncTabs(true)); });
// アイコンの連打でもタブが重複しないよう直列化する。
let opening = Promise.resolve();
chrome.action.onClicked.addListener(() => {
  opening = opening.then(async () => {
    const tabs = (await chrome.tabs.query({})).filter(tab => tab.url?.split(/[?#]/)[0] === METER_URL);
    if (tabs.length) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    } else await chrome.tabs.create({ url: METER_URL });
    await syncTabs(true);
  }).catch(report);
});
// 通常のWorker復帰ではアラームだけ復元し、他サイトのタブ更新を取得の契機にしない。
// 前回の取得がWorker終了で途切れた場合は、開いたメーターで取得をやり直す。
async function recover() {
  const { collection } = await chrome.storage.local.get('collection');
  await syncTabs(Boolean(collection?.active && !running));
}
background(recover());
