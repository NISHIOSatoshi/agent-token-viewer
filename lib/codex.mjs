import { spawn } from 'node:child_process';
import { readdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export async function findCodex() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const root = path.join(homedir(), '.t3', 'tools', 'codex');
  try {
    const versions = (await readdir(root)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const file = path.join(root, version, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex');
      try { await access(file); return file; } catch { /* 別のバージョンを探す。 */ }
    }
  } catch { /* PATH上のCLIを試す。 */ }
  return 'codex';
}

export async function readCodex() {
  const command = await findCodex();
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', settled = false;
    const cleanup = () => child.kill();
    process.once('exit', cleanup);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.removeListener('exit', cleanup);
      child.kill();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Codexの取得がタイムアウトしました。ログイン状態を確認してください。')), 25_000);
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    child.on('error', () => finish(new Error('Codex CLIが見つかりません。CODEX_BINで実行ファイルを指定してください。')));
    child.stdin.on('error', () => finish(new Error('Codexとの接続が終了しました。')));
    child.on('exit', () => finish(new Error('Codexがデータ取得前に終了しました。')));
    child.stderr.on('data', () => {});
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) return finish(new Error('Codexの初期化に失敗しました。'));
          send({ method: 'initialized' }); send({ id: 2, method: 'account/rateLimits/read' });
        }
        if (message.id === 2) {
          if (message.error) return finish(new Error('Codexの利用枠を取得できません。Codexでログインしてください。'));
          finish(null, message.result);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agent-token-viewer', version: '0.1.0' } } });
  });
}
