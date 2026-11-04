/**
 * 场景：操作说明
 * ------------------------------------------------------------
 * 左栏 1P、右栏 2P 的按键表 + 规则说明，右下角一颗返回按钮。
 * 进入前会记录来源场景（game.helpFrom），退出时回到那里。
 */
import { ctx, screenBounds } from '../core/stage.js';
import { FONT } from '../core/constants.js';
import { game, goScene } from '../core/state.js';
import { edge, hot, hitHotspot } from '../core/input.js';
import { txt, txtO, centeredRect } from '../gfx/draw.js';
import { panelButton, keycap, drawPanel, drawIcon } from '../gfx/ui.js';
import { drawScene } from '../gfx/scenery.js';
import { Sound } from '../audio/sound.js';

export function drawHelp() {
  drawScene();
  const b = screenBounds();
  ctx.fillStyle = 'rgba(6,12,26,.62)'; ctx.fillRect(b.x, b.y, b.w, b.h);

  drawPanel(150, 66, 980, 588);

  txt('操作说明', 640, 124, 44, '#14304a', 'center', 700, 1);
  txt('按键与规则', 640, 160, 13, 'rgba(20,48,74,.75)', 'center', 700, 1);

  txt('1P · 天蓝方', 208, 202, 20, '#0e8fc9', 'left', 700, 1);
  txt('2P · 红方', 706, 202, 20, '#e04c3f', 'left', 700, 1);

  /** 一行「图标 + 动作 + 键帽 + 说明」 */
  const keyRow = (x, y, label, keys, desc, icon) => {
    drawIcon(icon, x + 9, y + 14, 18, .9);
    txt(label, x + 24, y + 14, 15, 'rgba(20,48,74,.8)', 'left', 800, 0);
    let kx = x + 86;
    keys.forEach(k => { kx += keycap(kx, y, k, null, 15) + 6; });
    txt(desc, kx + 10, y + 14, 14, 'rgba(20,48,74,.75)', 'left', 700, 0);
  };

  keyRow(208, 228, '移动', ['A', 'D'], '左右移动', 'move');
  keyRow(208, 274, '跳跃', ['W'], '可跳过地面攻击', 'jump');
  keyRow(208, 320, '攻击', ['J'], '命中造成硬直', 'attack');
  keyRow(208, 366, '防御', ['K'], '按住格挡，少掉体力', 'block');

  keyRow(706, 228, '移动', ['←', '→'], '左右移动', 'move');
  keyRow(706, 274, '跳跃', ['↑'], '可跳过地面攻击', 'jump');
  keyRow(706, 320, '攻击', ['Enter'], '或小键盘 1 / 句号键', 'attack');
  keyRow(706, 366, '防御', ['右Shift'], '或小键盘 2 / 逗号键', 'block');

  ctx.strokeStyle = 'rgba(18,48,80,.14)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(208, 412); ctx.lineTo(1072, 412); ctx.stroke();

  txt('规则', 208, 440, 16, '#a86800', 'left', 800, 1);
  txt('· 防御成功只受约 16% 伤害，但会消耗少量体力。', 214, 472, 16, 'rgba(20,48,74,.86)', 'left', 700);
  txt('· 跳跃可躲开地面攻击。', 214, 502, 16, 'rgba(20,48,74,.86)', 'left', 700);
  txt('· 99 秒结束，剩余体力多者获胜；相同为平局。', 214, 532, 16, 'rgba(20,48,74,.86)', 'left', 700);

  const br = centeredRect(640, 604, 190, 40);
  panelButton(br.x, br.y, br.w, br.h, '返回', null, '#159ad6', false, 20, 'back');
  hot(br.x, br.y, br.w, br.h, 'help:back');

  txtO('ESC 返回', 640, 672, 13, 'rgba(255,255,255,.98)', 'rgba(6,12,26,.9)', 3, 'center', 800, FONT, 1);
}

export function updateHelp() {
  if (edge('Escape', 'Enter', 'Space', 'KeyJ')) {
    goScene(game.helpFrom || 'menu');
    Sound.sfx('ui');
    return;
  }
  if (game.click) {
    const act = hitHotspot(game.click);
    if (act === 'help:back') {
      goScene(game.helpFrom || 'menu');
      Sound.sfx('ui');
    }
  }
}
