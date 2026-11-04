/**
 * 战斗特效：火花 / 尘土 / 冲击环 / 伤害飘字
 * ------------------------------------------------------------
 * 所有粒子都存在 game.battle.particles 里，由 updateEffects 推进、
 * drawEffects 绘制。粒子数量固定上限级（单次命中 ≤ 26 个），不会随时间累积。
 */
import { ctx } from '../core/stage.js';
import { rand, clamp } from '../core/math.js';
import { txtO } from '../gfx/draw.js';
import { DISPLAY } from '../core/constants.js';
import { game } from '../core/state.js';

/** 命中火花：从命中点向四周飞散的短条 */
export function spawnSparks(x, y, color, n, power) {
  const b = game.battle;
  if (!b) return;
  for (let i = 0; i < n; i++) {
    b.particles.push({
      type: 'spark', x: x, y: y,
      vx: rand(-190, 190) * power, vy: rand(-260, -30) * power,
      life: rand(.24, .5), max: .5, size: rand(2, 5.5),
      color: color, rot: rand(0, 6.28), vr: rand(-12, 12)
    });
  }
}

/** 落地 / 起跳尘土 */
export function spawnDust(x, y, n) {
  const b = game.battle;
  if (!b) return;
  for (let i = 0; i < n; i++) {
    b.particles.push({
      type: 'dust', x: x + rand(-20, 20), y: y + rand(-3, 3),
      vx: rand(-50, 50), vy: rand(-30, -5),
      life: rand(.3, .6), max: .6, size: rand(5, 11), color: '#e8d3b0'
    });
  }
}

/** 命中冲击环 */
export function spawnRing(x, y, color) {
  const b = game.battle;
  if (!b) return;
  b.particles.push({ type: 'ring', x: x, y: y, life: .32, max: .32, size: 12, color: color });
}

/** 推进粒子与飘字，回收生命耗尽的对象 */
export function updateEffects(dt) {
  const b = game.battle;
  if (!b) return;

  for (let i = b.particles.length - 1; i >= 0; i--) {
    const p = b.particles[i];
    p.life -= dt;
    if (p.type === 'spark') {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
      p.rot += p.vr * dt;
    } else if (p.type === 'dust') {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 20 * dt;
      p.size += dt * 16;
    } else if (p.type === 'ring') {
      p.size += dt * 260;
    }
    if (p.life <= 0) b.particles.splice(i, 1);
  }

  for (let i = b.popups.length - 1; i >= 0; i--) {
    const p = b.popups[i];
    p.life -= dt;
    p.y += p.vy * dt;
    if (p.life <= 0) b.popups.splice(i, 1);
  }
}

/** 绘制粒子与飘字（伤害数字用描边字体，保证在任何背景上都读得清） */
export function drawEffects() {
  const b = game.battle;
  if (!b) return;

  for (const p of b.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.type === 'spark') {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * .35, p.size * 2, p.size * .7);
      ctx.restore();
    } else if (p.type === 'dust') {
      ctx.save();
      ctx.globalAlpha = a * .45;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
      ctx.restore();
    } else if (p.type === 'ring') {
      ctx.save();
      ctx.globalAlpha = a * .8;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
  }

  for (const p of b.popups) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    txtO(p.text, p.x, p.y, p.size, p.color, '#10182c', 4, 'center', 900, DISPLAY);
    ctx.restore();
  }
}
