import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodex, normalizeClaude, normalizeCursor, present, STALE_MS } from '../lib/usage.mjs';
test('CursorのCursor ModelsとOther Modelsを分離し、金額の残りゼロと混同しない', () => {
  const data = normalizeCursor({ membershipType: 'pro', billingCycleEnd: '2026-11-07T05:11:40Z', individualUsage: { plan: { enabled: true, limit: 2000, remaining: 0, totalPercentUsed: 29.9365, apiPercentUsed: 62.5778 } } });
  assert.equal(data.meters[0].label, 'Cursor Models');
  assert.ok(Math.abs(data.meters[0].remainingPercent - 70.0635) < 0.0001);
  assert.ok(Math.abs(data.meters[1].remainingPercent - 37.4222) < 0.0001);
  assert.equal(data.meters[0].resetsAt, '2026-11-07T05:11:40.000Z');
  assert.equal(data.meters[0].resetLabel, '請求期間終了');
  assert.equal(data.meters[1].resetLabel, '請求期間終了');
  assert.equal(data.meters[1].resetsAt, '2026-11-07T05:11:40.000Z');
  assert.equal(data.meters.length, 2);
  assert.equal(data.meters[0].compact, undefined);
  assert.equal(data.meters[1].compact, true);
});
test('CursorのOther ModelsとGrok Botをコンパクトにし、請求リセットで区切る', () => {
  const data = normalizeCursor({
    membershipType: 'pro',
    billingCycleEnd: '2026-11-07T05:11:40Z',
    individualUsage: { plan: { enabled: true, limit: 2000, totalPercentUsed: 10, apiPercentUsed: 20 } },
    sand: { usagePercent: 12.5, nextResetTimestampUtc: '2026-11-14T00:00:00.000Z', hasNonZeroIncludedLimit: true, includedLimitZero: false, usesPooledEnterpriseAllowance: false },
  });
  assert.equal(data.meters.length, 3);
  assert.equal(data.meters[0].label, 'Cursor Models');
  assert.equal(data.meters[0].compact, undefined);
  assert.equal(data.meters[0].resetsAt, '2026-11-07T05:11:40.000Z');
  assert.equal(data.meters[1].compact, true);
  assert.equal(data.meters[1].resetsAt, '2026-11-07T05:11:40.000Z');
  assert.equal(data.meters[2].id, 'grok-bot');
  assert.equal(data.meters[2].label, 'Grok Bot · 週間枠');
  assert.equal(data.meters[2].usedPercent, 12.5);
  assert.equal(data.meters[2].remainingPercent, 87.5);
  assert.equal(data.meters[2].resetsAt, '2026-11-14T00:00:00.000Z');
  assert.equal(data.meters[2].compact, true);
});
test('Grok Bot枠なし・統合プラン・組織共有はメーターを出さない', () => {
  const base = { membershipType: 'pro', individualUsage: { plan: { enabled: true, limit: 100, totalPercentUsed: 1, apiPercentUsed: 2 } } };
  assert.equal(normalizeCursor({ ...base, sand: { usagePercent: 0, hasNonZeroIncludedLimit: false } }).meters.length, 2);
  assert.equal(normalizeCursor({ ...base, sand: { usagePercent: 0, includedLimitZero: true, hasNonZeroIncludedLimit: true } }).meters.length, 2);
  assert.equal(normalizeCursor({ ...base, sand: { usagePercent: 5, hasNonZeroIncludedLimit: true, usesPooledEnterpriseAllowance: true } }).meters.length, 2);
  assert.equal(normalizeCursor({ ...base, sand: { usagePercent: 5, hasNonZeroIncludedLimit: true, isUnified: true } }).meters.length, 2);
  assert.equal(normalizeCursor({ ...base, sand: { hasNonZeroIncludedLimit: true } }).meters.length, 2);
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
  assert.equal(data.meters[0].label, 'codex · 5時間枠');
  assert.equal(data.meters[1].label, 'codex · 週間枠');
});
test('Codex単一グループはClaudeと同じ枠名にする', () => {
  const data = normalizeCodex({ rateLimitsByLimitId: { codex: { planType: 'plus', primary: { usedPercent: 0, windowDurationMins: 300 }, secondary: { usedPercent: 5, windowDurationMins: 10080 } } } });
  assert.equal(data.meters[0].label, '5時間枠');
  assert.equal(data.meters[1].label, '週間枠');
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
test('各メーターに経過リング用の窓の長さ（分）を持たせる', () => {
  const claude = normalizeClaude({ five_hour: { utilization: 1, resets_at: '2026-11-08T10:00:00Z' }, seven_day: { utilization: 1, resets_at: '2026-11-10T10:00:00Z' } });
  assert.deepEqual(claude.meters.map(m => m.windowMinutes), [300, 10080]);
  const codex = normalizeCodex({ rateLimits: { primary: { usedPercent: 1, windowDurationMins: 300, resetsAt: 1793686827 }, secondary: { usedPercent: 1, resetsAt: 1793686827 } } });
  assert.deepEqual(codex.meters.map(m => m.windowMinutes), [300, null]);
  const cursor = normalizeCursor({ billingCycleEnd: '2026-11-07T05:11:40Z', individualUsage: { plan: { enabled: true, limit: 2000, totalPercentUsed: 1, apiPercentUsed: 1 } }, sand: { usagePercent: 1, nextResetTimestampUtc: '2026-11-14T00:00:00.000Z', hasNonZeroIncludedLimit: true } });
  assert.deepEqual(cursor.meters.map(m => m.windowMinutes), [31 * 1440, 31 * 1440, 10080]);
});
test('請求期間の長さは月末でも1か月前に丸めて推定し、終了日が不明ならnullにする', () => {
  const base = { individualUsage: { plan: { enabled: true, limit: 2000, totalPercentUsed: 1, apiPercentUsed: 1 } } };
  assert.equal(normalizeCursor({ ...base, billingCycleEnd: '2026-03-31T00:00:00Z' }).meters[1].windowMinutes, 31 * 1440);
  assert.equal(normalizeCursor({ ...base, billingCycleEnd: '2026-03-30T00:00:00Z' }).meters[1].windowMinutes, 30 * 1440);
  assert.equal(normalizeCursor({ ...base, billingCycleEnd: null }).meters[1].windowMinutes, null);
});
