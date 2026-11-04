/**
 * 通用 UI 组件（精灵图版）
 * ------------------------------------------------------------
 * 按钮 / 弹窗底板 / 血条 / 图标全部来自 assets/images/ui/ 下的独立 PNG：
 *   - 9-slice 拉伸，一份素材适配任意尺寸
 *   - 纯色 + 1px 描边，没有渐变与阴影，绘制开销稳定
 * 素材由 tools/build-ui-assets.mjs 生成，尺寸元数据在 src/data/ui.js。
 *
 * 键帽这类小控件仍由代码直接绘制（成本极低且无需拉伸）。
 */
import { ctx } from '../core/stage.js';
import { clamp } from '../core/math.js';
import { fillRR, strokeRR, txt, hexA } from './draw.js';
import { assets } from '../resources/loader.js';
import { UI } from '../data/ui.js';

const bitmap = key => assets.get('ui.' + key);
const metaOf = key => UI[key];

/**
 * 9-slice 贴图。素材按 2x 输出，这里按逻辑尺寸绘制，高 DPI 下也清晰。
 * @param {string} key 素材名（不含 ui. 前缀）
 */
function nineSlice(key, x, y, w, h) {
  const img = bitmap(key);
  const m = metaOf(key);
  if (!img || !m) return;

  if (!m.slice || w <= 0 || h <= 0) {
    ctx.drawImage(img, x, y, w, h);
    return;
  }

  const sw = img.width, sh = img.height;
  const unit = sw / m.w;                 // 源像素 / 逻辑像素
  let sl = m.slice;                      // 源像素切边
  let ds = sl / unit;                    // 目标切边（逻辑像素）

  // 尺寸小于两倍切边时缩小切边，避免边框互相挤压
  if (w < ds * 2 || h < ds * 2) {
    ds = Math.min(w, h) / 2;
    sl = ds * unit;
  }

  const midW = sw - sl * 2, midH = sh - sl * 2;
  const dmW = w - ds * 2, dmH = h - ds * 2;

  // 四角
  ctx.drawImage(img, 0, 0, sl, sl, x, y, ds, ds);
  ctx.drawImage(img, sw - sl, 0, sl, sl, x + w - ds, y, ds, ds);
  ctx.drawImage(img, 0, sh - sl, sl, sl, x, y + h - ds, ds, ds);
  ctx.drawImage(img, sw - sl, sh - sl, sl, sl, x + w - ds, y + h - ds, ds, ds);
  // 四边
  if (dmW > 0) {
    ctx.drawImage(img, sl, 0, midW, sl, x + ds, y, dmW, ds);
    ctx.drawImage(img, sl, sh - sl, midW, sl, x + ds, y + h - ds, dmW, ds);
  }
  if (dmH > 0) {
    ctx.drawImage(img, 0, sl, sl, midH, x, y + ds, ds, dmH);
    ctx.drawImage(img, sw - sl, sl, sl, midH, x + w - ds, y + ds, ds, dmH);
  }
  // 中心
  if (dmW > 0 && dmH > 0) ctx.drawImage(img, sl, sl, midW, midH, x + ds, y + ds, dmW, dmH);
}

/** 弹窗底板（暂停 / 说明 / 结算数据框通用） */
export function drawPanel(x, y, w, h) {
  nineSlice('panel', x, y, w, h);
}

/**
 * 绘制一枚图标（居中于 cx/cy）。
 * @param {string} name move / jump / attack / block / sound-on / sound-off / back
 */
export function drawIcon(name, cx, cy, size, alpha) {
  const img = bitmap('icon-' + name);
  if (!img) return;
  const s = size || 24;
  ctx.save();
  if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
  ctx.restore();
}

/**
 * 面板按钮（菜单 / 暂停 / 结算通用）
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} label 主文字
 * @param {string|null} sub 副文字
 * @param {string} accent 主题色（左侧色条）
 * @param {boolean} active 是否选中（上浮 + hover 底图）
 * @param {number} [size] 主文字字号
 * @param {string} [icon] 可选的左侧图标名
 * @param {boolean} [disabled] 禁用态（换底图并压暗文字）
 */
export function panelButton(x, y, w, h, label, sub, accent, active, size, icon, disabled) {
  ctx.save();
  if (active && !disabled) ctx.translate(0, -2);

  nineSlice(disabled ? 'btn-disabled' : active ? 'btn-hover' : 'btn-normal', x, y, w, h);

  // 主题色条：按钮唯一带颜色的装饰，用来区分功能
  fillRR(x + 12, y + 13, 4, h - 26, 1, disabled ? hexA(accent, .3) : accent);

  const lineY = y + h / 2 - (sub ? 9 : 0);
  if (icon) drawIcon(icon, x + 39, lineY, 18, disabled ? .3 : 1);

  const tx = x + 30 + (icon ? 26 : 0);
  txt(label, tx, lineY, size || 27, disabled ? 'rgba(20,48,74,.35)' : '#14304a', 'left', 800);
  if (sub) {
    txt(sub, tx + 1, y + h / 2 + 15, 12,
      disabled ? 'rgba(20,48,74,.22)' : 'rgba(20,48,74,.68)', 'left', 700, 1);
  }
  ctx.restore();
}

/**
 * 键帽样式的小标签。
 * @returns {number} 键帽实际宽度（方便排下一颗）
 */
export function keycap(x, y, label, color, size) {
  const fs = size || 15;
  const w = Math.max(30, label.length * fs * .72 + 20);
  fillRR(x, y, w, 28, 2, 'rgba(255,255,255,.97)');
  strokeRR(x, y, w, 28, 2, color || '#1587c9', 1.4);
  txt(label, x + w / 2, y + 14, fs, '#12314f', 'center', 800);
  return w;
}

/**
 * 血条：底槽 + 延迟白影 + 填充 + 刻度瓦片。
 * @param {boolean} flip 2P 用，整体镜像后从右向左掉血
 */
export function drawHealthBar(x, y, w, h, p, color, flip) {
  const ratio = clamp(p.hp / p.maxHp, 0, 1);
  const ghost = clamp(p.displayHp / p.maxHp, 0, 1);
  const full = w - 6;

  ctx.save();
  ctx.translate(x, y);
  if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.transform(1, 0, -.16, 1, 0, 0);

  nineSlice('bar-track', 0, 0, w, h);

  // 延迟血量（受击后缓慢回落的那一条）
  if (ghost > 0) fillRR(3, 3, full * ghost, h - 6, 2, 'rgba(255,178,64,.55)');

  // 实际血量
  const fillW = full * ratio;
  if (fillW > 0) {
    nineSlice(color === '#ff6d60' ? 'bar-fill-red' : 'bar-fill-blue', 3, 3, fillW, h - 6);
  }

  // 十格刻度（瓦片横向平铺，关掉插值保证线条干净）
  const ticks = bitmap('bar-ticks');
  if (ticks) {
    const tileW = full / 10;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < 9; i++) ctx.drawImage(ticks, 3 + i * tileW, 3, tileW, h - 6);
    ctx.restore();
  }

  ctx.restore();
}
