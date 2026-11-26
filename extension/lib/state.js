import { present } from './usage.js';

export const SERVICE_IDS = ['codex', 'claude', 'cursor'];
const SCHEMA_VERSION = 1;
const empty = id => ({ id, plan: null, meters: [], source: null, updatedAt: null, error: null });
const key = id => {
  if (!SERVICE_IDS.includes(id)) throw new Error('サービスが不正です。');
  return `service:${id}`;
};
function restore(id, record) {
  const percent = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (record?.schemaVersion !== SCHEMA_VERSION || record.id !== id || !Array.isArray(record.meters)
    || (record.updatedAt !== null && !Number.isFinite(Date.parse(record.updatedAt)))
    || record.meters.some(m => !m || typeof m.label !== 'string' || !percent(m.usedPercent)
      || !percent(m.remainingPercent) || m.remainingPercent > 100)) return empty(id);
  return { ...empty(id), ...record };
}
export async function readState() {
  const saved = await chrome.storage.local.get(SERVICE_IDS.map(key));
  return { schemaVersion: SCHEMA_VERSION, services: SERVICE_IDS.map(id => present(restore(id, saved[key(id)]))) };
}
export async function saveSuccess(id, normal) {
  await chrome.storage.local.set({ [key(id)]: {
    schemaVersion: SCHEMA_VERSION, id, plan: normal.plan, meters: normal.meters,
    note: normal.note ?? null, source: 'Web 利用状況', updatedAt: new Date().toISOString(), error: null,
  } });
}
export async function saveFailure(id, error) {
  const saved = await chrome.storage.local.get(key(id));
  await chrome.storage.local.set({ [key(id)]: {
    ...restore(id, saved[key(id)]), schemaVersion: SCHEMA_VERSION, error: String(error).slice(0, 300),
  } });
}
