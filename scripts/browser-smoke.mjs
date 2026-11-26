import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
const executable = process.argv[2] ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const base = path.resolve('.local');
await mkdir(base, { recursive: true });
const profile = await mkdtemp(path.join(base, 'browser-test-'));
const extension = path.resolve(process.argv[3] ?? 'extension');
const child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let client;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retry(fn, timeout = 20000) {
  const until = Date.now() + timeout;
  let error;
  while (Date.now() < until) { try { const value = await fn(); if (value) return value; } catch (e) { error = e; } await pause(100); }
  throw error ?? new Error('Timeout');
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.next = 1; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.id) { const pending = this.pending.get(data.id); if (!pending) return; this.pending.delete(data.id); clearTimeout(pending.timer); if (data.error) pending.reject(new Error(JSON.stringify(data.error))); else pending.resolve(data.result); }
      else this.events.push(data);
    });
  }
  call(method, params = {}, sessionId) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async eval(expression, sessionId) {
    const result = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}
try {
  const port = await retry(async () => Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]));
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl); await once(ws, 'open'); client = new CDP(ws);
  console.log('Browser', version.Browser); 
  let worker, workerSession;
  
  await retry(async () => {
    const targets = (await client.call('Target.getTargets')).targetInfos.filter(target => target.type === 'service_worker' && target.url.endsWith('/background.js'));
    for (const target of targets) {
      const attached = await client.call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      let manifest;
      try { manifest = await client.eval('chrome.runtime.getManifest()', attached.sessionId); }
      catch { await client.call('Target.detachFromTarget', { sessionId: attached.sessionId }); continue; }
      if (manifest.name === 'Agent Token Viewer') { worker = target; workerSession = attached.sessionId; return true; }
      await client.call('Target.detachFromTarget', { sessionId: attached.sessionId });
    }
  }, 10000);
  await client.call('Runtime.enable', {}, workerSession);
  console.log('Loaded extension worker:', worker.url);
  const meter = worker.url.replace('background.js', 'meter/index.html');
  // 実サービスへ接続せず、ブラウザー内での拡張API・UI・保存・取得経路を検証する。
  await client.eval(`globalThis.fetch = async url => {
    const data = url.endsWith('/api/auth/session') ? {accessToken:'smoke-secret'} : url.endsWith('/wham/usage') ? {plan_type:'plus',rate_limit:{primary_window:{used_percent:12,limit_window_seconds:18000,reset_at:Math.floor(Date.now()/1000)+3600}}} : url.endsWith('/api/organizations') ? [{uuid:'one',analytics_subscription_plan:'claude_pro'}] : url.includes('/organizations/') ? {five_hour:{utilization:23,resets_at:new Date(Date.now()+3600000).toISOString()}} : url.endsWith('/get-sand-usage-status') ? {usagePercent:4,hasNonZeroIncludedLimit:true} : {membershipType:'pro',individualUsage:{plan:{enabled:true,limit:2000,totalPercentUsed:34,apiPercentUsed:8}}};
    return {ok:true,status:200,json:async()=>data};
  }; true`, workerSession);
  
  await client.eval(`chrome.tabs.create({url:chrome.runtime.getURL('meter/index.html')})`, workerSession);
  const { targetId } = await retry(async () => (await client.call('Target.getTargets')).targetInfos.find(target => target.url === meter));
  const { sessionId } = await client.call('Target.attachToTarget', { targetId, flatten: true });
  await client.call('Runtime.enable', {}, sessionId);
  await client.call('Log.enable', {}, sessionId);
  try { await retry(() => client.eval(`document.querySelectorAll('.card').length === 3 && document.querySelector('#refresh').textContent === '更新' && document.querySelectorAll('.number')[0]?.textContent === '12'`, sessionId)); } catch (error) { console.log('DOM', await client.eval(`document.body.innerText`,sessionId)); console.log('STORE', await client.eval(`chrome.storage.local.get(null)`,sessionId)); console.log('EVENTS',JSON.stringify(client.events.filter(e=>e.method.includes('exception')||e.method.includes('entryAdded')))); throw error; }
  assert.equal(await client.eval(`document.querySelectorAll('.number')[0].textContent`, sessionId), '12');
  await client.eval(`document.querySelector('#mode-toggle').click(); document.querySelector('#theme-toggle').click(); true`, sessionId);
  await retry(() => client.eval(`document.documentElement.dataset.theme === 'dark' && document.querySelectorAll('.number')[0].textContent === '88'`, sessionId));
  await client.call('Page.reload', {}, sessionId);
  await retry(() => client.eval(`document.querySelectorAll('.card').length === 3 && document.documentElement.dataset.theme === 'dark' && document.querySelectorAll('.number')[0].textContent === '88'`, sessionId));
  await client.eval(`document.querySelector('#refresh').click(); true`, sessionId);
  await retry(() => client.eval(`document.querySelector('#refresh').textContent === '更新'`, sessionId));
  const saved = await client.eval(`chrome.storage.local.get(null)`, sessionId);
  assert.ok(!JSON.stringify(saved).includes('smoke-secret'));
  assert.equal(saved['service:claude'].meters[0].usedPercent, 23);
  const alarms = await client.eval(`chrome.alarms.getAll()`, workerSession);
  assert.equal(alarms.length, 1);
  // 複数メーターの片方だけを閉じても定期取得を維持する。
  const other = await client.call('Target.createTarget', { url: meter });
  await retry(async () => (await client.call('Target.getTargets')).targetInfos.find(target => target.targetId === other.targetId));
  await client.call('Target.closeTarget', { targetId: other.targetId });
  assert.equal((await client.eval(`chrome.alarms.getAll()`, workerSession)).length, 1);
  await client.call('Target.closeTarget', { targetId });
  await retry(async () => (await client.eval(`chrome.alarms.getAll()`, workerSession)).length === 0);
  const errors = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed:', version.Browser, '3 cards, refresh, theme/mode persistence, no saved token, multiple tabs, close stops alarm.');
} finally {
  if (client) { try { await client.call('Browser.close'); } catch {} client.ws.close(); }
  if (child.exitCode === null) { await Promise.race([once(child, 'exit'), pause(3000)]); if (child.exitCode === null) child.kill(); }
  assert.equal(path.dirname(profile), base);
  try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (error) { console.error('Temporary browser profile retained:', profile, error.message); }
}
