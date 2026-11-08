import { readFile } from 'node:fs/promises';
import { encodeMessage, createDecoder } from '../lib/native-protocol.mjs';

const origin = `http://127.0.0.1:${process.env.PORT ?? 4317}`;
const send = message => process.stdout.write(encodeMessage(message));
process.env.NATIVE_HOST = '1';
// stdoutはブラウザーとの通信専用。ログはstderrへ送る。
console.log = (...args) => console.error(...args);
let start;
async function launch() {
  if (start) return start;
  start = (async () => {
    let existing;
    try { existing = await (await fetch(`${origin}/api/state`, { signal: AbortSignal.timeout(1000) })).json(); } catch { /* 未起動なら同じプロセス内でサーバーを起動する。 */ }
    if (existing && (existing.app !== 'agent-token-viewer' || existing.version !== 2)) throw new Error('ポート4317の旧アプリを終了してから再度クリックしてください。');
    if (!existing) {
      delete process.env.OPEN_BROWSER;
      await (await import('../server.mjs')).ready;
    }
    const token = (await readFile(new URL('../.local/connection-key', import.meta.url), 'utf8')).trim();
    return { type: 'ready', url: origin, token };
  })();
  return start;
}
const decode = createDecoder(message => {
  if (message.type === 'start') void launch().then(send).catch(error => send({ type: 'error', error: error.message }));
});
process.stdin.on('data', chunk => {
  try { decode(chunk); } catch (error) { send({ type: 'error', error: error.message }); process.exitCode = 1; process.stdin.destroy(); }
});
process.stdin.on('end', () => { process.exit(0); });
process.stdout.on('error', () => process.exit(0));
