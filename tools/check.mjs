/**
 * 全量语法检查
 * ------------------------------------------------------------
 * 对 src / tools 下每个 .js / .mjs 执行 `node --check`，
 * 只解析不执行，几秒钟就能挡住低级语法错误。
 *
 * 用法： npm run check
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['src', 'tools'];

/** 递归收集目标目录下的脚本文件 */
function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full));
    else if (['.js', '.mjs'].includes(extname(name))) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap(d => collect(join(ROOT, d)));
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error('语法错误: ' + file);
    console.error(String(e.stderr || e.message).split('\n').slice(0, 4).join('\n'));
  }
}

console.log(`${files.length - failed}/${files.length} 个文件语法通过`);
process.exit(failed ? 1 : 0);
