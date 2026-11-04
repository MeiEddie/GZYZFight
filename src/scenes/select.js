/**
 * 场景：选人
 * ------------------------------------------------------------
 * 10 列 × 4 行的学号座位表，从左到右、从上到下依次是 01…40。
 * 座位号来自 src/data/roster.js 的 no 字段：
 *   - 有人的学号显示头像、名字，可以被选中开打；
 *   - 空学号显示「空位」，光标可以停上去查看，但不能确定。
 *
 * 四个阶段仍串成一条流水线：
 *   phase 1  1P 选人
 *   phase 2  2P 选人（人机模式会跳过）
 *   phase 3  人机模式下 CPU 摇人（轮盘动画）
 *   phase 4  双方就位，倒计时后进入战斗
 */
import { ctx, screenBounds } from '../core/stage.js';
import { W, FONT } from '../core/constants.js';
import { pick } from '../core/math.js';
import { game, goScene } from '../core/state.js';
import { edge, hot, hitHotspot, pointInRect } from '../core/input.js';
import { fillRR, strokeRR, txt, txtO, hexA } from '../gfx/draw.js';
import { drawScene } from '../gfx/scenery.js';
import { drawHeadIcon } from '../gfx/sprite-render.js';
import { ROSTER } from '../data/roster.js';
import { Sound } from '../audio/sound.js';
import { startBattle } from './battle.js';

/* 学号座位表：10 列 × 4 行，共 40 个学号 */
const COLS = 10, ROWS = 4, SEATS = COLS * ROWS;
const TILE_W = 106, TILE_H = 96, PLATE_H = 20;
const GAP_X = 9, GAP_Y = 8;
const GRID_W = TILE_W * COLS + GAP_X * (COLS - 1);
const GRID_H = (TILE_H + PLATE_H) * ROWS + GAP_Y * (ROWS - 1);
const GRID_X = Math.round((W - GRID_W) / 2);
const GRID_Y = 138;

/** 学号（1 起）→ 角色；越界或重复的学号会被忽略 */
const SEAT_CHARS = new Array(SEATS).fill(null);
/** 有人的学号（0 起的座位下标），用于光标跳转与 CPU 摇人 */
const OCCUPIED = [];

for (const def of ROSTER) {
  const seat = Math.round(def.no) - 1;
  if (seat >= 0 && seat < SEATS && !SEAT_CHARS[seat]) {
    SEAT_CHARS[seat] = def;
    OCCUPIED.push(seat);
  }
}
OCCUPIED.sort((a, b) => a - b);

/** 浅色底上的彩色小字：把主题色压暗，避免 10px 标签在白卡上发灰 */
const ink = hex => {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  return 'rgb(' + Math.round(((n >> 16) & 255) * .7) + ','
    + Math.round(((n >> 8) & 255) * .7) + ',' + Math.round((n & 255) * .7) + ')';
};

const seatChar = i => (i >= 0 && i < SEATS ? SEAT_CHARS[i] : null);
const seatNumber = i => String(i + 1).padStart(2, '0');
const rosterIndexOfSeat = seat => {
  const def = seatChar(seat);
  return def ? ROSTER.indexOf(def) : -1;
};
const seatOfRosterIndex = idx => {
  const def = ROSTER[idx];
  return def ? SEAT_CHARS.indexOf(def) : -1;
};

/** 第 i 个学号格（含名字牌）的矩形 */
function cardRect(i) {
  const col = i % COLS, row = Math.floor(i / COLS);
  return {
    x: GRID_X + col * (TILE_W + GAP_X),
    y: GRID_Y + row * (TILE_H + PLATE_H + GAP_Y),
    w: TILE_W,
    h: TILE_H + PLATE_H
  };
}

/** 鼠标位置命中第几格（-1 表示没有） */
function cardAt(p) {
  for (let i = 0; i < SEATS; i++) if (pointInRect(p, cardRect(i))) return i;
  return -1;
}

/** 10×4 网格里的上下左右移动（越界回绕） */
function moveCursor(cur, dx, dy) {
  const col = cur % COLS, row = Math.floor(cur / COLS);
  const nc = dx ? (col + dx + COLS) % COLS : col;
  const nr = dy ? (row + dy + ROWS) % ROWS : row;
  return nr * COLS + nc;
}

/** 从某个学号往后找下一个有人的学号（找不到就回到自己） */
function nextOccupiedSeat(from) {
  for (let k = 1; k <= SEATS; k++) {
    const seat = (from + k) % SEATS;
    if (SEAT_CHARS[seat]) return seat;
  }
  return from;
}

/** 当前阶段光标停在第几个学号 */
function cursorSeat(s) {
  if (s.phase === 1) return s.cur1;
  if (s.phase === 2) return s.cur2;
  if (s.phase === 3) return s.cpuPick;
  return seatOfRosterIndex(s.p2);
}

/** 进入选人界面并重置阶段状态 */
export function startSelect() {
  const s = game.sel;
  s.phase = 1;
  s.cur1 = OCCUPIED.length ? OCCUPIED[0] : 0;
  s.cur2 = OCCUPIED.length > 1 ? OCCUPIED[1] : s.cur1;
  s.p1 = rosterIndexOfSeat(s.cur1);
  s.p2 = rosterIndexOfSeat(s.cur2);
  s.cpuRoulette = 0; s.cpuPick = s.cur1; s.rouletteTick = 0; s.startTimer = 0; s.confirmFx = 0;
  goScene('select');
  Sound.setSong('menu');
  Sound.sfx('select');
}

/** 选人界面背景：主界面照片 + 轻压暗 */
function drawSelectBg() {
  drawScene();
  const b = screenBounds();
  const ov = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  ov.addColorStop(0, 'rgba(7,13,28,.5)');
  ov.addColorStop(.5, 'rgba(7,13,28,.3)');
  ov.addColorStop(1, 'rgba(7,13,28,.66)');
  ctx.fillStyle = ov; ctx.fillRect(b.x, b.y, b.w, b.h);
}

export function drawSelect() {
  const s = game.sel;
  drawSelectBg();

  // 返回入口
  txtO('← 主菜单', 66, 54, 15, 'rgba(238,247,255,.96)', 'rgba(6,12,26,.9)', 3, 'left', 800);
  hot(46, 32, 118, 44, 'select:back');

  txt('选择选手', 640, 62, 44, '#f6faff', 'center', 700, 1.5);
  txtO(game.mode === 'pvp' ? '双人对战' : '人机对战', 1210, 54, 14, '#ffd67a', 'rgba(6,12,26,.9)', 3, 'right', 800);

  let phaseText = '', phaseColor = '#5ec8f2';
  if (s.phase === 1) { phaseText = '1P 选人'; phaseColor = '#7ad3f7'; }
  else if (s.phase === 2) { phaseText = '2P 选人'; phaseColor = '#ff8f83'; }
  else if (s.phase === 3) { phaseText = '电脑选人中…'; phaseColor = '#ffd67a'; }
  else { phaseText = '准备开打'; phaseColor = '#ffd67a'; }

  txtO(phaseText, 640, 106, 17, phaseColor, 'rgba(6,12,26,.9)', 3, 'center', 800, FONT, 1);
  txtO('学号 01–40 · 从左到右 · 从上到下', GRID_X + GRID_W, 106, 11, 'rgba(226,240,255,.92)', 'rgba(6,12,26,.9)', 3, 'right', 800);

  // 选人盘外框（40 个学号座位排成阵列）
  fillRR(GRID_X - 20, GRID_Y - 18, GRID_W + 40, GRID_H + 36, 4, 'rgba(244,250,255,.32)');
  strokeRR(GRID_X - 20, GRID_Y - 18, GRID_W + 40, GRID_H + 36, 4, 'rgba(255,255,255,.4)', 1);

  for (let i = 0; i < SEATS; i++) drawCard(i, s);

  drawInfoBar(cursorSeat(s));

  if (s.phase === 1 || s.phase === 2) {
    txtO('W A S D / 方向键 移动 · 空学号不可选 · ENTER 确定 · ESC 返回', 640, 704, 13, 'rgba(232,243,255,.96)', 'rgba(6,12,26,.9)', 3, 'center', 800);
  } else if (s.phase === 3) {
    txtO('电脑正在挑选…', 640, 704, 13, '#ffd67a', 'rgba(6,12,26,.9)', 3, 'center', 800);
  } else {
    txtO('开打', 640, 704, 15, '#ffd67a', 'rgba(6,12,26,.9)', 3, 'center', 900, FONT, 2);
  }
}

/** 单格：学号 + 头像 + 名字牌，空学号显示为不可选空位 */
function drawCard(i, s) {
  const def = seatChar(i);
  const r = cardRect(i);
  const active = cursorSeat(s) === i && s.phase <= 3;
  const p1sel = !!def && s.phase >= 2 && rosterIndexOfSeat(i) === s.p1;
  // 2P 徽标只在双方都确定（phase 4）后出现：
  // 1P 确认时 2P 光标会默认落在下一个人物上，但那时还没选，不能提前标成 2P。
  const p2sel = !!def && s.phase === 4 && rosterIndexOfSeat(i) === s.p2;
  const accent = def ? def.tagColor : '#9fb2d8';

  // 底板 + 名字牌底
  fillRR(r.x, r.y, r.w, r.h, 3, def ? 'rgba(250,252,255,.95)' : 'rgba(243,247,254,.55)');
  fillRR(r.x + 1, r.y + TILE_H, r.w - 2, PLATE_H, 2,
    def ? (active ? hexA(accent, .2) : 'rgba(20,48,74,.06)') : 'rgba(20,48,74,.03)');

  // 头像槽
  fillRR(r.x + 6, r.y + 6, r.w - 12, TILE_H - 12, 2, 'rgba(226,238,252,.9)');
  strokeRR(r.x + 6, r.y + 6, r.w - 12, TILE_H - 12, 2, 'rgba(18,48,80,.12)', 1);

  // 学号徽标（所有座位都标注，空位也保留编号）
  fillRR(r.x + 8, r.y + 8, 29, 16, 1, active ? accent : 'rgba(20,48,74,.1)');
  txt(seatNumber(i), r.x + 22.5, r.y + 16, 10, active ? '#071022' : 'rgba(20,48,74,.8)', 'center', 800, .4);

  if (def) {
    // 类型标签（10px 白卡小字，用压暗后的主题色保证对比度）
    txt(def.tag, r.x + r.w - 8, r.y + 16, 10, ink(accent), 'right', 800);
    // 头像
    drawHeadIcon(r.x + r.w / 2, r.y + 50, 20, def, 1);
    // 名字
    txt(def.name, r.x + r.w / 2 - (p1sel || p2sel ? 7 : 0), r.y + TILE_H + PLATE_H / 2 + 1,
      13, '#14304a', 'center', 800, .5);
  } else {
    txt('空位', r.x + r.w / 2, r.y + 50, 12, 'rgba(20,48,74,.66)', 'center', 700, 1);
  }

  // 选中描边 + 呼吸光圈
  if (active) {
    const pulse = .18 + .14 * (1 + Math.sin(game.t * 6)) * .5;
    strokeRR(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 5, hexA(accent, pulse), 3.5);
    strokeRR(r.x, r.y, r.w, r.h, 3, accent, 2);
  } else {
    strokeRR(r.x, r.y, r.w, r.h, 3, 'rgba(18,48,80,.16)', 1);
  }

  // 1P / 2P 徽标
  if (p1sel) {
    fillRR(r.x + r.w - 27, r.y + TILE_H + 3, 21, 14, 1, '#0f9fd8');
    txt('1P', r.x + r.w - 16.5, r.y + TILE_H + 10, 9.5, '#06202f', 'center', 800);
  }
  if (p2sel) {
    fillRR(r.x + r.w - (p1sel ? 51 : 27), r.y + TILE_H + 3, 21, 14, 1, '#e04c3f');
    txt('2P', r.x + r.w - (p1sel ? 40.5 : 16.5), r.y + TILE_H + 10, 9.5, '#2a0704', 'center', 800);
  }
  if (s.phase === 3 && i === s.cpuPick) {
    strokeRR(r.x, r.y, r.w, r.h, 3, '#e04c3f', 2);
  }

  hot(r.x, r.y, r.w, r.h, 'select:' + i);
}

/** 底部信息条：当前光标学号与角色资料；空学号提示不可选 */
function drawInfoBar(seat) {
  if (seat == null || seat < 0) return;
  const def = seatChar(seat);
  const w = GRID_W + 40, h = 34, x = GRID_X - 20, y = 648;

  fillRR(x, y, w, h, 3, 'rgba(248,251,255,.96)');
  strokeRR(x, y, w, h, 3, 'rgba(18,48,80,.24)', 1);

  txt('学号 ' + seatNumber(seat), x + 14, y + 17, 13,
    def ? ink(def.tagColor) : 'rgba(20,48,74,.78)', 'left', 800, .5);

  if (!def) {
    txt('空位 · 暂无人物（空学号不可选择）', x + 100, y + 17, 13, 'rgba(20,48,74,.7)', 'left', 700, 0);
    return;
  }

  txt(def.name, x + 100, y + 17, 15, '#14304a', 'left', 800, .5);
  txt(def.role, x + 168, y + 17, 13, 'rgba(20,48,74,.75)', 'left', 700, 0);
  txt(def.tag, x + 262, y + 17, 13, ink(def.tagColor), 'left', 800);

  txt('速度 ' + def.stats.speed + '   力量 ' + def.stats.power + '   防御 ' + def.stats.guard + '   HP ' + def.hp,
      x + w - 14, y + 17, 13, 'rgba(20,48,74,.82)', 'right', 700, 0);
}

/** 确认当前光标上的角色；空位只响提示音，不进入下一阶段 */
function confirmCurrent() {
  const s = game.sel;
  const seat = s.phase === 1 ? s.cur1 : s.cur2;
  if (!seatChar(seat)) { Sound.sfx('ui'); return; }

  Sound.sfx('confirm');
  s.confirmFx = .35;

  if (s.phase === 1) {
    s.p1 = rosterIndexOfSeat(seat);
    if (game.mode === 'pve') {
      s.phase = 3;
      s.cpuRoulette = 1.25;
      s.rouletteTick = .08;
      // CPU 只在 1P 没选的座位里摇人，避免双方选到同一角色
      const cpuPool = OCCUPIED.filter(s2 => s2 !== seat);
      s.cpuPick = cpuPool.length ? cpuPool[0] : seat;
    } else {
      s.phase = 2;
      s.cur2 = nextOccupiedSeat(s.cur1);
      s.p2 = rosterIndexOfSeat(s.cur2);
    }
  } else if (s.phase === 2) {
    // 1P 已选的角色不能被 2P 重复选择
    if (rosterIndexOfSeat(seat) === s.p1) { Sound.sfx('ui'); return; }
    s.p2 = rosterIndexOfSeat(seat);
    s.phase = 4;
    s.startTimer = .75;
  }
}

export function updateSelect(dt) {
  const s = game.sel;
  if (s.confirmFx > 0) s.confirmFx -= dt;

  if (edge('Escape')) {
    Sound.sfx('ui');
    goScene('menu');
    Sound.setSong('menu');
    return;
  }

  // 阶段 4：倒计时进战斗
  if (s.phase === 4) {
    s.startTimer -= dt;
    if (s.startTimer <= 0) startBattle();
    return;
  }

  // 阶段 3：CPU 轮盘（只在有人的学号里转）
  if (s.phase === 3) {
    s.cpuRoulette -= dt;
    s.rouletteTick -= dt;
    if (s.rouletteTick <= 0) {
      s.rouletteTick = .085;
      // 每次也都排除 1P 已选的座位
      const cpuPool = OCCUPIED.filter(s2 => s2 !== s.cur1);
      s.cpuPick = pick(cpuPool.length ? cpuPool : OCCUPIED);
      Sound.sfx('select');
    }
    if (s.cpuRoulette <= 0) {
      s.p2 = rosterIndexOfSeat(s.cpuPick);
      s.phase = 4;
      s.startTimer = .8;
      Sound.sfx('confirm');
    }
    return;
  }

  // 鼠标点击：点到空位只移动光标，点到人物才确认
  if (game.click) {
    const act = hitHotspot(game.click);
    if (act && act.indexOf('select:') === 0) {
      const v = act.slice(7);
      if (v === 'back') { Sound.sfx('ui'); goScene('menu'); return; }
      const idx = parseInt(v, 10);
      if (s.phase === 1) { s.cur1 = idx; if (seatChar(idx)) confirmCurrent(); }
      else if (s.phase === 2) { s.cur2 = idx; if (seatChar(idx)) confirmCurrent(); }
      return;
    }
  }

  const hover = game.mouseActive ? cardAt(game.mouse) : -1;
  const curKey = s.phase === 1 ? 'cur1' : 'cur2';
  let cur = s[curKey];

  // 1P 确认后鼠标往往还停在刚点的角色上：
  // 2P 阶段要把这种悬停忽略掉，否则 2P 光标会被拖回 1P 已占用的座位。
  if (hover >= 0 && hover !== cur && !(s.phase === 2 && rosterIndexOfSeat(hover) === s.p1)) cur = hover;

  if (edge('KeyA', 'ArrowLeft')) { cur = moveCursor(cur, -1, 0); Sound.sfx('select'); }
  if (edge('KeyD', 'ArrowRight')) { cur = moveCursor(cur, 1, 0); Sound.sfx('select'); }
  if (edge('KeyW', 'ArrowUp')) { cur = moveCursor(cur, 0, -1); Sound.sfx('select'); }
  if (edge('KeyS', 'ArrowDown')) { cur = moveCursor(cur, 0, 1); Sound.sfx('select'); }
  s[curKey] = cur;

  if (s.phase === 1 && edge('KeyJ', 'Enter', 'Space')) { confirmCurrent(); return; }
  if (s.phase === 2 && edge('Enter', 'Numpad1', 'Period', 'Space')) confirmCurrent();
}
