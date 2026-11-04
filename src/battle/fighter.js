/**
 * 战斗单位与判定
 * ------------------------------------------------------------
 * 这里只处理「数据」：状态机、位移、伤害、连击、AI。
 * 绘制在 gfx/sprite-render.js，两者通过 state 字段解耦
 * （渲染读 state / stateT，逻辑写 state / stateT）。
 *
 * 状态机：
 *   idle ⇄ walk
 *   idle → jump → idle（落地）
 *   idle/walk/block → attack → idle
 *   任意 → hurt → idle
 *   任意 → ko（体力归零）/ win（对手归零或时间判定获胜）
 */
import { game } from '../core/state.js';
import { GROUND_Y } from '../core/constants.js';
import { clamp, rand } from '../core/math.js';
import { keys, edge } from '../core/input.js';
import { Sound } from '../audio/sound.js';
import { spawnDust, spawnSparks, spawnRing } from './effects.js';

/** 战场左右边界，角色不能走出屏幕边缘 */
export const ARENA_LEFT = 106;
export const ARENA_RIGHT = 1174;

/**
 * 创建一个战斗单位。
 * @param {object} def 角色定义（ROSTER 里的一条）
 * @param {number} side 1 或 2
 * @param {number} x 初始 x
 * @param {number} facing 1 朝右 / -1 朝左
 */
export function mkFighter(def, side, x, facing) {
  return {
    def: def, side: side, x: x, groundY: GROUND_Y, facing: facing,
    hp: def.hp, maxHp: def.hp, displayHp: def.hp,
    state: 'idle', stateT: 0, animT: rand(0, 2),
    airHeight: 0, vAir: 0, vx: 0,
    cooldown: 0, attackHit: false, hurtDur: .3,
    combo: 0, comboTimer: 0, maxCombo: 0, dealt: 0, hits: 0,
    ai: { t: 0, block: 0, dir: 1 }
  };
}

/* ---------------- 输入采样 ---------------- */
/** 1P：A/D 移动，W 跳，J 攻击，K 防御 */
export function readP1() {
  return {
    left: keys.has('KeyA'), right: keys.has('KeyD'),
    jump: edge('KeyW'),
    attack: edge('KeyJ'),
    block: keys.has('KeyK')
  };
}

/** 2P：方向键移动，↑ 跳，Enter/小键盘1/句号 攻击，右Shift/小键盘2/逗号 防御 */
export function readP2() {
  return {
    left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'),
    jump: edge('ArrowUp'),
    attack: edge('Enter', 'Numpad1', 'Period'),
    block: keys.has('ShiftRight') || keys.has('Numpad2') || keys.has('Comma')
  };
}

/**
 * 简易 AI：贴身拼拳、偶尔格挡、远距离靠近并小概率跳。
 * 逻辑很轻，但足以让玩家感受到「对手在抢节奏」。
 */
export function aiInput(f, opp, dt) {
  const out = { left: false, right: false, jump: false, attack: false, block: false };
  const ai = f.ai;
  ai.t -= dt; ai.block -= dt;

  const dist = Math.abs(opp.x - f.x);
  const dir = opp.x > f.x ? 1 : -1;

  if (ai.block > 0) { out.block = true; return out; }

  // 对手在出拳，有概率抬防
  const danger = opp.state === 'attack' && opp.stateT < opp.def.windup + opp.def.active + .02 && dist < 160;
  if (danger && Math.random() < .07) {
    ai.block = rand(.22, .36);
    out.block = true;
    return out;
  }

  if (ai.t <= 0) {
    if (dist < 130) {
      const r = Math.random();
      if (r < .58) { out.attack = true; ai.t = rand(.18, .44); }
      else if (r < .74) { ai.block = rand(.2, .34); out.block = true; ai.t = .3; }
      else { ai.dir = Math.random() < .5 ? -1 : 1; ai.t = rand(.15, .34); }
    } else {
      ai.dir = dir;
      ai.t = rand(.12, .28);
      if (dist < 300 && Math.random() < .16) out.jump = true;
    }
  }

  if (ai.dir > 0) out.right = true;
  else if (ai.dir < 0) out.left = true;
  return out;
}

/* ---------------- 状态推进 ---------------- */
/** 起手攻击 */
export function startAttack(f) {
  f.state = 'attack';
  f.stateT = 0;
  f.attackHit = false;
  f.vx = 0;
  Sound.sfx('swing');
}

/**
 * 每帧推进一个战斗单位。
 * @param {object} f    自己
 * @param {object} inp  输入 {left,right,jump,attack,block}
 * @param {object} opp  对手
 * @param {number} dt   逻辑步长（已乘以慢动作系数）
 */
export function updateFighter(f, inp, opp, dt) {
  f.animT += dt;
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.comboTimer = Math.max(0, f.comboTimer - dt);
  if (f.comboTimer <= 0) f.combo = 0;

  if (f.state === 'ko' || f.state === 'win') { f.stateT += dt; return; }

  // 始终面向对手
  f.facing = opp.x >= f.x ? 1 : -1;

  /* 受击硬直 */
  if (f.state === 'hurt') {
    f.stateT += dt;
    f.x += f.vx * dt;
    f.vx *= Math.pow(.0015, dt);
    f.x = clamp(f.x, ARENA_LEFT, ARENA_RIGHT);
    if (f.stateT >= f.hurtDur) { f.state = 'idle'; f.stateT = 0; }
    return;
  }

  /* 空中 */
  if (f.airHeight > 0) {
    f.airHeight += f.vAir * dt;
    f.vAir -= 1500 * dt;
    if (f.airHeight <= 0) {
      f.airHeight = 0; f.vAir = 0;
      spawnDust(f.x, GROUND_Y, 6);
      if (f.state === 'jump') { f.state = 'idle'; f.stateT = 0; }
    } else {
      const d = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      // 空中保持与地面相同的水平速度，跳跃不该成为减速手段
      f.x += d * f.def.move * dt;
      f.x = clamp(f.x, ARENA_LEFT, ARENA_RIGHT);
      f.state = 'jump';
      return;
    }
  }

  /* 攻击中：判定帧内前冲并检测命中 */
  if (f.state === 'attack') {
    const wu = f.def.windup, ac = f.def.active, dur = f.def.dur;
    f.stateT += dt;
    if (f.stateT >= wu && f.stateT <= wu + ac) {
      f.x += f.facing * 62 * dt;
      if (!f.attackHit) tryHit(f, opp);
    }
    if (f.stateT >= dur) {
      f.state = 'idle'; f.stateT = 0;
      f.cooldown = Math.max(f.cooldown, .07);
    }
    f.x = clamp(f.x, ARENA_LEFT, ARENA_RIGHT);
    return;
  }

  /* 防御中 */
  if (f.state === 'block') {
    if (inp.attack && f.cooldown <= 0) { startAttack(f); return; }
    f.stateT += dt;
    f.x += f.vx * dt;
    f.vx *= Math.pow(.002, dt);
    if (!inp.block) { f.state = 'idle'; f.stateT = 0; }
    return;
  }

  /* 地面自由状态 */
  if (inp.attack && f.cooldown <= 0) { startAttack(f); return; }
  if (inp.jump) {
    f.vAir = 560; f.airHeight = .1;
    f.state = 'jump'; f.stateT = 0;
    Sound.sfx('jump');
    spawnDust(f.x, GROUND_Y, 4);
    return;
  }
  if (inp.block) { f.state = 'block'; f.stateT = 0; f.vx = 0; return; }

  const d = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (d !== 0) {
    f.x += d * f.def.move * dt;
    f.state = 'walk';
    f.stateT += dt;
  } else {
    f.state = 'idle';
    f.stateT = 0;
  }
  f.x = clamp(f.x, ARENA_LEFT, ARENA_RIGHT);
}

/* ---------------- 命中判定 ---------------- */
/**
 * 是否打中：判定条件依次是
 *   1. 对手不在 ko/win 状态；
 *   2. 对手跳得够高（> 42px）则躲开；
 *   3. 对手在自己的攻击朝向、且距离在 reach + 28 之内。
 */
export function tryHit(att, def) {
  if (def.state === 'ko' || def.state === 'win') return;
  if (def.airHeight > 42) return;

  const forward = att.facing > 0 ? def.x - att.x : att.x - def.x;
  const range = att.def.reach + 28;
  if (forward < 4 || forward > range) return;

  att.attackHit = true;
  const blocked = def.state === 'block';
  applyHit(att, def, blocked);
}

/**
 * 结算一次命中：扣血、飘字、火花、连击、硬直、KO 判定。
 * @param {boolean} blocked 对手是否在防御
 */
export function applyHit(att, def, blocked) {
  const b = game.battle;
  if (!b || b.over) return;

  // 防御力每点（超过 2 的部分）减伤 4%；格挡额外减到 16%
  const guard = 1 - Math.max(0, def.def.stats.guard - 2) * .04;
  const dmg = Math.max(1, Math.round(att.def.dmg * guard * (blocked ? .16 : 1) * 10) / 10);
  def.hp = Math.max(0, Math.round((def.hp - dmg) * 10) / 10);
  att.dealt = Math.round((att.dealt + dmg) * 10) / 10;
  att.hits++;

  const ix = def.x - att.facing * 6;
  const iy = GROUND_Y - 108 - def.airHeight;

  b.popups.push({
    x: ix, y: iy - 10, vy: -55, life: .8, max: .8,
    text: '-' + dmg.toFixed(1),
    color: blocked ? '#9fe8ff' : '#ffe9a8',
    size: blocked ? 20 : 28
  });
  if (blocked) {
    b.popups.push({ x: ix, y: iy - 42, vy: -40, life: .6, max: .6, text: '格挡', color: '#7fe0ff', size: 17 });
  }

  spawnSparks(ix, iy, blocked ? '#8fe4ff' : '#ffd76a', blocked ? 8 : 16, blocked ? .7 : 1.15);

  if (!blocked) {
    spawnRing(ix, iy, '#ffcf6b');
    att.combo++;
    att.comboTimer = 1.5;
    att.maxCombo = Math.max(att.maxCombo, att.combo);
    def.state = 'hurt';
    def.stateT = 0;
    def.hurtDur = .3;
    def.vx = att.facing * 220;
    def.airHeight = 0; def.vAir = 0;
  } else {
    def.x = clamp(def.x + att.facing * 12, ARENA_LEFT, ARENA_RIGHT);
    att.combo = 0;
    att.comboTimer = 0;
  }

  /* 击倒 */
  if (def.hp <= 0) {
    def.state = 'ko';
    def.stateT = 0;
    def.airHeight = 0; def.vAir = 0; def.vx = 0;

    b.over = true;
    b.winner = att.side;
    b.endReason = 'ko';
    b.ending = 2.4;
    b.slow = .3;
    b.hitstop = .14;
    b.shake = 30;
    b.flash = .55;
    b.hype = 1;

    att.state = 'win';
    att.stateT = 0;
    att.airHeight = 0;

    // KO 这一下同样要有击打声，播报稍晚一点接上，先听到拳，再听到 K.O.
    Sound.sfx('hit');
    Sound.sfx('ko', .18);
    spawnRing(def.x, GROUND_Y - 120, '#ffd36a');
    spawnSparks(def.x, GROUND_Y - 110, '#ffe9a8', 26, 1.6);
  } else {
    b.hitstop = blocked ? .045 : .07;   // 顿帧：命中瞬间定格，手感来源
    b.shake = blocked ? 3.5 : 9;
    b.flash = blocked ? .05 : .12;
    b.hype = 1;
    // 只在真正结算伤害时出声，避免「有音效没掉血」
    Sound.sfx(blocked ? 'block' : 'hit');
  }
}

/** 时间到：比体力判定胜负 */
export function judgeTimeout() {
  const b = game.battle;
  if (!b || b.over) return;

  b.over = true;
  b.endReason = 'time';
  b.ending = 2.3;
  b.slow = 1;
  b.timer = 0;

  let w = null;
  if (b.p1.hp > b.p2.hp) w = 1;
  else if (b.p2.hp > b.p1.hp) w = 2;
  b.winner = w;

  [b.p1, b.p2].forEach(f => {
    if (f.state !== 'ko') { f.state = 'idle'; f.stateT = 0; f.airHeight = 0; f.vAir = 0; }
  });
  if (w) {
    const win = w === 1 ? b.p1 : b.p2;
    win.state = 'win'; win.stateT = 0;
  }
  Sound.sfx('time');
}
