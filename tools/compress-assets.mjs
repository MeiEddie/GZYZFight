/**
 * 素材压缩（开发期工具，需要 ffmpeg）
 * ------------------------------------------------------------
 * 原始素材保存在 assets_origin/pre-compress-20261104/（已被 .gitignore 忽略）。
 * 本脚本永远从那份原件重新编码，可以反复执行，不会出现「压缩过的文件又被压一次」。
 *
 * 用法：
 *   FFMPEG=/path/to/ffmpeg.exe node tools/compress-assets.mjs
 *   或把 ffmpeg 加进 PATH 后： npm run compress
 *
 * 编码参数（改动前先看 README「素材压缩与原件」）：
 *   校歌   VBR q6 / 单声道 / 32kHz mp3   —— 5.3 MB → 约 1.3 MB
 *   音效   96k / 单声道 / 32kHz mp3     —— WAV 共约 1.1 MB → 约 0.1 MB
 *   头像   长边 160px / webp q90        —— 运行时最大只画 81px
 *   背景   尺寸不变 / webp q78 / 保留 alpha
 *
 * 压缩完必须跑： npm run sizes   （重算加载条字节权重）
 */
import {
  existsSync, readdirSync, statSync, readFileSync, unlinkSync
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = join(ROOT, 'assets_origin', 'pre-compress-20261104');
const ASSETS = join(ROOT, 'assets');
const FFMPEG = process.env.FFMPEG
  || (process.argv.find(a => a.startsWith('--ffmpeg=')) || '').slice('--ffmpeg='.length)
  || 'ffmpeg';

if (!existsSync(ORIGIN)) {
  console.error('找不到原始素材备份：' + ORIGIN);
  console.error('压缩前必须先把原件放到这里（按 assets/ 的相对结构）。');
  process.exit(1);
}

const kb = n => (n / 1024).toFixed(1) + ' KB';
const sizeOf = p => existsSync(p) ? statSync(p).size : 0;
const rows = [];

function encode(src, dst, args, label) {
  if (!existsSync(src)) throw new Error('缺少原件: ' + src);
  // 始终以「备份原件」为基准，重复执行也不会把压缩件误当成压缩前体积
  const before = sizeOf(src);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, ...args, dst], {
    encoding: 'utf8'
  });
  if (r.error) throw new Error(`ffmpeg 无法启动（${FFMPEG}）: ` + r.error.message);
  if (r.status !== 0) throw new Error(`编码失败 ${src}: ` + (r.stderr || '').trim());
  const after = sizeOf(dst);
  if (!after) throw new Error('输出为空: ' + dst);
  rows.push([label, before, after]);
}

/* ---------------- 1. 校歌 ---------------- */
encode(
  join(ORIGIN, 'audio', 'school-anthem.mp3'),
  join(ASSETS, 'audio', 'school-anthem.mp3'),
  ['-vn', '-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-q:a', '6', '-map_metadata', '-1'],
  '校歌 school-anthem.mp3'
);

/* ---------------- 2. WAV 音效 → mp3 ---------------- */
const wavs = readdirSync(join(ORIGIN, 'audio')).filter(f => f.toLowerCase().endsWith('.wav'));
for (const wav of wavs) {
  const src = join(ORIGIN, 'audio', wav);
  const dst = join(ASSETS, 'audio', basename(wav, '.wav') + '.mp3');
  encode(
    src, dst,
    ['-vn', '-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1'],
    '音效 ' + wav + ' → ' + basename(wav, '.wav') + '.mp3'
  );
  // 运行时目录里的旧 WAV 已不再被 manifest 引用。
  // 只有确认备份副本与它逐字节一致，才移走，避免误删任何未备份的内容。
  const old = join(ASSETS, 'audio', wav);
  if (existsSync(old)) {
    const a = readFileSync(old), b = readFileSync(src);
    if (!a.equals(b)) throw new Error('原件与备份不一致，拒绝移除: ' + old);
    unlinkSync(old);
  }
}
/* ---------------- 3. 头像：512px → 160px 长边 ---------------- */
const faces = readdirSync(join(ORIGIN, '贴图')).filter(f => f.toLowerCase().endsWith('.webp'));
for (const f of faces) {
  encode(
    join(ORIGIN, '贴图', f),
    join(ASSETS, '贴图', f),
    ['-vf', 'scale=160:160:force_original_aspect_ratio=decrease',
      '-c:v', 'libwebp', '-quality', '90', '-compression_level', '6', '-pix_fmt', 'rgba'],
    '头像 ' + f
  );
}

/* ---------------- 4. 背景：尺寸不变，降质量并保留 alpha ---------------- */
for (const f of ['1.webp', '2.webp']) {
  encode(
    join(ORIGIN, f),
    join(ASSETS, f),
    ['-c:v', 'libwebp', '-quality', '78', '-compression_level', '6', '-pix_fmt', 'rgba'],
    '背景 ' + f
  );
}

/* ---------------- 汇总 ---------------- */
const sum = i => rows.reduce((s, r) => s + r[i], 0);
console.log('文件'.padEnd(38) + '压缩前'.padStart(12) + '压缩后'.padStart(12));
console.log('-'.repeat(62));
for (const [label, before, after] of rows) {
  console.log(label.padEnd(38) + kb(before).padStart(12) + kb(after).padStart(12));
}
console.log('-'.repeat(62));
console.log('合计'.padEnd(38) + kb(sum(1)).padStart(12) + kb(sum(2)).padStart(12));
console.log(`\n减少 ${kb(sum(1) - sum(2))}（${((1 - sum(2) / sum(1)) * 100).toFixed(1)}%）`);
console.log(`其中 ${wavs.length} 个 WAV 原件已归入备份目录，运行时只保留 mp3。`);
console.log('\n接下来请执行： npm run sizes   （重算加载条字节权重）');
