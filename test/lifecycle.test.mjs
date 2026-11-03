import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewers, VIEWER_LEASE_MS } from '../lib/viewers.mjs';
import { encodeMessage, createDecoder } from '../lib/native-protocol.mjs';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('最後の画面を閉じるまで有効、途絶した画面は期限切れで停止', () => {
  let now = 0; const viewers = createViewers(() => now);
  assert.equal(viewers.active(), false);
  viewers.touch('a'); viewers.touch('b'); viewers.remove('a');
  assert.equal(viewers.active(), true);
  viewers.remove('b'); assert.equal(viewers.active(), false);
  viewers.touch('a'); now += VIEWER_LEASE_MS;
  assert.equal(viewers.active(), false);
});
test('ネイティブ通信の分割・連結・日本語を処理する', () => {
  const messages = []; const decode = createDecoder(m => messages.push(m));
  const a = encodeMessage({ type: 'start', text: '日本語' });
  decode(a.subarray(0, 2)); decode(Buffer.concat([a.subarray(2), encodeMessage({ type: 'end' })]));
  assert.deepEqual(messages, [{ type: 'start', text: '日本語' }, { type: 'end' }]);
  const oversize = Buffer.alloc(4); oversize.writeUInt32LE(2_000_000);
  assert.throws(() => createDecoder(() => {})(oversize), /大きすぎ/);
});
test('ネイティブホストは起動から画面接続まで取得せず、切断時に終了する', { timeout: 15000 }, async t => {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, ['scripts/native-host.mjs'], { env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let stderr = ''; child.stderr.on('data', d => { stderr += d; });
  const ready = await new Promise((resolve, reject) => {
    const decoder = createDecoder(resolve);
    child.stdout.on('data', chunk => { try { decoder(chunk); } catch (error) { reject(error); } });
    child.on('error', reject); child.on('exit', code => reject(new Error(`起動失敗 ${code}: ${stderr}`)));
    child.stdin.write(encodeMessage({ type: 'start' }));
  });
  assert.equal(ready.type, 'ready', ready.error);
  const origin = `http://127.0.0.1:${port}`;
  const state = await (await fetch(`${origin}/api/state`)).json();
  assert.equal(state.active, false);
  const headers = { Authorization: `Bearer ${ready.token}`, 'Content-Type': 'application/json' };
  const refresh = await fetch(`${origin}/api/refresh`, { method: 'POST', headers });
  assert.equal(refresh.status, 409);
  const unauthorized = await fetch(`${origin}/api/viewer`, { method: 'POST', body: '{}' });
  assert.equal(unauthorized.status, 401);
  // ハートビートを処理できることを確認。テスト中の外部取得は行わない。
  const close = await fetch(`${origin}/api/viewer`, { method: 'POST', headers, body: JSON.stringify({ id: 'test', closed: true }) });
  assert.equal(close.status, 200); assert.equal((await close.json()).active, false);
  const exit = new Promise(resolve => child.on('exit', resolve));
  child.stdin.end(); assert.equal(await exit, 0);
  await assert.rejects(fetch(`${origin}/api/state`));
});
