/**
 * 主循环与场景路由
 * ------------------------------------------------------------
 * 一个 requestAnimationFrame 驱动全部逻辑：
 *   计算 dt（上限 50ms，防止切后台回来瞬移）
 *   → update（各场景自己的逻辑）
 *   → Sound.tick（提前排音符）
 *   → render（各场景自己的绘制）
 *   → 清空瞬时输入
 *
 * 场景表是唯一的路由表：加场景 = 在这里加一行。
 */
import { ctx, applyScreen, applyWorld, screenBounds, getView } from './stage.js';
import { game } from './state.js';
import { edge, clearPressed, clearHotspots, updateCursor } from './input.js';
import { Sound, toggleMusic } from '../audio/sound.js';

import { updateMenu, drawMenu } from '../scenes/menu.js';
import { updateHelp, drawHelp } from '../scenes/help.js';
import { updateSelect, drawSelect } from '../scenes/select.js';
import { updateBattle, drawBattle } from '../scenes/battle.js';
import { updateResult, drawResult } from '../scenes/result.js';

/** 场景路由表 */
const SCENES = {
  menu: { update: updateMenu, draw: drawMenu },
  help: { update: updateHelp, draw: drawHelp },
  select: { update: updateSelect, draw: drawSelect },
  battle: { update: updateBattle, draw: drawBattle },
  result: { update: updateResult, draw: drawResult }
};

/**
 * 每帧逻辑推进。
 * @param {number} dt 距上一帧的秒数
 */
export function update(dt) {
  game.t += dt;
  game.enterT += dt;
  game.fade = Math.max(0, game.fade - dt * 3.6);

  // 全局 M 键静音（战斗里不要再重复处理，否则一按就抵消）
  if (edge('KeyM')) toggleMusic();

  const scene = SCENES[game.scene];
  if (scene) scene.update(dt);

  game.mouseActive = false;
}

/** 每帧绘制 */
export function render() {
  clearHotspots();
  // 清屏：画布现在铺满窗口，必须在屏幕坐标下清整块
  applyScreen();
  const v = getView();
  ctx.clearRect(0, 0, v.w, v.h);
  applyWorld();

  const scene = SCENES[game.scene] || SCENES.menu;
  scene.draw();

  // 场景切换黑场（盖满整块屏幕，黑边区域也要压黑）
  if (game.fade > 0) {
    const b = screenBounds();
    ctx.fillStyle = 'rgba(4,6,13,' + game.fade + ')';
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
}

/** 启动主循环 */
export function startLoop() {
  let lastTs = performance.now();

  function frame(ts) {
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, .05);

    update(dt);
    Sound.tick();
    render();
    updateCursor();

    clearPressed();
    game.click = null;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
