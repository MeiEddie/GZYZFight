/**
 * 数学 / 随机 工具函数
 * ------------------------------------------------------------
 * 纯函数，无副作用，任何模块都可以引用。
 */

/** 把 v 限制在 [a, b] 区间 */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 线性插值 */
export const lerp = (a, b, t) => a + (b - a) * t;

/** 缓出（快进慢出），t ∈ [0,1] */
export const easeOut = t => 1 - Math.pow(1 - t, 3);

/** 区间随机数 */
export const rand = (a, b) => a + Math.random() * (b - a);

/** 从数组里随机取一项 */
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
