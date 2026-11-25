import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('配布用ZIPはWindowsで作成してください。');
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(root, 'extension/manifest.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || pkg.version !== manifest.version) throw new Error('アプリと拡張のバージョンを確認してください。');
// 明示したファイルだけを収録し、ローカルの保存データや認証情報を含めない。
const files = [
  'package.json', 'README.md', 'USER_GUIDE.md', 'CHANGELOG.md', 'assets/screenshot.png',
  'server.mjs', 'start.cmd', 'install-edge.cmd', 'install-chrome.cmd',
  'uninstall-edge.cmd', 'uninstall-chrome.cmd',
  'lib/usage.mjs', 'lib/viewers.mjs', 'lib/native-protocol.mjs',
  'public/index.html', 'public/app.js', 'public/style.css',
  'extension/manifest.json', 'extension/background.js', 'extension/pair.js',
  'extension/setup.html', 'extension/setup.js',
  'scripts/register-edge.mjs', 'scripts/native-host.mjs', 'scripts/claude-hook.mjs',
];
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
const temporary = await mkdtemp(path.join(dist, '.build-'));
const name = `agent-token-viewer-${pkg.version}`;
const staged = path.join(temporary, name);
const archive = path.join(dist, `${name}.zip`);
try {
  for (const file of files) {
    const target = path.join(staged, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
  }
  // 配布物には開発用スクリプトやテストを含めないため、利用可能な起動コマンドだけを残す。
  await writeFile(path.join(staged, 'package.json'), JSON.stringify({ ...pkg, scripts: { start: pkg.scripts.start } }, null, 2) + '\n');
  const temporaryZip = path.join(temporary, `${name}.zip`);
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference = 'Stop'; Compress-Archive -LiteralPath $env:ATV_BUILD_FOLDER -DestinationPath $env:ATV_BUILD_ZIP -CompressionLevel Optimal",
  ], { env: { ...process.env, ATV_BUILD_FOLDER: staged, ATV_BUILD_ZIP: temporaryZip }, windowsHide: true, stdio: 'inherit' });
  await rename(temporaryZip, archive);
  console.log(`配布用ZIP: ${archive} (${files.length} files)`);
} finally {
  // 再帰削除は、この処理がdist直下に作成した一時フォルダーに限定する。
  if (path.dirname(temporary) !== dist || !path.basename(temporary).startsWith('.build-')) throw new Error('一時フォルダーのパスが不正です。');
  await rm(temporary, { recursive: true, force: true });
}
