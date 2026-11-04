/**
 * 画布与渲染上下文
 * ------------------------------------------------------------
 * 全工程只在这里取一次 canvas / 2d context，其它模块一律 import 复用，
 * 保证「一个舞台，一个上下文」，也方便以后换成 WebGL 或离屏渲染。
 *
 * 画布铺满整个窗口（CSS 100vw × 100vh），逻辑坐标仍是 1280x720：
 * 按等比缩放铺进窗口，水平居中、底边贴屏幕底。
 * 这样背景图可以盖满整块屏幕，而 HUD / 角色不会被裁切。
 */
import { W, H } from './constants.js';

/** 主画布元素 */
export const cvs = document.getElementById('game');
/** 2d 绘图上下文 */
export const ctx = cvs.getContext('2d');

/** 当前生效的像素比（上限 2，避免 4K 屏下填充率过高掉帧） */
let dpr = 1;

/** 视口尺寸（CSS 像素）与逻辑坐标的映射参数 */
let viewW = W, viewH = H;
let scale = 1;
let offsetX = 0, offsetY = 0;

/** 当前视口与逻辑坐标的映射（屏幕坐标用 CSS 像素） */
export function getView() {
  return { w: viewW, h: viewH, scale: scale, offsetX: offsetX, offsetY: offsetY, dpr: dpr };
}

/** 把 context 切回「逻辑坐标」（1280x720） */
export function applyWorld() {
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
}

/** 把 context 切到「屏幕坐标」（1 单位 = 1 CSS 像素） */
export function applyScreen() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * 整个屏幕对应的逻辑矩形。
 * 视口比 16:9 更高时，上下会多出黑边区域；用这个矩形画背景/遮罩，
 * 内容就能盖满整块屏幕，而不是只盖住 1280x720 的游戏区。
 */
export function screenBounds() {
  return {
    x: -offsetX / scale,
    y: -offsetY / scale,
    w: viewW / scale,
    h: viewH / scale
  };
}

/** 屏幕坐标（pointer 事件的 clientX / clientY）→ 逻辑坐标 */
export function toWorld(clientX, clientY) {
  const r = cvs.getBoundingClientRect();
  return {
    x: (clientX - r.left - offsetX) / scale,
    y: (clientY - r.top - offsetY) / scale
  };
}

/**
 * 适配画布：
 * 1. 画布铺满窗口，backing store 按 DPR 放大；
 * 2. 逻辑 1280x720 等比缩放：撑满窗口、水平居中、底边贴屏幕底；
 * 3. 之后所有绘制继续用 0..1280 / 0..720 的逻辑坐标。
 */
export function fitCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  cvs.width = Math.floor(viewW * dpr);
  cvs.height = Math.floor(viewH * dpr);

  scale = Math.min(viewW / W, viewH / H);
  offsetX = (viewW - W * scale) / 2;
  offsetY = viewH - H * scale;

  applyWorld();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}

addEventListener('resize', fitCanvas);
