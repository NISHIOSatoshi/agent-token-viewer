export const REFRESH_MS = 180_000;
export const STALE_MS = REFRESH_MS * 2;

function percent(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function iso(value) {
  if (value == null) return null;
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function meter(id, label, used, resetsAt, extra = {}) {
  const usedPercent = percent(used);
  return { id, label, usedPercent, remainingPercent: usedPercent == null ? null : Math.max(0, 100 - usedPercent), resetsAt: iso(resetsAt), ...extra };
}

export function normalizeCodex(data) {
  const groups = data.rateLimitsByLimitId ?? (data.rateLimits ? { codex: data.rateLimits } : {});
  const meters = [];
  for (const [key, group] of Object.entries(groups)) {
    for (const [slot, window] of [['primary', group.primary], ['secondary', group.secondary]]) {
      if (!window) continue;
      const minutes = window.windowDurationMins;
      const duration = minutes == null ? slot : minutes >= 1440 ? `${minutes / 1440}日枠` : `${minutes / 60}時間枠`;
      meters.push(meter(`${key}-${slot}`, `${group.limitName ?? key} · ${duration}`, window.usedPercent, window.resetsAt));
    }
  }
  return { plan: data.rateLimits?.planType ?? Object.values(groups)[0]?.planType ?? null, meters };
}

export function normalizeCursor(data) {
  const plan = data.individualUsage?.plan;
  if (!plan) throw new Error('Cursorの利用サマリー形式が変わりました。');
  // 上限ゼロのアカウントを残量100%として扱わない。
  const valid = plan.enabled === true && (typeof plan.limit === 'number' && plan.limit > 0);
  const extra = { resetLabel: '請求期間終了' };
  const meters = [
    meter('total', '全体', valid ? plan.totalPercentUsed : null, data.billingCycleEnd, extra),
    meter('other', 'Other Models', valid ? plan.apiPercentUsed : null, data.billingCycleEnd, extra),
  ];
  const demand = data.individualUsage?.onDemand;
  return { plan: data.membershipType ?? null, meters, note: demand?.enabled ? '追加の従量課金が有効です。上限到達後も課金して継続する場合があります。' : null };
}

export function normalizeClaude(data, source = 'web') {
  const values = source === 'statusline' ? data.rate_limits : data;
  if (!values || typeof values !== 'object') throw new Error('Claudeの利用枠がまだ届いていません。');
  const labels = { five_hour: '5時間枠', seven_day: '週間枠', seven_day_sonnet: 'Sonnet · 週間枠', seven_day_opus: 'Opus · 週間枠' };
  const meters = Object.entries(labels).filter(([key]) => values[key] != null).map(([key, label]) => {
    const window = values[key];
    return meter(key, label, source === 'statusline' ? window.used_percentage : window.utilization, window.resets_at);
  });
  return { plan: null, meters, note: source === 'statusline' ? 'Claude Codeから受信。未使用中は更新されません。' : null };
}

export function present(record, now = Date.now()) {
  const stale = !record.updatedAt || now - Date.parse(record.updatedAt) > STALE_MS;
  return { ...record, stale, meters: record.meters.map(item => ({ ...item, expired: item.resetsAt != null && Date.parse(item.resetsAt) <= now })) };
}
