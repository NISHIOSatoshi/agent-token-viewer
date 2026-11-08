import { readFile, writeFile } from 'node:fs/promises';

const packagePath = new URL('../package.json', import.meta.url);
const manifestPath = new URL('../extension/manifest.json', import.meta.url);
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const pkg = await read(packagePath);
const manifest = await read(manifestPath);
const argument = process.argv[2];
const valid = version => typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) && version.split('.').every(part => Number(part) <= 65535);
if (argument === '--check') {
  if (!valid(pkg.version) || pkg.version !== manifest.version) {
    console.error(`バージョンが不正または不一致です: package=${pkg.version}, extension=${manifest.version}`);
    process.exitCode = 1;
  } else console.log(`バージョン一致: ${pkg.version}`);
} else if (!valid(argument) || process.argv.length !== 3) {
  console.error('使用方法: npm run version:set -- 0.3.1（各番号は0〜65535）');
  process.exitCode = 1;
} else {
  pkg.version = argument;
  manifest.version = argument;
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`バージョンを ${argument} に更新しました。`);
}
