export const REFRESH_MS = 180_000;
export const STALE_MS = REFRESH_MS * 2;
const FIVE_HOUR_MINUTES = 300;
const WEEK_MINUTES = 10080;

function percent(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function iso(value) {
  if (value == null) return null;
  const date = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

// 窓の長さ（分）。正の有限値のみ採用し、不明ならnull。画面の経過リングに使う。
function windowMinutes(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

// 請求期間の長さ（分）。開始日はデータに無いため、終了日の1か月前（月末は丸める）から推定する。
function billingCycleMinutes(end) {
  const endMs = Date.parse(end);
  if (!Number.isFinite(endMs)) return null;
  const date = new Date(endMs);
  const lastDayOfPrevMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0)).getUTCDate();
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, Math.min(date.getUTCDate(), lastDayOfPrevMonth), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
  return windowMinutes((endMs - start) / 60000);
}

function meter(id, label, used, resetsAt, extra = {}) {
  const usedPercent = percent(used);
  return { id, label, usedPercent, remainingPercent: usedPercent == null ? null : Math.max(0, 100 - usedPercent), resetsAt: iso(resetsAt), ...extra };
}

export function normalizeCodex(data) {
  const groups = data.rateLimitsByLimitId ?? (data.rateLimits ? { codex: data.rateLimits } : {});
  const meters = [];
  const multi = Object.keys(groups).length > 1;
  for (const [key, group] of Object.entries(groups)) {
    for (const [slot, window] of [['primary', group.primary], ['secondary', group.secondary]]) {
      if (!window) continue;
      const minutes = window.windowDurationMins;
      const duration = minutes == null ? slot : minutes >= 10080 ? '週間枠' : minutes >= 1440 ? `${minutes / 1440}日枠` : `${minutes / 60}時間枠`;
      const label = multi ? `${group.limitName ?? key} · ${duration}` : duration;
      meters.push(meter(`${key}-${slot}`, label, window.usedPercent, window.resetsAt, { windowMinutes: windowMinutes(minutes) }));
    }
  }
  return { plan: data.rateLimits?.planType ?? Object.values(groups)[0]?.planType ?? null, meters };
}

function normalizeCursorSand(sand) {
  if (!sand || typeof sand !== 'object') return null;
  if (sand.usesPooledEnterpriseAllowance === true || sand.isUnified === true) return null;
  if (sand.includedLimitZero === true || sand.hasNonZeroIncludedLimit !== true) return null;
  const used = sand.usagePercent;
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  return meter('grok-bot', 'Grok Bot · 週間枠', used, sand.nextResetTimestampUtc, { compact: true, windowMinutes: WEEK_MINUTES });
}

export function normalizeCursor(data) {
  const plan = data.individualUsage?.plan;
  if (!plan) throw new Error('Cursorの利用サマリー形式が変わりました。');
  // 上限ゼロのアカウントを残量100%として扱わない。
  const valid = plan.enabled === true && (typeof plan.limit === 'number' && plan.limit > 0);
  const extra = { resetLabel: '請求期間終了', windowMinutes: billingCycleMinutes(data.billingCycleEnd) };
  const grok = normalizeCursorSand(data.sand);
  // Cursor ModelsとOther Modelsは同じ請求期間でリセットされるため、どちらにも請求期間終了を出す。
  const meters = [
    meter('total', 'Cursor Models', valid ? plan.totalPercentUsed : null, data.billingCycleEnd, extra),
    meter('other', 'Other Models', valid ? plan.apiPercentUsed : null, data.billingCycleEnd, { ...extra, compact: true }),
  ];
  if (grok) meters.push(grok);
  const demand = data.individualUsage?.onDemand;
  return { plan: data.membershipType ?? null, meters, note: demand?.enabled ? '追加の従量課金が有効です。上限到達後も課金して継続する場合があります。' : null };
}

export function normalizeClaude(data, source = 'web') {
  const values = source === 'statusline' ? data.rate_limits : data;
  if (!values || typeof values !== 'object') throw new Error('Claudeの利用枠がまだ届いていません。');
  const labels = { five_hour: '5時間枠', seven_day: '週間枠', seven_day_sonnet: 'Sonnet · 週間枠', seven_day_opus: 'Opus · 週間枠' };
  const meters = Object.entries(labels).filter(([key]) => values[key] != null).map(([key, label]) => {
    const window = values[key];
    return meter(key, label, source === 'statusline' ? window.used_percentage : window.utilization, window.resets_at, { windowMinutes: key === 'five_hour' ? FIVE_HOUR_MINUTES : WEEK_MINUTES });
  });
  // プラン名はWeb取得時のみ届く。公式statusLineの出力には含まれない。
  const plan = source !== 'statusline' && typeof data.plan === 'string' ? data.plan.replace(/^claude_/, '') : null;
  return { plan, meters, note: source === 'statusline' ? 'Claude Codeから受信。未使用中は更新されません。' : null };
}

export function present(record, now = Date.now()) {
  const stale = !record.updatedAt || now - Date.parse(record.updatedAt) > STALE_MS;
  return { ...record, stale, meters: record.meters.map(item => ({ ...item, expired: item.resetsAt != null && Date.parse(item.resetsAt) <= now })) };
}
