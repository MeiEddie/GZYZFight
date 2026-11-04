/**
 * UI 素材构建器（一次性素材工具，不属于运行时）
 * ------------------------------------------------------------
 * 用无头 Edge + Canvas 把界面组件渲染成独立的 PNG：
 *   - 按钮：常态 / hover / 禁用，9-slice
 *   - 弹窗底板：9-slice
 *   - 血条：底槽 / 蓝色填充 / 红色填充 / 刻度瓦片
 *   - 图标：24px 线性扁平图标
 *
 * 设计取向：克制装饰、无渐变、无阴影，纯色 + 1px 描边，方便后续自行打图集。
 * 输出：assets/images/ui/*.png + src/data/ui.js（元数据）
 *
 * 用法：node tools/build-ui-assets.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9342;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BIN = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
             'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));

/** 输出倍率：2 表示按逻辑尺寸 ×2 出图，运行时按逻辑尺寸绘制，高 DPI 也清晰 */
const SCALE = 2;

/**
 * 素材清单（尺寸均为「逻辑像素」，实际 PNG 为 ×SCALE）
 * sh   绘制方式：shape 圆角矩形 / tile 瓦片 / icon 图标
 * slice 9-slice 的切边（逻辑像素，0 表示不平铺）
 */
const LIST = [
  // 按钮三态（浅色底 / 小圆角）
  { name: 'btn-normal',   w: 128, h: 48, slice: 4, sh: 'shape', r: 2,
    fill: 'rgba(255,255,255,.94)', stroke: 'rgba(18,48,80,.18)', lw: 1 },
  { name: 'btn-hover',    w: 128, h: 48, slice: 4, sh: 'shape', r: 2,
    fill: 'rgba(211,239,255,.98)', stroke: 'rgba(0,152,216,.95)', lw: 1.5 },
  { name: 'btn-disabled', w: 128, h: 48, slice: 4, sh: 'shape', r: 2,
    fill: 'rgba(236,242,250,.62)', stroke: 'rgba(18,48,80,.10)', lw: 1 },

  // 弹窗底板
  { name: 'panel', w: 192, h: 192, slice: 6, sh: 'shape', r: 3,
    fill: 'rgba(248,251,255,.97)', stroke: 'rgba(18,48,80,.20)', lw: 1.2 },

  // 血条
  { name: 'bar-track',    w: 120, h: 26, slice: 4, sh: 'shape', r: 2,
    fill: '#e8f0fa', stroke: 'rgba(18,48,80,.20)', lw: 1.2 },
  { name: 'bar-fill-blue', w: 120, h: 20, slice: 3, sh: 'shape', r: 1,
    fill: '#19aee2', stroke: '', lw: 0 },
  { name: 'bar-fill-red',  w: 120, h: 20, slice: 3, sh: 'shape', r: 1,
    fill: '#ff584c', stroke: '', lw: 0 },
  { name: 'bar-ticks', w: 46, h: 20, slice: 0, sh: 'tile' },

  // 图标（24 逻辑像素，深蓝线条，透明底）
  { name: 'icon-move',     w: 24, h: 24, slice: 0, sh: 'icon', glyph: 'move' },
  { name: 'icon-jump',     w: 24, h: 24, slice: 0, sh: 'icon', glyph: 'jump' },
  { name: 'icon-attack',   w: 24, h: 24, slice: 0, sh: 'icon', glyph: 'attack' },
  { name: 'icon-block',    w: 24, h: 24, slice: 0, sh: 'icon', glyph: 'block' },
  { name: 'icon-sound-on', w: 24, h: 24, slice: 0, sh: 'icon', glyph: 'soundOn' },
  { name: 'icon-sound-off', w: 24, h: 24, slice: 0, sh: 'icon', glyph: 'soundOff' },
  { name: 'icon-back',     w: 24, h: 24, slice: 0, sh: 'icon', glyph: 'back' }
];

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); } }, 120000);
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

/* 注入到页面里的绘制函数（纯 Canvas，不依赖页面资源） */
const PAGE_FN = String.raw`
window.__buildUI = async function (SCALE, LIST) {
  const ICON = '#17324d';

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function shape(g, a) {
    const lw = a.lw || 0;
    roundRect(g, 0, 0, a.w, a.h, a.r);
    g.fillStyle = a.fill; g.fill();
    if (lw > 0 && a.stroke) {
      roundRect(g, lw / 2, lw / 2, a.w - lw, a.h - lw, Math.max(0, a.r - lw / 2));
      g.strokeStyle = a.stroke; g.lineWidth = lw; g.stroke();
    }
  }

  function tile(g, a) {
    // 刻度瓦片：一格宽，右边缘一条 1px 竖线；运行时按格子宽度平铺
    g.fillStyle = 'rgba(18,48,80,.22)';
    g.fillRect(a.w - 1, 0, 1, a.h);
  }

  function icon(g, glyph) {
    g.strokeStyle = ICON;
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    switch (glyph) {
      case 'move':
        g.moveTo(9, 7); g.lineTo(4, 12); g.lineTo(9, 17);
        g.moveTo(15, 7); g.lineTo(20, 12); g.lineTo(15, 17);
        break;
      case 'jump':
        g.moveTo(12, 19); g.lineTo(12, 7);
        g.moveTo(7, 12); g.lineTo(12, 7); g.lineTo(17, 12);
        g.moveTo(6, 21); g.lineTo(18, 21);
        break;
      case 'attack':
        g.moveTo(4, 12); g.lineTo(18, 12);
        g.moveTo(13, 7); g.lineTo(18, 12); g.lineTo(13, 17);
        g.moveTo(5, 7); g.lineTo(9, 7);
        g.moveTo(5, 17); g.lineTo(9, 17);
        break;
      case 'block':
        g.moveTo(12, 4); g.lineTo(19, 7); g.lineTo(18, 14);
        g.lineTo(12, 20); g.lineTo(6, 14); g.lineTo(5, 7);
        g.closePath();
        break;
      case 'soundOn':
        g.moveTo(4, 9); g.lineTo(8, 9); g.lineTo(13, 5);
        g.lineTo(13, 19); g.lineTo(8, 15); g.lineTo(4, 15); g.closePath();
        g.moveTo(17, 9); g.arc(15, 12, 5, -0.9, 0.9);
        g.moveTo(20, 6); g.arc(15, 12, 9, -0.75, 0.75);
        break;
      case 'soundOff':
        g.moveTo(4, 9); g.lineTo(8, 9); g.lineTo(13, 5);
        g.lineTo(13, 19); g.lineTo(8, 15); g.lineTo(4, 15); g.closePath();
        g.moveTo(16, 9); g.lineTo(22, 15);
        g.moveTo(22, 9); g.lineTo(16, 15);
        break;
      case 'back':
        g.moveTo(20, 12); g.lineTo(6, 12);
        g.moveTo(11, 7); g.lineTo(6, 12); g.lineTo(11, 17);
        break;
    }
    g.stroke();
  }

  const out = {};
  for (const a of LIST) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(a.w * SCALE);
    cv.height = Math.round(a.h * SCALE);
    const g = cv.getContext('2d');
    g.scale(SCALE, SCALE);
    if (a.sh === 'shape') shape(g, a);
    else if (a.sh === 'tile') tile(g, a);
    else if (a.sh === 'icon') icon(g, a.glyph);
    out[a.name] = cv.toDataURL('image/png');
  }
  return out;
};
`;

const browser = spawn(BIN, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
  '--window-size=800,600', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + join(ROOT, '.screenshots', '.cdp-ui'), 'about:blank'], { stdio: 'ignore' });

let cdp;
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { }
  }
  if (!target) throw new Error('调试端口未就绪');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  cdp = new CDP(ws);
  await cdp.send('Runtime.enable');

  await cdp.eval(PAGE_FN);
  const data = await cdp.eval(`window.__buildUI(${SCALE}, ${JSON.stringify(LIST)})`);

  const dir = join(ROOT, 'assets', 'images', 'ui');
  mkdirSync(dir, { recursive: true });

  const meta = {};
  for (const a of LIST) {
    writeFileSync(join(dir, a.name + '.png'), Buffer.from(data[a.name].split(',')[1], 'base64'));
    meta[a.name] = { w: a.w, h: a.h, slice: (a.slice || 0) * SCALE };
    console.log(`${a.name}: ${a.w}x${a.h}  png ${a.w * SCALE}x${a.h * SCALE}` + (a.slice ? `  slice ${a.slice}` : ''));
  }

  let js = `/**\n * UI 素材元数据（由 tools/build-ui-assets.mjs 自动生成，不要手改）\n * ------------------------------------------------------------\n * w / h   逻辑绘制尺寸；slice 为源码像素的 9-slice 切边（PNG 已按 ${SCALE}x 输出）。\n */\n`;
  js += `export const UI = ${JSON.stringify(meta, null, 2)};\n\n`;
  js += `export const UI_SCALE = ${SCALE};\n`;
  writeFileSync(join(ROOT, 'src', 'data', 'ui.js'), js);
  console.log('written src/data/ui.js');

  // 预览：深色底上排列全部素材
  const preview = await cdp.eval(`(() => {
    const L = ${JSON.stringify(LIST)};
    const D = ${JSON.stringify(data)};
    const cell = 170, H = 60 + Math.ceil(L.length / 5) * 120;
    const c = document.createElement('canvas');
    c.width = 5 * cell; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#101a30'; g.fillRect(0, 0, c.width, H);
    let done = 0;
    L.forEach((a, i) => {
      const im = new Image();
      im.onload = () => {
        const x = (i % 5) * cell + 12, y = Math.floor(i / 5) * 120 + 26;
        const w = a.w * 1, h = a.h * 1;
        g.drawImage(im, x, y, w, h);
        g.fillStyle = 'rgba(210,228,255,.7)';
        g.font = '11px sans-serif';
        g.fillText(a.name, x, y + h + 16);
        if (++done === L.length) window.__preview = c.toDataURL('image/png');
      };
      im.src = D[a.name];
    });
    return new Promise(res => {
      setTimeout(() => res(window.__preview), 3000);
    });
  })()`);
  mkdirSync(join(ROOT, '.screenshots'), { recursive: true });
  if (preview) {
    writeFileSync(join(ROOT, '.screenshots', 'ui-preview.png'), Buffer.from(preview.split(',')[1], 'base64'));
    console.log('preview saved');
  }
} catch (e) {
  console.log('ERR', e.stack || e.message);
} finally {
  if (cdp) { try { await cdp.send('Browser.close'); } catch { } }
  try { browser.kill(); } catch { }
}
process.exit(0);
