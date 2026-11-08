import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 任意の補助連携。既存の設定は変更しない。
let text = '';
for await (const chunk of process.stdin) text += chunk;
try {
  const input = JSON.parse(text);
  if (input.rate_limits) {
    const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'claude-status.json'), JSON.stringify({ collectedAt: new Date().toISOString(), data: { rate_limits: input.rate_limits } }));
  }
  const window = input.rate_limits?.five_hour;
  if (window?.used_percentage != null) console.log(`Claude · 5h 使用 ${window.used_percentage}%`);
} catch { console.error('Claudeのステータスデータを取得できませんでした。'); process.exitCode = 1; }
