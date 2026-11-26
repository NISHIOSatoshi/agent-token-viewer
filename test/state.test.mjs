import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, saveSuccess, saveFailure } from '../extension/lib/state.js';
const normal = usedPercent => ({ plan: 'pro', meters: [{ id: 'five_hour', label: '5時間枠', usedPercent, remainingPercent: 100 - usedPercent, resetsAt: null }], note: null });
function storage(initial = {}) {
  const data = structuredClone(initial);
  globalThis.chrome = { storage: { local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(data[key])])),
    set: async values => { Object.assign(data, structuredClone(values)); },
  } } };
  return data;
}
test('取得失敗時は前回の利用率と成功時刻を保持する', async () => {
  const data = storage();
  await saveSuccess('claude', normal(23));
  const time = data['service:claude'].updatedAt;
  await saveFailure('claude', 'offline');
  assert.equal(data['service:claude'].meters[0].usedPercent, 23);
  assert.equal(data['service:claude'].updatedAt, time);
  assert.equal(data['service:claude'].error, 'offline');
  await saveSuccess('claude', normal(25));
  assert.equal(data['service:claude'].error, null);
});
test('並列保存で別サービスの値や表示設定を失わない', async () => {
  const data = storage({ 'agent-viewer-theme': 'dark' });
  await Promise.all([saveSuccess('codex', normal(10)), saveSuccess('cursor', normal(20)), saveSuccess('claude', normal(30))]);
  assert.deepEqual((await readState()).services.map(s => s.meters[0].usedPercent), [10, 30, 20]);
  assert.equal(data['agent-viewer-theme'], 'dark');
});
test('未対応の形式・破損した保存値は初期状態へ戻し、他サービスは維持する', async () => {
  storage({ 'service:codex': { schemaVersion: 99, id: 'codex', meters: [] }, 'service:claude': { schemaVersion: 1, id: 'claude', meters: [null] } });
  await saveSuccess('cursor', normal(12));
  const state = await readState();
  assert.deepEqual(state.services[0].meters, []);
  assert.deepEqual(state.services[1].meters, []);
  assert.equal(state.services[2].meters[0].usedPercent, 12);
});
test('過去の取得値は読み込み時に古いデータとして判定する', async () => {
  const data = storage();
  await saveSuccess('codex', normal(10));
  data['service:codex'].updatedAt = '2000-01-01T00:00:00Z';
  assert.equal((await readState()).services[0].stale, true);
});

test('表示に必要な値が壊れていてもメーター全体の描画を妨げない', async () => {
  storage({
    'service:codex': { schemaVersion: 1, id: 'codex', updatedAt: null, meters: [{ remainingPercent: 50 }] },
    'service:claude': { schemaVersion: 1, id: 'claude', updatedAt: 'invalid-date', meters: [] },
  });
  const state = await readState();
  assert.ok(state.services.every(service => service.meters.length === 0 && service.stale));
});
