// バックグラウンドタブのタイマー抑制にも余裕を持たせる。
export const VIEWER_LEASE_MS = 150_000;
export function createViewers(now = Date.now) {
  const leases = new Map();
  return {
    touch(id) { leases.set(id, now()); },
    remove(id) { leases.delete(id); },
    active() {
      for (const [id, seen] of leases) if (now() - seen >= VIEWER_LEASE_MS) leases.delete(id);
      return leases.size > 0;
    },
  };
}
