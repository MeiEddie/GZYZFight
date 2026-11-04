/**
 * 输入系统：键盘 + 指针
 * ------------------------------------------------------------
 * - keys     按住状态（移动、防御用）
 * - pressed  本帧刚按下（跳跃、攻击、菜单确认用），每帧末尾清空
 * - hotspots 点击热区，绘制时重建，点击时倒序命中
 */
import { cvs, toWorld } from './stage.js';
import { game } from './state.js';
import { unlockAudio } from '../audio/sound.js';

/** 按住中的按键 code 集合 */
export const keys = new Set();
/** 本帧新按下的按键 code 集合 */
export const pressed = new Set();

/** 需要阻止默认行为的按键（防止方向键滚页 / 空格滚屏） */
const PREVENT = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'Enter', 'ShiftRight', 'Backspace', 'Numpad1', 'Numpad2'
]);

/** 本帧是否「刚好按下」其中任意一个键 */
export const edge = (...codes) => codes.some(c => pressed.has(c));

/** 每帧末尾调用：清空瞬时按键 */
export function clearPressed() {
  pressed.clear();
}

/* ---------------- 键盘 ---------------- */
addEventListener('keydown', e => {
  if (PREVENT.has(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  unlockAudio();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

/* ---------------- 指针 ---------------- */
/** 把屏幕坐标换算成 1280x720 的逻辑坐标（画布铺满窗口，带居中/贴底偏移） */
function mousePos(e) {
  return toWorld(e.clientX, e.clientY);
}

cvs.addEventListener('pointermove', e => {
  game.mouse = mousePos(e);
  game.mouseActive = true;
});

cvs.addEventListener('pointerdown', e => {
  unlockAudio();
  game.mouse = mousePos(e);
  game.click = { ...game.mouse };
  if (cvs.setPointerCapture) cvs.setPointerCapture(e.pointerId);
});

cvs.addEventListener('pointerleave', () => {
  game.mouseActive = false;
  cvs.style.cursor = 'default';
});

cvs.addEventListener('contextmenu', e => e.preventDefault());

/* ---------------- 点击热区 ---------------- */
/** 当前帧的可点击区域，绘制阶段通过 hot() 重建 */
const hotspots = [];

/** 登记一个点击热区（在绘制函数里调用，坐标与视觉元素一致） */
export function hot(x, y, w, h, action) {
  hotspots.push({ x, y, w, h, action });
}

/** 清空热区，render() 每帧开头调用 */
export function clearHotspots() {
  hotspots.length = 0;
}

/** 命中检测：倒序查找，后绘制（视觉在上层）的优先 */
export function hitHotspot(p) {
  for (let i = hotspots.length - 1; i >= 0; i--) {
    const h = hotspots[i];
    if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h.action;
  }
  return null;
}

/** 点是否落在矩形内 */
export const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * 根据本帧热区切换鼠标指针形态：悬停在可交互区域时变成「手指」，其余保持箭头。
 * 在 render() 之后调用（此时各场景已重新登记完热区）。
 */
export function updateCursor() {
  const over = game.mouse ? hitHotspot(game.mouse) : null;
  const want = over ? 'pointer' : 'default';
  if (cvs.style.cursor !== want) cvs.style.cursor = want;
}
