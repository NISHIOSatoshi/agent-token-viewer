import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeCodex, normalizeClaude, normalizeCursor } from '../extension/lib/usage.js';
import { readState, saveSuccess, saveFailure } from '../extension/lib/state.js';

const source = (await readFile(new URL('../extension/background.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^background\(recover\(\)\);$/m, '');
const METER = 'chrome-extension://test/meter/index.html';
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
function runtime(fetch = async () => response({}), initialTabs = [{ id: 1, url: METER }], initialStore = {}) {
  let tabs = initialTabs;
  const store = structuredClone(initialStore), calls = [], events = {}, alarms = new Map();
  const event = name => ({ addListener(listener) { events[name] = listener; } });
  const chrome = {
    tabs: {
      TAB_ID_NONE: -1, query: async () => tabs,
      onRemoved: event('removed'), onUpdated: event('updated'),
      create: async options => { const tab = { id: tabs.length + 1, windowId: 1, ...options }; tabs.push(tab); return tab; },
      update: async () => {},
    },
    windows: { update: async () => {} },
    storage: { local: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in store).map(key => [key, structuredClone(store[key])])),
      set: async values => { Object.assign(store, structuredClone(values)); },
    } },
    runtime: { id: 'test', getURL: file => `chrome-extension://test/${file}`, onMessage: event('message'), onInstalled: event('installed'), onStartup: event('startup') },
    alarms: { create: async (name, options) => { alarms.set(name, options); }, get: async name => alarms.get(name), clear: async name => alarms.delete(name), onAlarm: event('alarm') },
    action: { onClicked: event('click') },
    declarativeNetRequest: { updateSessionRules: async () => {} },
  };
  globalThis.chrome = chrome;
  const context = vm.createContext({ chrome, fetch: async (url, options) => { calls.push(url); return fetch(url, options); }, AbortSignal, AbortController, console, setTimeout, clearTimeout, normalizeCodex, normalizeClaude, normalizeCursor, readState, saveSuccess, saveFailure });
  vm.runInContext(source, context);
  return {
    collect: () => vm.runInContext('collect()', context),
    sync: (refresh = false) => vm.runInContext(`syncTabs(${refresh})`, context),
    recover: () => vm.runInContext('recover()', context),
    settle: () => vm.runInContext('(async () => { await opening; await lifecycle; await running; })()', context),
    setTabs: value => { tabs = value; }, store, calls, events, alarms,
    message: (type, sender = { id: 'test', url: METER }) => new Promise(resolve => {
      if (!events.message({ type }, sender, resolve)) resolve(undefined);
    }),
    get tabs() { return tabs; },
  };
}
function successfulFetch(url) {
  if (url.endsWith('/api/usage-summary')) return response({ membershipType: 'pro', individualUsage: { plan: { enabled: true, limit: 2000, totalPercentUsed: 30, apiPercentUsed: 12 } }, secret: 'private' });
  if (url.endsWith('/get-sand-usage-status')) return response({ usagePercent: 4, hasNonZeroIncludedLimit: true, secret: 'private' });
  if (url.endsWith('/api/organizations')) return response([{ uuid: 'a', analytics_subscription_plan: 'claude_pro' }, { uuid: 'b' }]);
  if (url.endsWith('/a/usage')) return response({ five_hour: { utilization: 2, resets_at: null }, secret: 'private' });
  if (url.endsWith('/b/usage')) return response({}, 403);
  if (url.endsWith('/api/auth/session')) return response({ accessToken: 'test-secret', account: { id: 'account-id' } });
  if (url.endsWith('/wham/usage')) return response({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_at: 1793686827 } }, secret: 'private' });
  throw new Error(`Unexpected URL: ${url}`);
}

test('タブなし・破棄済みタブ・他拡張のタブでは外部取得しない', async () => {
  for (const tabs of [[], [{ url: METER, discarded: true }], [{ url: 'chrome-extension://other/meter/index.html' }]]) {
    const r = runtime(successfulFetch, tabs);
    await r.collect();
    assert.deepEqual(r.calls, []);
  }
});
test('各サービスの正規化値だけを保存し、認証や会話情報を残さない', async () => {
  const r = runtime((url, options) => {
    if (url.endsWith('/wham/usage')) {
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      assert.equal(options.headers['ChatGPT-Account-Id'], 'account-id');
    }
    return successfulFetch(url);
  });
  await r.collect();
  assert.equal(r.store['service:claude'].plan, 'pro');
  assert.equal(r.store['service:claude'].meters[0].usedPercent, 2);
  assert.equal(r.store['service:cursor'].meters[2].usedPercent, 4);
  assert.equal(r.store['service:codex'].meters[0].windowMinutes, 300);
  for (const secret of ['private', 'test-secret', 'account-id']) assert.ok(!JSON.stringify(r.store).includes(secret));
  assert.ok(r.calls.every(url => url.startsWith('https://')));
});
test('Grok Bot失敗時もCursor本体を保存する', async () => {
  const r = runtime(url => url.endsWith('/get-sand-usage-status') ? response({}, 500) : successfulFetch(url));
  await r.collect();
  assert.equal(r.store['service:cursor'].meters.length, 2);
  assert.equal(r.store['service:cursor'].error, null);
});
test('複数のClaude組織が有効ならエラーとし、他サービスを継続する', async () => {
  const r = runtime(url => url.endsWith('/b/usage') ? response({ seven_day: { utilization: 4 } }) : successfulFetch(url));
  await r.collect();
  assert.match(r.store['service:claude'].error, /複数組織/);
  assert.equal(r.store['service:codex'].error, null);
});
test('ChatGPTセッションなしでは利用枠APIへ認証情報を送らない', async () => {
  const r = runtime(url => url.endsWith('/api/auth/session') ? response({}) : successfulFetch(url));
  await r.collect();
  assert.match(r.store['service:codex'].error, /セッション/);
  assert.ok(!r.calls.some(url => url.endsWith('/wham/usage')));
});
test('同時更新は一回の取得を共有する', async () => {
  const r = runtime(successfulFetch);
  const first = r.collect(), second = r.collect();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(r.calls.filter(url => url.endsWith('/api/auth/session')).length, 1);
  assert.equal((await r.message('state')).refreshing, false);
});
test('最後のタブを閉じると通信を中断し、結果を保存せずアラームを解除する', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const r = runtime((_url, options) => new Promise((_resolve, reject) => {
    started();
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  r.alarms.set('usage', {});
  const work = r.collect();
  await ready;
  r.setTabs([]);
  await r.sync();
  await work;
  assert.equal(r.alarms.has('usage'), false);
  assert.ok(!Object.keys(r.store).some(key => key.startsWith('service:')));
});
test('複数タブの一方を閉じても更新を継続する', async () => {
  const r = runtime(successfulFetch, [{ id: 2, url: METER }]);
  await r.sync(true); await r.settle();
  assert.equal(r.alarms.get('usage').periodInMinutes, 3);
  assert.ok(r.store['service:codex']);
});
test('Worker再起動後は古い取得中状態を解消し、開いたタブで取得を再開する', async () => {
  const r = runtime(successfulFetch, [{ id: 1, url: METER }], { collection: { active: true, startedAt: 1 } });
  assert.equal((await r.message('state')).refreshing, false);
  await r.recover(); await r.settle();
  assert.equal(r.store.collection.active, false);
  assert.ok(r.alarms.has('usage'));
  assert.ok(r.store['service:codex']);
});
test('無関係なタブの完了で再取得せず、破棄から復帰したメーターで再開する', async () => {
  const r = runtime(successfulFetch);
  r.events.updated(2, { status: 'complete' }, { url: 'https://example.com/' });
  await r.settle(); assert.equal(r.calls.length, 0);
  r.events.updated(1, { discarded: false }, { url: METER });
  await r.settle(); assert.ok(r.calls.length > 0);
});
test('拡張アイコンを連打しても一つのメータータブだけを作る', async () => {
  const r = runtime(successfulFetch, []);
  r.events.click(); r.events.click();
  await r.settle();
  assert.equal(r.tabs.length, 1);
  assert.equal(r.tabs[0].url, METER);
});
test('外部ページ・別拡張・別の拡張内ページからのメッセージは受け付けない', async () => {
  const r = runtime(successfulFetch);
  for (const sender of [{ id: 'test', url: 'https://example.com/' }, { id: 'other', url: METER }, { id: 'test', url: METER + '/other' }]) {
    assert.equal(await r.message('refresh', sender), undefined);
  }
  assert.equal(r.calls.length, 0);
});

test('通常のWorker復帰ではアラームだけ復元し、不要な外部取得を行わない', async () => {
  const r = runtime(successfulFetch);
  await r.recover(); await r.settle();
  assert.equal(r.calls.length, 0);
  assert.ok(r.alarms.has('usage'));
});

test('閉じた直後に再オープンすると古い取得の中断後に新しい取得を開始する', async () => {
  let blocking = true, started;
  const ready = new Promise(resolve => { started = resolve; });
  const r = runtime((url, options) => {
    if (!blocking) return successfulFetch(url);
    return new Promise((_resolve, reject) => {
      started();
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
  const work = r.collect();
  await ready;
  r.setTabs([]); await r.sync();
  blocking = false;
  r.setTabs([{ id: 2, url: METER }]);
  await r.sync(true); await r.settle(); await work;
  assert.equal(r.store['service:codex'].meters[0].usedPercent, 12);
  assert.equal(r.store.collection.active, false);
  assert.ok(r.alarms.has('usage'));
});
