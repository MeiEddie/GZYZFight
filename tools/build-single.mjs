/**
 * 打包回单文件 HTML
 * ------------------------------------------------------------
 * 把整个模块化工程压成一个可以直接双击打开的 .html：
 *   - CSS 内联成 <style>
 *   - 所有 ES Module 按依赖顺序拼接成一段经典脚本（去掉 import/export）
 *   - 素材转成 data: URI 注入 window.__ASSET_DATA，加载器会直接解码
 *
 * 用法：
 *   node tools/build-single.mjs                # 含校歌音频（约 53MB）
 *   node tools/build-single.mjs --skip-audio   # 不含音频（约 45MB，无背景音乐与音效）
 *
 * 产物：dist/gzyz-clash.single.html
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src/main.js');
const OUT_DIR = join(ROOT, 'dist');
const OUT_FILE = join(OUT_DIR, 'gzyz-clash.single.html');

const skipAudio = process.argv.includes('--skip-audio');

/* ---------------- 工具 ---------------- */
const rel = p => relative(ROOT, p).split('\\').join('/');
const read = p => readFileSync(p, 'utf8');

const MIME = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

/** 匹配 import 语句：`import { a } from './x.js';` / `import './x.js';` */
const IMPORT_RE = /^import\s+(?:[\s\S]*?from\s*)?['"]([^'"]+)['"]\s*;?/gm;

/* ---------------- 1. 解析模块图 ---------------- */
/**
 * 深度优先遍历 import 图，返回按依赖先后排序的文件列表。
 * @param {string} entry 入口文件绝对路径
 */
function resolveGraph(entry) {
  const order = [];
  const state = new Map(); // path -> 'visiting' | 'done'

  function visit(file) {
    if (state.get(file) === 'done') return;
    if (state.get(file) === 'visiting') {
      throw new Error('检测到循环依赖：' + rel(file));
    }
    state.set(file, 'visiting');

    const code = read(file);
    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (!spec.startsWith('.')) throw new Error(`${rel(file)}：不支持裸模块 ${spec}`);
      visit(resolve(dirname(file), spec));
    }

    state.set(file, 'done');
    order.push(file);
  }

  visit(entry);
  return order;
}

/* ---------------- 2. 改写模块代码 ---------------- */
/** 去掉 import 语句，并把 export 声明降级成普通声明 */
function stripModuleSyntax(code, file) {
  let out = code.replace(IMPORT_RE, '');
  out = out.replace(/^export\s+default\s+/gm, '');
  out = out.replace(/^export\s+(?=(?:async\s+)?function|class|const|let|var)/gm, '');
  out = out.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  if (/^\s*(import|export)\s/m.test(out)) {
    throw new Error(rel(file) + ' 仍有未处理的 import/export，请检查语法');
  }
  return out;
}

/** 收集顶层声明名，用于检测打包后的重名冲突 */
function topLevelNames(code) {
  const names = new Set();
  const re = /^(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of code.matchAll(re)) names.add(m[1] || m[2]);
  return names;
}

/* ---------------- 3. 内联素材 ---------------- */
/** 收集 manifest 里登记的 src，按需转成 data URI */
function inlineAssets() {
  const manifestPath = join(ROOT, 'src/resources/manifest.js');
  const code = read(manifestPath);
  const srcs = [...code.matchAll(/src:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

  const data = {};
  const skipped = [];
  for (const src of srcs) {
    if (skipAudio && /\.(mp3|m4a|ogg|wav)$/i.test(src)) { skipped.push(src); continue; }
    const abs = join(ROOT, src);
    if (!existsSync(abs)) { skipped.push(src + '（不存在）'); continue; }
    const mime = MIME[extname(src).toLowerCase()] || 'application/octet-stream';
    data[src] = `data:${mime};base64,` + readFileSync(abs).toString('base64');
  }
  return { data, skipped };
}

/* ---------------- 4. 组装 ---------------- */
function build() {
  const files = resolveGraph(ENTRY);

  const seen = new Map();
  const chunks = [];
  for (const file of files) {
    let code = read(file);
    code = stripModuleSyntax(code, file);
    for (const name of topLevelNames(code)) {
      if (seen.has(name)) {
        throw new Error(`打包后顶层标识符冲突：${name}（${rel(file)} 与 ${seen.get(name)}）`);
      }
      seen.set(name, rel(file));
    }
    chunks.push(`/* ===== ${rel(file)} ===== */\n` + code.trim());
  }

  const { data, skipped } = inlineAssets();

  /* HTML */
  let html = read(join(ROOT, 'index.html'));

  // 内联 CSS
  html = html.replace(
    /[ \t]*<link rel="stylesheet" href="([^"]+)">\s*\n/g,
    (_, href) => '  <style>\n' + read(join(ROOT, href)).trim() + '\n  </style>\n'
  );

  // 内联 favicon
  html = html.replace(/[ \t]*<link rel="icon"[^>]*>\s*\n/g, m => {
    const href = /href="([^"]+)"/.exec(m)[1];
    const abs = join(ROOT, href);
    if (!existsSync(abs)) return '';
    const mime = MIME[extname(href).toLowerCase()] || 'image/svg+xml';
    return `  <link rel="icon" href="data:${mime};base64,${readFileSync(abs).toString('base64')}">\n`;
  });

  // 内联脚本：模块图 → 单个经典脚本（用 IIFE 圈住作用域）
  const bundle =
    '(function () {\n"use strict";\n' +
    '/* 一中原版：本文件由 tools/build-single.mjs 自动生成，请勿手工修改 */\n' +
    (Object.keys(data).length
      ? 'window.__ASSET_DATA = ' + JSON.stringify(data) + ';\n'
      : '') +
    '\n' + chunks.join('\n\n') + '\n})();\n';

  html = html.replace(
    /[ \t]*<script type="module" src="[^"]+"><\/script>\s*\n?/,
    () => '  <script>\n' + bundle + '  </script>\n'
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, html, 'utf8');

  /* 报告 */
  const kb = n => (n / 1024).toFixed(1) + ' KB';
  const mb = n => (n / 1024 / 1024).toFixed(2) + ' MB';
  const size = statSync(OUT_FILE).size;

  console.log('打包完成 → ' + rel(OUT_FILE));
  console.log('  模块数：' + files.length + ' 个');
  console.log('  内联素材：' + Object.keys(data).length + ' 个' + (skipped.length ? '，跳过 ' + skipped.join('、') : ''));
  console.log('  体积：' + (size > 1024 * 1024 ? mb(size) : kb(size)));
  console.log('\n双击该文件即可离线运行（不需要本地服务器）。');
  if (skipAudio) console.log('注意：已跳过音频，背景音乐与音效都不会发声。');
}

build();
