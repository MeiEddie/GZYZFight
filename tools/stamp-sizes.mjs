/**
 * 生成资源体积表
 * ------------------------------------------------------------
 * 启动加载条要按「真实字节」而不是「资源个数」计算进度，
 * 否则一个大文件（比如 5MB 的校歌）会把进度卡在 98% 十几秒再猛跳。
 *
 * 这里把 manifest 里每个 key 对应的文件大小写进 src/resources/sizes.js，
 * 运行时零额外请求就能知道每个资源的权重。
 *
 * 用法： node tools/stamp-sizes.mjs
 * 时机： 新增/替换素材后跑一次（npm run sizes）
 */
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'src/resources/manifest.js');
const OUT = join(ROOT, 'src/resources/sizes.js');

const code = readFileSync(MANIFEST, 'utf8');

/** 按 `'key': {` 切块，再从每块里取 src */
const blocks = code.split(/'([\w.-]+)':\s*\{/).slice(1);
const rows = [];
const missing = [];

for (let i = 0; i < blocks.length; i += 2) {
  const key = blocks[i];
  const body = blocks[i + 1];
  const m = /src:\s*'([^']+)'/.exec(body);
  if (!m) continue;
  const abs = join(ROOT, m[1]);
  if (!existsSync(abs)) { missing.push(m[1]); continue; }
  rows.push([key, statSync(abs).size]);
}

rows.sort((a, b) => a[0].localeCompare(b[0]));

const lines = rows.map(([k, n]) => `  '${k}': ${n},`).join('\n');
const total = rows.reduce((s, r) => s + r[1], 0);

const out = `/**
 * 资源体积表（自动生成，请勿手工修改）
 * ------------------------------------------------------------
 * 由 tools/stamp-sizes.mjs 依据 src/resources/manifest.js 与磁盘文件生成。
 * 作用：启动加载条按字节加权，进度真实、单调，不会「卡在 98% 再猛跳」。
 *
 * 素材增删改之后重新生成： node tools/stamp-sizes.mjs
 */
export const ASSET_BYTES = {
${lines}
};

/** 全部登记资源的字节总和 */
export const ASSET_TOTAL_BYTES = ${total};
`;

writeFileSync(OUT, out, 'utf8');

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log('已生成 src/resources/sizes.js');
console.log('  条目：' + rows.length + ' 个，合计 ' + (total / 1048576).toFixed(2) + ' MB');
if (missing.length) console.log('  跳过（文件不存在）：' + missing.join('、'));
