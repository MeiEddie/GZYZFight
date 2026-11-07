/**
 * 场景：结算
 * ------------------------------------------------------------
 * 左侧胜者立绘 + 彩带，右侧数据面板（伤害 / 最高连击 / 剩余体力 / 时长），
 * 底部三个按钮：再战、换角色、主菜单。
 */
import { ctx, screenBounds } from '../core/stage.js';
import { W, H, FONT } from '../core/constants.js';
import { clamp, easeOut, rand } from '../core/math.js';
import { game, goScene } from '../core/state.js';
import { edge, hot, hitHotspot } from '../core/input.js';
import { txt, txtO, ellipse } from '../gfx/draw.js';
import { panelButton, drawPanel } from '../gfx/ui.js';
import { drawScene } from '../gfx/scenery.js';
import { drawSpriteCharAt } from '../gfx/sprite-render.js';
import { Sound } from '../audio/sound.js';
import { startBattle } from './battle.js';
import { startSelect } from './select.js';

export function drawResult() {
  const r = game.result;
  if (!r) return;

  const winner = r.winnerSide ? (r.winnerSide === 1 ? r.p1 : r.p2) : null;
  const loser = r.winnerSide ? (r.winnerSide === 1 ? r.p2 : r.p1) : null;

  // 背景
  drawScene();
  const b = screenBounds();
  const ov = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  ov.addColorStop(0, 'rgba(6,12,26,.55)');
  ov.addColorStop(.5, 'rgba(6,12,26,.4)');
  ov.addColorStop(1, 'rgba(6,12,26,.72)');
  ctx.fillStyle = ov; ctx.fillRect(b.x, b.y, b.w, b.h);

  // 彩带
  for (const c of r.confetti) {
    ctx.save();
    ctx.translate(c.x, c.y); ctx.rotate(c.rot);
    ctx.globalAlpha = .8;
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
    ctx.restore();
  }

  // 胜者展示
  const ent = easeOut(clamp(game.resultT / .55, 0, 1));
  if (winner) {
    ellipse(330, 650, 150, 26, '#000', .3);

    drawSpriteCharAt(330, 650, winner.def, { state: 'win', facing: 1, scale: 1.72, t: game.t });

    if (loser) {
      ctx.save();
      ctx.globalAlpha = .55;
      drawSpriteCharAt(520, 664, loser.def, { state: 'ko', stateT: 5, facing: -1, scale: 1.0, t: game.t });
      ctx.restore();
    }
    txtO('胜者', 330, 686, 14, 'rgba(255,225,170,.95)', 'rgba(6,12,26,.9)', 3, 'center', 800, FONT, 2);
  } else {
    drawSpriteCharAt(268, 650, r.p1.def, { facing: 1, scale: 1.25, t: game.t });
    drawSpriteCharAt(404, 650, r.p2.def, { facing: -1, scale: 1.25, t: game.t });
    txtO('平局', 336, 686, 14, 'rgba(255,225,170,.95)', 'rgba(6,12,26,.9)', 3, 'center', 800, FONT, 2);
  }

  // 右侧信息（入场时从左往右滑入）
  const slide = (1 - ent) * 40;
  ctx.save();
  ctx.translate(slide, 0);

  txtO(r.reason === 'ko' ? '击倒获胜' : '时间判定', 652, 132, 14, 'rgba(255,225,170,.95)', 'rgba(6,12,26,.9)', 3, 'left', 800);

  if (winner) {
    txtO(winner.def.name, 648, 214, 62, '#f6f9ff', 'rgba(6,12,26,.92)', 5, 'left', 900, FONT, 1);
    txtO(winner.def.role + ' · ' + winner.def.tag, 652, 262, 16, 'rgba(215,231,252,.95)', 'rgba(6,12,26,.9)', 3, 'left', 800, FONT);
    // 胜利介绍（roster.js 的 intro），最多 3 行
    wrapIntro(winner.def.intro).forEach((ln, i) =>
      txtO(ln, 652, 298 + i * 24, 15, 'rgba(232,242,255,.96)', 'rgba(6,12,26,.9)', 3, 'left', 600, FONT, 0.5));
  } else {
    txtO('平 局', 648, 220, 62, '#f6f9ff', 'rgba(6,12,26,.92)', 5, 'left', 900, FONT, 1);
    txtO('双方体力相当', 652, 268, 16, 'rgba(215,231,252,.95)', 'rgba(6,12,26,.9)', 3, 'left', 800, FONT);
  }

  // 数据面板
  const bx = 648, by = 366, bw = 536, bh = 176;
  drawPanel(bx, by, bw, bh);

  let rows;
  if (winner) {
    rows = [
      ['造成伤害', winner.dealt.toFixed(1)],
      ['最高连击', winner.maxCombo + ' 连击'],
      ['剩余体力', Math.round(winner.hp) + ' / ' + winner.maxHp],
      ['对局时长', fmtTime(r.duration)]
    ];
  } else {
    rows = [
      ['1P 剩余体力', Math.round(r.p1.hp)],
      ['2P 剩余体力', Math.round(r.p2.hp)],
      ['对局时长', fmtTime(r.duration)],
      ['结束方式', '时间到']
    ];
  }

  rows.forEach((row, i) => {
    const y = by + 34 + i * 36;
    txt(row[0], bx + 26, y, 15, 'rgba(20,48,74,.74)', 'left', 700, 1.2);
    txt(row[1], bx + bw - 26, y, i === 0 ? 25 : 22, '#0f7bb0', 'right', 700);
    if (i < 3) {
      ctx.strokeStyle = 'rgba(18,48,80,.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + 26, y + 18); ctx.lineTo(bx + bw - 26, y + 18); ctx.stroke();
    }
  });
  ctx.restore();

  // 操作按钮
  const actions = [
    { label: '再 战', accent: '#159ad6' },
    { label: '换角色', accent: '#d99a00' },
    { label: '主菜单', accent: '#ef5b4d' }
  ];
  for (let i = 0; i < 3; i++) {
    const x = 652 + i * 186, y = 584;
    panelButton(x, y, 170, 54, actions[i].label, null, actions[i].accent, game.resultIndex === i, 22);
    hot(x, y, 170, 54, 'result:' + i);
  }

  txtO('← → 选择    ENTER 确认    ESC 返回', 640, 690, 13, 'rgba(232,243,255,.96)', 'rgba(6,12,26,.9)', 3, 'center', 800, FONT, 1);
}

export function updateResult(dt) {
  game.resultT += dt;

  const r = game.result;
  if (r) {
    for (const c of r.confetti) {
      c.y += c.vy * dt;
      c.x += c.vx * dt + Math.sin(game.t * 2 + c.ph) * 24 * dt;
      c.rot += c.vr * dt;
      if (c.y > H + 20) { c.y = -20; c.x = rand(0, W); }
      if (c.x < -20) c.x = W + 10;
      if (c.x > W + 20) c.x = -10;
    }
  }

  if (edge('ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW')) { game.resultIndex = (game.resultIndex + 2) % 3; Sound.sfx('select'); }
  if (edge('ArrowRight', 'KeyD', 'ArrowDown', 'KeyS')) { game.resultIndex = (game.resultIndex + 1) % 3; Sound.sfx('select'); }
  if (edge('Enter', 'Space', 'KeyJ')) resultAction(game.resultIndex);
  if (edge('Escape')) resultAction(2);

  if (game.click) {
    const act = hitHotspot(game.click);
    if (act && act.indexOf('result:') === 0) resultAction(parseInt(act.slice(7), 10));
  }
}

/** 0 再战 / 1 换角色 / 2 回主菜单 */
export function resultAction(i) {
  Sound.unlock();
  if (i === 0) {
    Sound.sfx('confirm');
    startBattle();
  } else if (i === 1) {
    Sound.sfx('confirm');
    startSelect();
  } else {
    Sound.sfx('ui');
    game.battle = null;
    goScene('menu');
  }
}

/** 秒 → m:ss */
export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/** 胜利介绍按可用宽度折行，最多 3 行（再多会压到数据面板） */
function wrapIntro(s) {
  if (!s) return [];
  const maxW = 516, size = 15;
  ctx.save();
  ctx.font = '500 ' + size + 'px ' + FONT;
  const lines = [];
  let line = '';
  for (const ch of Array.from(s)) {
    if (line && ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; }
    else line += ch;
    if (lines.length === 3) break;
  }
  if (lines.length < 3 && line) lines.push(line);
  ctx.restore();
  return lines;
}
