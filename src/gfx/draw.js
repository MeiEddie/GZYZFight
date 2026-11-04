/**
 * 2D 绘制原语
 * ------------------------------------------------------------
 * 圆角矩形、文字（含描边文字/字间距）、椭圆、颜色工具。
 * 这些函数是整个 UI 的地基，不含任何业务含义。
 */
import { ctx } from '../core/stage.js';
import { FONT } from '../core/constants.js';

/** 在 context 上铺设一条圆角矩形路径（不填充，调用方决定 fill/stroke） */
export function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 填充圆角矩形 */
export function fillRR(x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  rr(x, y, w, h, r);
  ctx.fill();
}

/** 描边圆角矩形 */
export function strokeRR(x, y, w, h, r, stroke, lw = 1) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  rr(x, y, w, h, r);
  ctx.stroke();
}

/**
 * 逐字排布（带字间距）。
 * 统一用 left 对齐量测与定位：若沿用 center 对齐逐个绘制，
 * 每个字会以起点为中心再偏移半个字宽，整段文字就会整体偏左/偏右。
 * 居中时按首尾字的墨迹边界对齐，避免「！」这类字面很宽、
 * 墨迹却偏左的标点把整段视觉重心带偏。
 * @returns {{chars: string[], xs: number[]}} 每个字的绘制左起点
 */
function layoutSpaced(s, x, letter, align) {
  const chars = Array.from(s);
  ctx.textAlign = 'left';
  const widths = chars.map(c => ctx.measureText(c).width);
  const lastW = widths[widths.length - 1];
  const total = widths.reduce((a, b) => a + b, 0) + letter * (chars.length - 1);

  let origin;
  if (align === 'right') {
    origin = x - total;
  } else if (align === 'center') {
    const first = ctx.measureText(chars[0]);
    const last = ctx.measureText(chars[chars.length - 1]);
    const inkL = typeof first.actualBoundingBoxLeft === 'number' ? -first.actualBoundingBoxLeft : 0;
    const inkR = typeof last.actualBoundingBoxRight === 'number' ? last.actualBoundingBoxRight : lastW;
    origin = x - (inkL + total - lastW + inkR) / 2;
  } else {
    origin = x;
  }

  const xs = [];
  for (let i = 0; i < chars.length; i++) {
    xs.push(origin);
    origin += widths[i] + letter;
  }
  return { chars, xs };
}

/**
 * 绘制文字（默认居中）。
 * 第 8 个参数若传入字体字符串，则当作字体使用（兼容 txt(..., weight, DISPLAY) 写法）。
 */
export function txt(s, x, y, size, color, align = 'center', weight = 700, letter = 0) {
  let font = FONT;
  if (typeof letter === 'string') { font = letter; letter = 0; }
  ctx.save();
  ctx.font = weight + ' ' + size + 'px ' + font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if (letter) {
    const { chars, xs } = layoutSpaced(s, x, letter, align);
    chars.forEach((c, i) => ctx.fillText(c, xs[i], y));
  } else {
    ctx.fillText(s, x, y);
  }
  ctx.restore();
}

/** 绘制带描边的文字（大标题、伤害飘字） */
export function txtO(s, x, y, size, fill, stroke, lw = 6, align = 'center', weight = 900, font = FONT, letter = 0) {
  ctx.save();
  ctx.font = weight + ' ' + size + 'px ' + font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  if (letter) {
    const { chars, xs } = layoutSpaced(s, x, letter, align);
    chars.forEach((c, i) => {
      ctx.strokeText(c, xs[i], y);
      ctx.fillStyle = fill;
      ctx.fillText(c, xs[i], y);
    });
  } else {
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  }
  ctx.restore();
}

/** 画一个实心椭圆（常用于影子、光斑） */
export function ellipse(x, y, rx, ry, fill, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** #rrggbb / #rgb → rgba() 字符串，便于给主题色加透明度 */
export function hexA(hex, a) {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/** 以中心点为基准的矩形（按钮居中摆放用） */
export const centeredRect = (cx, y, w, h) => ({ x: cx - w / 2, y: y, w: w, h: h });
