import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const code = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
function runtime(fetch, tabs = [{ id: 1 }]) {
  const event = { addListener() {} };
  const chrome = {
    tabs: { TAB_ID_NONE: -1, query: async () => tabs, onRemoved: event, onUpdated: event },
    storage: { local: { get: async () => ({ token: 'test-connection' }) } },
    runtime: { onMessage: event, onInstalled: event, onStartup: event },
    alarms: { create() {}, onAlarm: event },
    action: { onClicked: event },
    declarativeNetRequest: { updateSessionRules: async () => {} },
  };
  const context = vm.createContext({ chrome, fetch, AbortSignal, AbortController, console });
  vm.runInContext(code, context);
  return () => vm.runInContext('collect()', context);
}
test('メーターのタブを閉じていればローカルへの問い合わせも行わない', async () => {
  const calls = [];
  await runtime(async url => { calls.push(url); }, [])();
  assert.deepEqual(calls, []);
});
test('サーバーに有効な画面接続がなければサービスへ問い合わせない', async () => {
  const calls = [];
  await runtime(async url => { calls.push(url); return { ok: true, json: async () => ({ active: false }) }; })();
  assert.deepEqual(calls, ['http://127.0.0.1:4317/api/state']);
});
test('アプリが停止中はCursor・Claudeへ問い合わせない', async () => {
  const calls = [];
  await runtime(async url => { calls.push(url); throw new Error('offline'); })();
  assert.deepEqual(calls, ['http://127.0.0.1:4317/api/state']);
});
test('取得可能な組織だけを選び、会話や認証情報を送らない', async () => {
  const posts = [];
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  await runtime(async (url, options) => {
    if (url.endsWith('/api/state')) return response({ active: true });
    if (url.endsWith('/api/ingest')) { posts.push(JSON.parse(options.body)); return response({}); }
    if (url.endsWith('/api/usage-summary')) return response({ membershipType: 'pro', individualUsage: { plan: { totalPercentUsed: 30 } }, private: '送信禁止' });
    if (url.endsWith('/api/dashboard/get-sand-usage-status')) {
      assert.equal(options.method, 'POST');
      return response({ usagePercent: 4, hasNonZeroIncludedLimit: true, upgradeRecommendation: '送信禁止', secret: '送信禁止' });
    }
    if (url.endsWith('/api/organizations')) return response([{ uuid: 'a', analytics_subscription_plan: 'claude_pro', capabilities: ['送信禁止'] }, { uuid: 'b' }]);
    if (url.endsWith('/a/usage')) return response({ five_hour: { utilization: 2, resets_at: null }, secret: '送信禁止' });
    return response({}, 403);
  })();
  assert.equal(posts.length, 2);
  assert.equal(posts.find(x => x.service === 'claude').data.five_hour.utilization, 2);
  assert.equal(posts.find(x => x.service === 'claude').data.plan, 'claude_pro');
  assert.equal(posts.find(x => x.service === 'cursor').data.sand.usagePercent, 4);
  assert.equal(posts.find(x => x.service === 'cursor').data.sand.hasNonZeroIncludedLimit, true);
  assert.equal(posts.find(x => x.service === 'cursor').data.sand.upgradeRecommendation, undefined);
  assert.ok(!JSON.stringify(posts).includes('送信禁止'));
});
test('Grok Bot取得失敗でもCursor本体は送る', async () => {
  const posts = [];
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  await runtime(async (url, options) => {
    if (url.endsWith('/api/state')) return response({ active: true });
    if (url.endsWith('/api/ingest')) { posts.push(JSON.parse(options.body)); return response({}); }
    if (url.endsWith('/api/usage-summary')) return response({ membershipType: 'pro', individualUsage: { plan: { totalPercentUsed: 30 } } });
    if (url.endsWith('/api/dashboard/get-sand-usage-status')) return response({}, 500);
    if (url.endsWith('/api/organizations')) return response([{ uuid: 'a' }]);
    if (url.includes('/organizations/')) return response({ five_hour: { utilization: 1, resets_at: null } });
    return response({}, 403);
  })();
  const cursor = posts.find(x => x.service === 'cursor');
  assert.equal(cursor.data.membershipType, 'pro');
  assert.equal(cursor.data.sand, undefined);
  assert.equal(cursor.error, undefined);
});
test('複数組織の枠が有効な場合は勝手に選ばずエラーを届ける', async () => {
  const posts = [];
  const response = data => ({ ok: true, status: 200, json: async () => data });
  await runtime(async (url, options) => {
    if (url.endsWith('/api/state')) return response({ active: true });
    if (url.endsWith('/api/ingest')) { posts.push(JSON.parse(options.body)); return response({}); }
    if (url.endsWith('/api/organizations')) return response([{ uuid: 'a' }, { uuid: 'b' }]);
    if (url.includes('/organizations/')) return response({ seven_day: { utilization: 2 } });
    return response({ individualUsage: { plan: {} } });
  })();
  assert.match(posts.find(x => x.service === 'claude').error, /複数組織/);
});
