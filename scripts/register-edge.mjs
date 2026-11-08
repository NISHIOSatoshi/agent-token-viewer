import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = 'com.agent_token_viewer.edge';
const registry = `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${name}`;
if (process.platform !== 'win32') throw new Error('Edge用の登録はWindowsで実行してください。');
const target = path.join(root, '.local', 'native-host.json');
if (process.argv.includes('--remove')) {
  // この配置先で登録したものだけを解除する。
  let value;
  try { value = execFileSync('reg.exe', ['query', registry, '/ve'], { encoding: 'utf8', windowsHide: true }); }
  catch { console.log('登録はありません。'); process.exit(0); }
  if (!value.toLowerCase().includes(target.toLowerCase())) throw new Error('別の配置先が登録されています。解除を中止しました。');
  execFileSync('reg.exe', ['delete', registry, '/f'], { stdio: 'pipe', windowsHide: true });
  console.log('Edgeからの起動登録を解除しました。');
  process.exit(0);
}
const ids = new Set();
const explicit = process.argv.indexOf('--id');
if (explicit !== -1) {
  const id = process.argv[explicit + 1];
  if (!/^[a-p]{32}$/.test(id ?? '')) throw new Error('拡張IDはa〜pの32文字で指定してください。');
  ids.add(id);
} else {
  const userData = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data');
  for (const profile of await readdir(userData)) {
    if (!/^(Default|Profile \d+)$/.test(profile)) continue;
    for (const file of ['Preferences', 'Secure Preferences']) {
      let prefs;
      try { prefs = JSON.parse(await readFile(path.join(userData, profile, file), 'utf8')); } catch { continue; }
      for (const [id, setting] of Object.entries(prefs.extensions?.settings ?? {})) {
        if (typeof setting.path === 'string' && path.resolve(setting.path).toLowerCase() === path.join(root, 'extension').toLowerCase() && /^[a-p]{32}$/.test(id)) ids.add(id);
      }
    }
  }
}
if (!ids.size) throw new Error('Edgeにこの拡張が見つかりません。先にextensionフォルダーを読み込むか、install-edge.cmd --id 拡張ID を実行してください。');
await mkdir(path.join(root, '.local'), { recursive: true });
const launcher = path.join(root, '.local', 'native-host.cmd');
const quoteBatch = value => value.replaceAll('%', '%%');
await writeFile(launcher, `@echo off\r\n"${quoteBatch(process.execPath)}" "${quoteBatch(path.join(root, 'scripts', 'native-host.mjs'))}"\r\n`);
await writeFile(target, JSON.stringify({ name, description: 'Agent Token Viewer Edge Launcher', path: launcher, type: 'stdio', allowed_origins: [...ids].map(id => `chrome-extension://${id}/`) }, null, 2));
execFileSync('reg.exe', ['add', registry, '/ve', '/t', 'REG_SZ', '/d', target, '/f'], { stdio: 'pipe', windowsHide: true });
console.log(`Edge用の起動登録が完了しました。拡張ID: ${[...ids].join(', ')}`);
console.log('edge://extensions で拡張を再読み込みし、アイコンをクリックしてください。');
