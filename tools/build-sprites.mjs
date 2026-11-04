/**
 * 精灵图构建器（一次性素材工具，不属于运行时）
 * ------------------------------------------------------------
 * 输入：AI 生成的绿幕动作表（4×2 八姿势 + 1×2 KO/胜利）
 * 处理：绿幕抠除 → 去溢色 → 去杂点 → 分格 → 统一比例 → 锚点对齐 → 拼成一张带 alpha 的 webp
 * 输出：assets/images/sprites/<id>.webp + src/data/sprites.js（元数据）
 *
 * 用法：node tools/build-sprites.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9341;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BIN = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
             'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const BASE = 'http://127.0.0.1:3000';

/** 动作表来源：main = 4×2 八姿势，ext = 1×2（KO / 胜利） */
const CHARS = [
  { id: 'lan',    main: '/assets/images/poses/sheet-lan-photo.jpg',    ext: '/assets/images/poses/ext-lan.jpg' },
  { id: 'zang',   main: '/assets/images/poses/sheet-zang-photo.jpg',   ext: '/assets/images/poses/ext-zang.jpg' },
  // man 用 sheet-man-walk.jpg：第 2 格（walkA）与第 3 格（walkB）都取自原表像素，
  // 不引入任何 AI 生成帧，保证画风 100% 一致。第 3 格由第 2 格做下半身渐进收拢形变
  // （腰线以下绕骨盆中轴压缩到 0.80，smoothstep 过渡）得到，等于 lan 那种
  // 「剪刀腿 → 收腿通过」的两帧走路结构：walkA 迈开、walkB 收拢，交替即步伐
  { id: 'man',    main: '/assets/images/poses/sheet-man-walk.jpg',    ext: '/assets/images/poses/ext-man.jpg' },
  { id: 'zhuang', main: '/assets/images/poses/sheet-zhuang-photo.jpg', ext: '/assets/images/poses/ext-zhuang.jpg' }
];

/** 目标：站立身高（精灵图内像素）。越大越清晰，文件越大 */
const TARGET_H = 420;
const PAD = 16;
const INSET = 12;          // 排除格子分隔线与边缘杂色
const KO_X_CENTER = true;  // KO 用水平居中锚点

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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); } }, 300000);
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

/* 注入到页面里的处理函数（只跑一次） */
const PAGE_FN = String.raw`
window.__buildSprites = async function (CHARS, TARGET_H, PAD, INSET, KO_X_CENTER) {
  const loadImage = (src) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('图加载失败 ' + src)); im.src = src;
  });
  const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* 1) 绿幕抠图 + 去溢色 */
  async function keyed(src) {
    const img = await loadImage(src);
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = makeCanvas(W, H);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, W, H);
    const d = id.data;

    // 边框采样得到背景色
    const pts = [];
    const M = 6, STEP = 11;
    for (let k = 0; k * STEP < W - 2 * M; k++) {
      pts.push([M + k * STEP, M], [W - M - k * STEP, H - M], [M + k * STEP, H - M], [W - M - k * STEP, M]);
    }
    const bg = [0, 1, 2].map(ch => {
      const v = pts.map(p => d[(p[1] * W + p[0]) * 4 + ch]).sort((a, b) => a - b);
      return v[v.length >> 1];
    });

    const IN = 44, OUT = 104;
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const dist = Math.sqrt((r - bg[0]) ** 2 + (gg - bg[1]) ** 2 + (b - bg[2]) ** 2);
      let a = dist <= IN ? 0 : dist >= OUT ? 1 : (dist - IN) / (OUT - IN);
      // despill：任何情况下绿通道不高于 r/b 的最大值
      const mx = Math.max(r, b);
      if (gg > mx) d[i + 1] = mx;
      d[i + 3] = Math.round(a * 255);
    }
    g.putImageData(id, 0, 0);
    return { cv, W, H, bg };
  }

  /* 2) 分格：去掉小杂点、求 bbox / 锚点 */
  function splitCells(cv, cols, rows) {
    const W = cv.width, H = cv.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const id = g.getImageData(0, 0, W, H);
    const d = id.data;
    const cw = W / cols, ch = H / rows;
    const out = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor(c * cw), y0 = Math.floor(r * ch);
        const x1 = Math.floor((c + 1) * cw), y1 = Math.floor((r + 1) * ch);
        const iw = x1 - x0 - INSET * 2, ih = y1 - y0 - INSET * 2;

        // 连通域标记（4 邻接），只保留足够大的块
        const mask = new Uint8Array(iw * ih);
        for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++)
          mask[y * iw + x] = d[((y + y0 + INSET) * W + (x + x0 + INSET)) * 4 + 3] > 10 ? 1 : 0;
        const label = new Int32Array(iw * ih).fill(-1);
        const areas = [];
        const stack = new Int32Array(iw * ih);
        for (let s = 0; s < iw * ih; s++) {
          if (!mask[s] || label[s] >= 0) continue;
          const lb = areas.length; let n = 0, top = 0;
          stack[top++] = s; label[s] = lb;
          while (top) {
            const p = stack[--top]; n++;
            const px = p % iw, py = (p / iw) | 0;
            if (px > 0 && mask[p - 1] && label[p - 1] < 0) { label[p - 1] = lb; stack[top++] = p - 1; }
            if (px < iw - 1 && mask[p + 1] && label[p + 1] < 0) { label[p + 1] = lb; stack[top++] = p + 1; }
            if (py > 0 && mask[p - iw] && label[p - iw] < 0) { label[p - iw] = lb; stack[top++] = p - iw; }
            if (py < ih - 1 && mask[p + iw] && label[p + iw] < 0) { label[p + iw] = lb; stack[top++] = p + iw; }
          }
          areas.push(n);
        }
        let big = 1;
        for (let i = 0; i < areas.length; i++) if (areas[i] > big) big = areas[i];
        const keep = areas.map(a => a >= big * 0.06);
        for (let p = 0; p < iw * ih; p++) {
          if (label[p] >= 0 && !keep[label[p]]) {
            const gx = x0 + INSET + (p % iw), gy = y0 + INSET + ((p / iw) | 0);
            d[(gy * W + gx) * 4 + 3] = 0;
          }
        }

        // bbox + 55%~75% 带内的 alpha 质心（骨盆附近，比整体质心稳）
        let bx0 = iw, by0 = ih, bx1 = -1, by1 = -1;
        for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++)
          if (mask[y * iw + x] && label[y * iw + x] >= 0 && keep[label[y * iw + x]]) {
            if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
            if (y < by0) by0 = y; if (y > by1) by1 = y;
          }
        let cx = 0, cy = 0, cn = 0;
        const bandA = by0 + (by1 - by0) * 0.55, bandB = by0 + (by1 - by0) * 0.75;
        for (let y = Math.ceil(bandA); y <= Math.floor(bandB); y++)
          for (let x = bx0; x <= bx1; x++) {
            if (mask[y * iw + x] && label[y * iw + x] >= 0 && keep[label[y * iw + x]]) { cx += x; cy += y; cn++; }
          }
        if (!cn) { cx = (bx0 + bx1) / 2; cy = by1; cn = 1; }

        // 发顶：bbox 顶部往下找最暗的像素行
        let hairTop = by0;
        for (let y = by0; y < by0 + 4 && y < ih; y++) {
          let dark = false;
          for (let x = bx0; x <= bx1; x++) {
            const gi = ((y + y0 + INSET) * W + (x + x0 + INSET)) * 4;
            if (d[gi + 3] > 32 && d[gi] < 78 && d[gi + 1] < 78 && d[gi + 2] < 78) { dark = true; break; }
          }
          if (dark) { hairTop = y; break; }
        }

        out.push({
          cell: [c, r],
          sx: x0 + INSET + bx0, sy: y0 + INSET + by0,
          w: bx1 - bx0 + 1, h: by1 - by0 + 1,
          ax: cx / cn + (x0 + INSET) - (x0 + INSET + bx0),   // 相对 bbox 左上
          ay: by1 - by0 + 1,
          hairTop: hairTop - by0
        });
      }
    }
    g.putImageData(id, 0, 0);
    return out;
  }

  /* 3) 单个角色：抠图 → 分格 → 统一比例 → 拼版 */
  async function buildChar(def) {
    const main = await keyed(def.main);
    const ext = await keyed(def.ext);
    const fMain = splitCells(main.cv, 4, 2);
    const fExt = splitCells(ext.cv, 2, 1);

    // 每张图一个缩放系数：以「站立、手臂不过头」的帧为基准
    const kMain = TARGET_H / (fMain[0].h);                        // idle
    const winF = fExt[1];
    const kExt = TARGET_H / (winF.ay - winF.hairTop);             // 胜利帧：脚底到发顶

    // 统一成「缩放后的帧」：{cv, dw, dh, ax, ay, isKO}
    const scaled = [];
    const tmp = makeCanvas(8, 8);
    const tg = tmp.getContext('2d');

    const pushFrame = (srcCv, f, k, isKO) => {
      const dw = Math.round(f.w * k), dh = Math.round(f.h * k);
      tmp.width = dw; tmp.height = dh;
      tg.clearRect(0, 0, dw, dh);
      tg.drawImage(srcCv, f.sx, f.sy, f.w, f.h, 0, 0, dw, dh);
      if (!isKO) {
        scaled.push({ cv: makeCanvas(dw, dh), dw, dh, ax: f.ax * k, ay: dh, isKO: false });
        scaled[scaled.length - 1].cv.getContext('2d').drawImage(tmp, 0, 0);
        return;
      }
      // KO：逆时针旋转 90°，让身体横躺
      const rot = makeCanvas(dh, dw);
      const rg = rot.getContext('2d');
      rg.translate(0, dw);
      rg.rotate(-Math.PI / 2);
      rg.drawImage(tmp, 0, 0);
      const tw = dh, th = dw;
      const ax = KO_X_CENTER ? tw / 2 : (th - f.ax * k);
      const ay = th;      // 贴地
      scaled.push({ cv: rot, dw: tw, dh: th, ax, ay, isKO: true });
    };

    for (const f of fMain) pushFrame(main.cv, f, kMain, false);
    pushFrame(ext.cv, fExt[0], kExt, true);
    pushFrame(ext.cv, fExt[1], kExt, false);

    // 统一 slot：锚点到左右、上下的最大距离
    let halfW = 1, upH = 1, downH = 1;
    for (const s of scaled) {
      halfW = Math.max(halfW, s.ax, s.dw - s.ax);
      upH = Math.max(upH, s.ay);
      downH = Math.max(downH, s.dh - s.ay);
    }
    const slotW = Math.ceil(halfW * 2) + PAD * 2;
    const slotH = Math.ceil(upH + downH) + PAD * 2;
    const axSlot = slotW / 2;
    const aySlot = slotH - PAD - downH;

    const cols = 5, rows = 2;
    const sheet = makeCanvas(slotW * cols, slotH * rows);
    const sg = sheet.getContext('2d');
    const frames = [];
    scaled.forEach((s, i) => {
      const ox = (i % cols) * slotW, oy = Math.floor(i / cols) * slotH;
      sg.drawImage(s.cv, ox + axSlot - s.ax, oy + aySlot - s.ay);
      frames.push({ ax: axSlot - s.ax, ay: aySlot - s.ay, w: s.dw, h: s.dh });
    });

    // HUD 头像：在 idle 帧自身画布上找发顶区域的暗色横向质心
    const idle = scaled[0];
    const idleImg = idle.cv.getContext('2d').getImageData(0, 0, idle.dw, idle.dh);
    const bandY1 = Math.min(idle.dh, Math.round(TARGET_H * 0.15));
    let hsum = 0, hcnt = 0;
    for (let y = 0; y < bandY1; y++) {
      for (let x = 0; x < idle.dw; x++) {
        const i4 = (y * idle.dw + x) * 4;
        if (idleImg.data[i4 + 3] > 40 &&
            idleImg.data[i4] < 80 && idleImg.data[i4 + 1] < 80 && idleImg.data[i4 + 2] < 80) {
          hsum += x; hcnt++;
        }
      }
    }
    const localHx = hcnt > 80 ? hsum / hcnt : idle.dw / 2;
    const head = {
      x: frames[0].ax + localHx,
      y: frames[0].ay + TARGET_H * 0.075,
      r: TARGET_H * 0.086
    };

    return {
      id: def.id,
      w: sheet.width, h: sheet.height,
      slotW, slotH, cols,
      anchorX: axSlot, anchorY: aySlot,
      frames, head,
      bodyH: TARGET_H,
      webp: sheet.toDataURL('image/webp', 0.92)
    };
  }

  const results = [];
  for (const def of CHARS) results.push(await buildChar(def));
  return results;
};
`;

const browser = spawn(BIN, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
  '--window-size=1400,800', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + join(ROOT, '.screenshots', '.cdp-sprite'), 'about:blank'], { stdio: 'ignore' });

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
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: BASE + '/index.html' });
  await sleep(1600);

  await cdp.eval(PAGE_FN);
  const data = await cdp.eval(`window.__buildSprites(${JSON.stringify(CHARS)}, ${TARGET_H}, ${PAD}, ${INSET}, ${KO_X_CENTER})`);

  const dir = join(ROOT, 'assets', 'images', 'sprites');
  mkdirSync(dir, { recursive: true });

  let js = `/**\n * 角色精灵图元数据（由 tools/build-sprites.mjs 自动生成，不要手改）\n * ------------------------------------------------------------\n * 每个身材一张 5 列 × 2 行的帧表：idle / walkA / walkB / jump / windup /\n * punch / block / hurt / ko / win，所有帧共用同一锚点（脚底）。\n * 头部贴图坐标不在这里，统一放在 src/data/heads.js。\n */\n`;

  const all = [];
  for (const r of data) {
    writeFileSync(join(dir, r.id + '.webp'), Buffer.from(r.webp.split(',')[1], 'base64'));
    all.push({ id: r.id, w: r.w, h: r.h, slotW: r.slotW, slotH: r.slotH, cols: r.cols,
      anchorX: r.anchorX, anchorY: r.anchorY, bodyH: r.bodyH });
    console.log(`${r.id}: sheet ${r.w}x${r.h}  slot ${r.slotW}x${r.slotH}`);
  }
  js += `export const SPRITES = ${JSON.stringify(all, null, 2)};\n`;
  writeFileSync(join(ROOT, 'src', 'data', 'sprites.js'), js);
  console.log('written src/data/sprites.js');

  // 预览：每张表 + 游戏尺寸合成
  const preview = await cdp.eval(`(() => {
    const S = ${JSON.stringify(all)};
    const W = 1600, H = 40 + S.length * 240;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#1b2440'; g.fillRect(0, 0, W, H);
    S.forEach((s, i) => {
      const img = new Image();
      img.src = 'assets/images/sprites/' + s.id + '.webp';
      g.drawImage(img, 20, 20 + i * 240, s.w * 0.42, s.h * 0.42);
    });
    return c.toDataURL('image/png');
  })()`);
  writeFileSync(join(ROOT, '.screenshots', 'sprites-preview.png'), Buffer.from(preview.split(',')[1], 'base64'));
  console.log('preview saved');
} catch (e) {
  console.log('ERR', e.stack || e.message);
} finally {
  if (cdp) { try { await cdp.send('Browser.close'); } catch { } }
  try { browser.kill(); } catch { }
}
process.exit(0);
