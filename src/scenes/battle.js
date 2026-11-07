/**
 * 场景：战斗
 * ------------------------------------------------------------
 * 这里是「一局对战」的全部胶水：开局装配、每帧推进、HUD、开场演出、
 * KO 演出、暂停菜单，以及打完之后的结算交接。
 *
 * 手感相关的几个关键机制都在 updateBattle 里：
 *   hitstop  顿帧——命中瞬间冻结逻辑，硬直感来源
 *   slow     慢动作——KO 时把逻辑步长压到 0.3 倍
 *   shake    屏幕震动——命中与 KO 时抖动画面
 *   flash    白闪——重击时整屏提亮
 */
import { ctx, screenBounds } from '../core/stage.js';
import { W, H, FONT, DISPLAY } from '../core/constants.js';
import { clamp, lerp, rand, pick, easeOut } from '../core/math.js';
import { game, goScene } from '../core/state.js';
import { edge, hot, hitHotspot, pointInRect } from '../core/input.js';
import { txt, txtO, fillRR, strokeRR, hexA } from '../gfx/draw.js';
import { panelButton, drawHealthBar, drawPanel } from '../gfx/ui.js';
import { drawScene } from '../gfx/scenery.js';
import { drawFighterSprite, drawHeadIcon, BASE_H } from '../gfx/sprite-render.js';
import { drawEffects, updateEffects } from '../battle/effects.js';
import {
  mkFighter, readP1, readP2, aiInput, updateFighter,
  judgeTimeout
} from '../battle/fighter.js';
import { ROSTER } from '../data/roster.js';
import { Sound } from '../audio/sound.js';


/** 开始一局：图像与音效已在启动阶段加载完毕，直接装配双方单位并切场景 */
export function startBattle() {
  beginBattle();
}

function beginBattle() {
  const d1 = ROSTER[game.sel.p1], d2 = ROSTER[game.sel.p2];
  game.battle = {
    p1: mkFighter(d1, 1, 408, 1),
    p2: mkFighter(d2, 2, 872, -1),
    timer: 99, elapsed: 0, intro: 1.6,
    over: false, winner: null, endReason: '', ending: 0,
    hitstop: 0, shake: 0, flash: 0, slow: 1, hype: 0,
    particles: [], popups: []
  };
  game.paused = false;
  game.pauseIndex = 0;
  game.result = null;
  // 开场「准备」音效（真实素材，非合成）
  Sound.sfx('ready');
  goScene('battle');
}

/* =========================================================
   逻辑
   ========================================================= */
export function updateBattle(rdt) {
  const b = game.battle;
  if (!b) return;

  // 注意：M 键静音统一由 core/loop.js 的 update() 处理，这里不要再处理一次，
  // 否则同一帧会被切换两次、互相抵消。
  if (edge('Escape', 'KeyP')) {
    game.paused = !game.paused;
    game.pauseIndex = 0;
    Sound.sfx('ui');
  }
  if (game.paused) { updatePause(); return; }

  // HUD 中央的暂停按钮（键盘 ESC / P 仍然可用）
  if (game.click) {
    if (hitHotspot(game.click) === 'battle:pause') {
      game.paused = true;
      game.pauseIndex = 0;
      Sound.sfx('ui');
      return;
    }
  }

  updateEffects(rdt);

  // 血条追赶（视觉层用 displayHp，逻辑层用 hp）
  [b.p1, b.p2].forEach(f => {
    f.displayHp = lerp(f.displayHp, f.hp, Math.min(1, rdt * 5));
  });

  b.shake = Math.max(0, b.shake - rdt * 34);
  b.flash = Math.max(0, b.flash - rdt * 2.2);
  b.hype = Math.max(0, b.hype - rdt * 1.8);

  // KO 之后只等演出结束
  if (b.over) {
    b.p1.animT += rdt; b.p2.animT += rdt;
    b.p1.stateT += rdt; b.p2.stateT += rdt;
    b.ending -= rdt;
    if (b.ending <= 0) finishBattle();
    return;
  }

  // 开场「准备 / 开打」
  if (b.intro > 0) {
    const prev = b.intro;
    b.intro -= rdt;
    b.p1.animT += rdt; b.p2.animT += rdt;
    // 「准备」→「开打！」的瞬间
    if (prev > .55 && b.intro <= .55) Sound.sfx('fight');
    if (b.intro < 0) b.intro = 0;
    return;
  }

  // 顿帧：冻结全部逻辑
  if (b.hitstop > 0) { b.hitstop -= rdt; return; }

  const dt = rdt * b.slow;
  b.elapsed += dt;

  b.timer -= rdt;
  if (b.timer <= 0) { judgeTimeout(); return; }

  const in1 = readP1();
  const in2 = game.mode === 'pvp' ? readP2() : aiInput(b.p2, b.p1, dt);
  updateFighter(b.p1, in1, b.p2, dt);
  updateFighter(b.p2, in2, b.p1, dt);
}

/* =========================================================
   绘制
   ========================================================= */
export function drawBattle() {
  const b = game.battle;
  if (!b) return;

  // 背景先画（不进抖动位移，避免震动时屏幕边缘露出底色）
  drawScene();

  ctx.save();
  if (b.shake > 0) ctx.translate(rand(-b.shake, b.shake), rand(-b.shake, b.shake));

  // 按 x 坐标排序，靠左的先画（简化前后遮挡）
  const order = b.p1.x <= b.p2.x ? [b.p1, b.p2] : [b.p2, b.p1];
  for (const f of order) drawFighterSprite(f);
  drawEffects();
  drawPlayerCursors(b);
  ctx.restore();

  drawHUD(b);

  if (b.intro > 0) drawIntro(b);
  if (b.over) drawKO(b);
  if (b.flash > 0) {
    const s = screenBounds();
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(.35, b.flash) + ')';
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  if (game.paused) drawPause();
}

/** 顶部 HUD：头像、名字、血条、计时器、连击数 */
function drawHUD(b) {
  const s = screenBounds();
  const top = ctx.createLinearGradient(0, s.y, 0, 140);
  top.addColorStop(0, 'rgba(6,12,26,.75)');
  top.addColorStop(.65, 'rgba(6,12,26,.35)');
  top.addColorStop(1, 'rgba(6,12,26,0)');
  ctx.fillStyle = top; ctx.fillRect(s.x, s.y, s.w, 148 - s.y);

  // 1P
  fillRR(28, 28, 64, 64, 2, 'rgba(248,251,255,.95)');
  strokeRR(28, 28, 64, 64, 2, '#159ad6', 1.4);
  drawHeadIcon(60, 64, 23, b.p1.def, 1);
  txtO('1P', 28, 20, 11, '#5ec8f2', 'rgba(6,12,26,.92)', 2.5, 'left', 800, FONT, 1.5);
  txtO(b.p1.def.name, 104, 30, 24, '#f7fbff', 'rgba(6,12,26,.9)', 3, 'left', 800);
  txtO(b.p1.def.tag, 104 + 26 * b.p1.def.name.length + 12, 31, 11, hexA(b.p1.def.tagColor, .98), 'rgba(6,12,26,.92)', 2.5, 'left', 800);

  // 2P
  fillRR(1188, 28, 64, 64, 2, 'rgba(248,251,255,.95)');
  strokeRR(1188, 28, 64, 64, 2, '#e04c3f', 1.4);
  drawHeadIcon(1220, 64, 23, b.p2.def, -1);
  txtO('2P', 1252, 20, 11, '#ff7b6e', 'rgba(6,12,26,.92)', 2.5, 'right', 800, FONT, 1.5);
  txtO(b.p2.def.name, 1176, 30, 24, '#f7fbff', 'rgba(6,12,26,.9)', 3, 'right', 800);
  txtO(b.p2.def.tag, 1176 - 26 * b.p2.def.name.length - 12, 31, 11, hexA(b.p2.def.tagColor, .98), 'rgba(6,12,26,.92)', 2.5, 'right', 800);

  // 血条
  drawHealthBar(104, 46, 466, 26, b.p1, '#19aee2', false);
  drawHealthBar(710, 46, 466, 26, b.p2, '#ff6d60', true);

  txtO(b.p1.hp.toFixed(0), 104, 84, 12, 'rgba(235,244,255,.9)', 'rgba(6,12,26,.9)', 3, 'left', 800);
  txtO(b.p2.hp.toFixed(0), 1176, 84, 12, 'rgba(235,244,255,.9)', 'rgba(6,12,26,.9)', 3, 'right', 800);

  // 计时器
  fillRR(592, 26, 96, 58, 2, 'rgba(250,252,255,.95)');
  strokeRR(592, 26, 96, 58, 2, 'rgba(232,162,26,.9)', 1.2);
  const tsec = Math.ceil(Math.max(0, b.timer));
  txt(String(tsec), 640, 66, 36, b.timer < 10 ? '#e23c2b' : '#14304a', 'center', 900, DISPLAY);

  // 暂停按钮：计时器正下方，点击即暂停；按钮文字同时提示 ESC 快捷键
  const pbx = 592, pby = 92, pbw = 96, pbh = 26;
  const pbHot = game.mouseActive && game.mouse && pointInRect(game.mouse, { x: pbx, y: pby, w: pbw, h: pbh });
  fillRR(pbx, pby, pbw, pbh, 2, pbHot ? 'rgba(232,244,255,.98)' : 'rgba(248,251,255,.94)');
  strokeRR(pbx, pby, pbw, pbh, 2, pbHot ? '#159ad6' : 'rgba(18,48,80,.35)', 1.4);
  txt('暂停（Esc）', pbx + pbw / 2, pby + pbh / 2 + 1, 13, '#14304a', 'center', 800);
  hot(pbx, pby, pbw, pbh, 'battle:pause');

  // 操作指导：1P 左上、2P 右上，避开血条与计时器
  drawControlGuides(b);

  // 连击
  if (b.p1.combo >= 2 && b.p1.comboTimer > 0) {
    const k = clamp(b.p1.comboTimer / .5, 0, 1);
    ctx.save();
    ctx.globalAlpha = k;
    txtO(b.p1.combo + ' 连击', 120, 172, 20 + Math.min(b.p1.combo, 6) * 2, '#ffe9a8', '#3a2408', 4, 'left', 900);
    ctx.restore();
  }
  if (b.p2.combo >= 2 && b.p2.comboTimer > 0) {
    const k = clamp(b.p2.comboTimer / .5, 0, 1);
    ctx.save();
    ctx.globalAlpha = k;
    txtO(b.p2.combo + ' 连击', 1160, 172, 20 + Math.min(b.p2.combo, 6) * 2, '#ffe9a8', '#3a2408', 4, 'right', 900);
    ctx.restore();
  }
}

/** 战斗内操作指导：1P 固定在左上方、2P 固定在右上方，深色描边保证任何背景都清晰 */
function drawControlGuides(b) {
  const line = (s, y, align) =>
    txtO(s, align === 'left' ? 28 : 1252, y, 15, '#f4f9ff', 'rgba(6,12,26,.92)', 3.5, align, 800);

  line('移动 A / D　　跳跃 W', 112, 'left');
  line('攻击 J　　防御 K', 134, 'left');

  if (game.mode === 'pvp') {
    line('移动 ← / →　　跳跃 ↑', 112, 'right');
    line('攻击 Enter　　防御 右Shift', 134, 'right');
  } else {
    line('电脑自动操作', 123, 'right');
  }
}

/** 角色头顶的玩家光标：小三角 + 1P/2P 标签，随角色跳跃移动 */
function drawPlayerCursors(b) {
  for (const f of [b.p1, b.p2]) {
    const scale = (f.def.heightScale || 1) * (f.scale || 1);
    const color = f.side === 1 ? '#5ec8f2' : '#ff7b6e';
    const label = f.side === 1 ? '1P' : (game.mode === 'pvp' ? '2P' : 'CPU');
    const bob = Math.sin(game.t * 4 + f.side) * 3;
    // 光标要跟着角色实际身高走，否则会压到放大的头部
    const y = f.groundY - (f.airHeight || 0) - BASE_H * scale - 14 + bob;

    // 向下的小三角
    ctx.save();
    ctx.translate(f.x, y);
    ctx.beginPath();
    ctx.moveTo(-9, -16);
    ctx.lineTo(9, -16);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,16,32,.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 玩家编号
    fillRR(-17, -40, 34, 18, 2, 'rgba(248,251,255,.95)');
    strokeRR(-17, -40, 34, 18, 2, color, 1.4);
    txt(label, 0, -30, 13, '#12314f', 'center', 800, 1);
    ctx.restore();
  }
}

/** 开场「准备 → 开打！」 */
function drawIntro(b) {
  const s = screenBounds();
  ctx.fillStyle = 'rgba(6,12,26,.4)';
  ctx.fillRect(s.x, s.y, s.w, 70 - s.y);
  ctx.fillRect(s.x, H - 70, s.w, 70);

  const k = b.intro > .55;
  const label = k ? '准备' : '开打！';
  const p = k ? 1.2 - (b.intro - .55) / 1.05 * .2 : 1 + (1 - b.intro / .55) * .08;
  ctx.save();
  ctx.translate(640, 322);
  ctx.scale(p, p);
  txtO(label, 0, 0, 112, k ? '#eaf2ff' : '#ffd76a', '#0a1024', 12, 'center', 900, FONT, 5);
  ctx.restore();

  txtO(b.p1.def.name + '   VS   ' + b.p2.def.name, 640, 402, 18, '#eef5ff', 'rgba(6,12,26,.9)', 4, 'center', 800);
}

/** KO / 时间到 的演出文字 */
function drawKO(b) {
  const total = b.endReason === 'ko' ? 2.4 : 2.3;
  const elapsed = total - b.ending;
  const k = clamp(elapsed / .35, 0, 1);
  const sc = 1.3 - .3 * easeOut(k);
  const s = screenBounds();
  ctx.fillStyle = 'rgba(4,7,16,.35)'; ctx.fillRect(s.x, s.y, s.w, s.h);

  ctx.save();
  ctx.translate(640, 292);
  ctx.scale(sc, sc);
  if (b.endReason === 'ko') {
    txtO('K.O.', 0, 0, 152, '#ff7a63', '#1a0808', 12, 'center', 900, DISPLAY, 14);
  } else {
    txtO('时间到', 0, 0, 120, '#ffe9a8', '#1a1305', 12, 'center', 900, FONT, 4);
  }
  ctx.restore();

  if (elapsed > .55) {
    const name = b.winner ? (b.winner === 1 ? b.p1.def.name : b.p2.def.name) : '平局';
    txtO(b.winner ? '胜者 · ' + name : '平局', 640, 408, 34, '#ffe9a8', '#0a1024', 7, 'center', 700, FONT, 2);
  }
}

/* =========================================================
   暂停
   ========================================================= */
function drawPause() {
  const s = screenBounds();
  ctx.fillStyle = 'rgba(6,12,26,.78)'; ctx.fillRect(s.x, s.y, s.w, s.h);
  drawPanel(392, 150, 496, 420);
  txt('暂停', 640, 220, 44, '#14304a', 'center', 700, 1);

  const labels = [['继续战斗', '#159ad6'], ['重新开始', '#d99a00'], ['返回主菜单', '#ef5b4d']];
  for (let i = 0; i < 3; i++) {
    const y = 282 + i * 76;
    panelButton(448, y, 384, 56, labels[i][0], null, labels[i][1], game.pauseIndex === i, 24);
    hot(448, y, 384, 56, 'pause:' + i);
  }
  txt('ESC / P 继续', 640, 548, 12, 'rgba(20,48,74,.78)', 'center', 700, 1);
}

function updatePause() {
  if (game.click) {
    const act = hitHotspot(game.click);
    if (act && act.indexOf('pause:') === 0) { pauseAction(parseInt(act.slice(6), 10)); return; }
  }
  if (edge('ArrowUp', 'KeyW')) { game.pauseIndex = (game.pauseIndex + 2) % 3; Sound.sfx('select'); }
  if (edge('ArrowDown', 'KeyS')) { game.pauseIndex = (game.pauseIndex + 1) % 3; Sound.sfx('select'); }
  if (edge('Enter', 'Space', 'KeyJ')) pauseAction(game.pauseIndex);
}

function pauseAction(i) {
  if (i === 0) {
    game.paused = false;
    Sound.sfx('ui');
  } else if (i === 1) {
    Sound.sfx('confirm');
    startBattle();
  } else {
    Sound.sfx('ui');
    game.paused = false;
    game.battle = null;
    goScene('menu');
  }
}

/* =========================================================
   结算交接
   ========================================================= */
export function finishBattle() {
  const b = game.battle;
  if (!b || game.scene !== 'battle') return;

  const confetti = [];
  const cols = ['#5ec8f2', '#ffcf6b', '#ff7b6e', '#f4f7ff', '#9d8cff'];
  for (let i = 0; i < 90; i++) {
    confetti.push({
      x: rand(0, W), y: rand(-H, 0),
      vy: rand(70, 160), vx: rand(-30, 30),
      rot: rand(0, 6.28), vr: rand(-5, 5),
      size: rand(4, 10), color: pick(cols), ph: rand(0, 6.28)
    });
  }

  game.result = {
    winnerSide: b.winner,
    reason: b.endReason,
    duration: b.elapsed,
    p1: b.p1, p2: b.p2,
    confetti: confetti
  };
  game.resultT = 0;
  game.resultIndex = 0;

  goScene('result');
  // 人机模式里 2P 是 CPU：CPU 获胜即玩家失败
  if (b.winner) Sound.sfx(game.mode === 'pve' && b.winner === 2 ? 'lose' : 'win');
}
