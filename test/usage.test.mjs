import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodex, normalizeClaude, normalizeCursor, present, STALE_MS } from '../lib/usage.mjs';
test('Cursorの全体とOther Modelsを分離し、金額の残りゼロと混同しない', () => {
  const data = normalizeCursor({ membershipType: 'pro', billingCycleEnd: '2026-11-07T05:11:40Z', individualUsage: { plan: { enabled: true, limit: 2000, remaining: 0, totalPercentUsed: 29.9365, apiPercentUsed: 62.5778 } } });
  assert.ok(Math.abs(data.meters[0].remainingPercent - 70.0635) < 0.0001);
  assert.ok(Math.abs(data.meters[1].remainingPercent - 37.4222) < 0.0001);
  assert.equal(data.meters[0].resetLabel, '請求期間終了');
});
test('無料アカウントや欠損値を残量100%にしない', () => {
  const data = normalizeCursor({ individualUsage: { plan: { enabled: true, limit: 0, totalPercentUsed: 0 } } });
  assert.equal(data.meters[0].remainingPercent, null);
  assert.equal(normalizeCodex({ rateLimits: { primary: { usedPercent: null } } }).meters[0].remainingPercent, null);
});
test('100%超の使用量とリセット後の古いデータを正しく扱う', () => {
  const data = normalizeClaude({ five_hour: { utilization: 103, resets_at: '2026-01-01T00:00:00Z' } });
  assert.equal(data.meters[0].remainingPercent, 0);
  const now = Date.now(); const display = present({ ...data, updatedAt: new Date(now - STALE_MS - 1).toISOString() }, now);
  assert.equal(display.stale, true); assert.equal(display.meters[0].expired, true);
});
test('Codexの複数枠と実際のプランを保持する', () => {
  const data = normalizeCodex({ rateLimitsByLimitId: { codex: { planType: 'plus', primary: { usedPercent: 7, windowDurationMins: 300, resetsAt: 1793686827 }, secondary: { usedPercent: 1, windowDurationMins: 10080 } }, other: { primary: { usedPercent: 12 } } } });
  assert.equal(data.meters.length, 3); assert.equal(data.plan, 'plus'); assert.equal(data.meters[0].remainingPercent, 93);
  assert.equal(data.meters[0].resetsAt, new Date(1793686827 * 1000).toISOString());
});
test('Claudeの公式出力とWeb出力が同じ残量になる', () => {
  const time = 1793686827;
  const a = normalizeClaude({ rate_limits: { five_hour: { used_percentage: 2, resets_at: time } } }, 'statusline');
  const b = normalizeClaude({ five_hour: { utilization: 2, resets_at: new Date(time * 1000).toISOString() } });
  assert.deepEqual(a.meters, b.meters);
});
test('Claudeのプラン名はWeb取得時のみ返し、claude_接頭辞を除く', () => {
  const web = normalizeClaude({ plan: 'claude_pro', five_hour: { utilization: 2, resets_at: null } }, 'Web 利用状況');
  assert.equal(web.plan, 'pro');
  assert.equal(web.meters.length, 1);
  assert.equal(normalizeClaude({ five_hour: { utilization: 2, resets_at: null } }).plan, null);
  assert.equal(normalizeClaude({ plan: 'claude_pro', rate_limits: { five_hour: { used_percentage: 2 } } }, 'statusline').plan, null);
});
