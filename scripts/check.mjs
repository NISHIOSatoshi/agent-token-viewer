import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function check(folder) {
  for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
    const relative = path.join(folder, entry.name);
    if (entry.isDirectory()) await check(relative);
    else if (/\.(mjs|js)$/.test(entry.name)) execFileSync(process.execPath, ['--check', path.join(root, relative)], { stdio: 'inherit', windowsHide: true });
  }
}
await check('extension');
await check('scripts');
const manifest = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
if (manifest.background.type !== 'module' || manifest.permissions.includes('nativeMessaging') || manifest.content_scripts
  || manifest.host_permissions.some(host => host.includes('127.0.0.1'))) throw new Error('拡張単体版のmanifestを確認してください。');
console.log('構文・拡張設定チェック成功');
