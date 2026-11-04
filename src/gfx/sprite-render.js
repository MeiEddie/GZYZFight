/**
 * 图片帧角色渲染
 * ------------------------------------------------------------
 * 用 AI 生成的「动作表」切帧组装动画：
 *   - 四种身材各一张 5×2 帧表（idle/walkA/walkB/jump/windup/punch/block/hurt/ko/win）
 *   - 按状态机取帧，走路两帧交替，攻击按前摇/判定分段
 *   - 帧与帧共用同一缩放系数，脚底对齐地面，因此不会忽大忽小
 *   - 真实头像不预先烘焙，运行时按 HEAD_POINTS 的头部坐标直接叠到当前帧上
 *   - 只保留特效（影子/护盾/速度线/汗滴/星星）用代码绘制
 *
 * 元数据由 tools/build-sprites.mjs 生成到 src/data/sprites.js；
 * 头部坐标在 src/data/heads.js，照片在 assets/贴图/<学号>.png；
 * 头像大小只有两个来源：战斗里的 HEAD_DRAW_H、头像框里的 ICON_FILL。
 */
import { ctx } from '../core/stage.js';
import { clamp } from '../core/math.js';
import { game } from '../core/state.js';
import { assets } from '../resources/loader.js';
import { SPRITES } from '../data/sprites.js';
import { HEAD_POINTS } from '../data/heads.js';
import { ellipse } from './draw.js';

/** 逻辑身高（scale = 1 时角色从脚底到头顶的像素高度） */
export const BASE_H = 200;

/** 相对旧基准（154）的放大比例，用于同步放大影子与特效 */
const BODY_K = BASE_H / 154;

/** 战斗场景：头像绘制高度（帧格像素，四个身材统一） */
const HEAD_DRAW_H = 81;

/** 头像框（选人 / HUD）：照片占圆直径的比例 */
const ICON_FILL = 1.9;

/** id → 身体元数据 */
const META = {};
for (const s of SPRITES) META[s.id] = s;

/** id → ImageBitmap */
const bitmapOf = id => assets.get('sprites.' + id);

/** 状态 → 帧序号 */
const FRAME = { idle: 0, walkA: 1, walkB: 2, jump: 3, windup: 4, punch: 5, block: 6, hurt: 7, ko: 8, win: 9 };
const KO_FRAME = 8;

/** 需要水平镜像的帧（底模 id → 帧序号）：防御型受击帧原表朝向与其它帧相反 */
const MIRROR_FRAMES = { zang: [FRAME.hurt] };

/** 照片裁剪结果缓存（学号 → { bmp, crop }），只在首次绘制时扫描一次透明边 */
const faceCache = new Map();

function faceOf(no) {
  if (!no) return null;
  if (faceCache.has(no)) return faceCache.get(no);
  const bmp = assets.get('faces.' + no);
  // 资源还没加载完 / 学号没有登记头像时先不缓存，避免把 null 永久记住
  if (!bmp) return null;

  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const face = {
    bmp,
    crop: x1 < 0
      ? { x: 0, y: 0, w: c.width, h: c.height }
      : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
  };
  faceCache.set(no, face);
  return face;
}

/** 根据战斗单位状态取帧序号 */
export function frameOf(f) {
  const st = f.state;
  if (st === 'walk') return FRAME[(Math.floor((f.animT || 0) * 9) % 2) ? 'walkB' : 'walkA'];
  if (st === 'attack') return (f.stateT || 0) < (f.def.windup || .1) ? FRAME.windup : FRAME.punch;
  return FRAME[st] !== undefined ? FRAME[st] : FRAME.idle;
}

/**
 * 把某一帧画到 (x, groundY - air) 这个脚底锚点上，并在头部坐标处叠上真实照片。
 * @param {object} def     角色定义（id = 身材，face = 学号，可选 faceRot）
 * @param {number} frame   帧序号
 * @param {number} x       脚底锚点 x
 * @param {number} groundY 脚底锚点 y
 * @param {number} facing  1 = 朝右，-1 = 朝左
 * @param {number} scale   相对基准身高的缩放
 * @param {number} air     离地高度
 * @param {number} offY    额外纵向偏移（呼吸、倒地演出等）
 * @param {number} alpha   透明度
 */
function paintFrame(def, frame, x, groundY, facing, scale, air, offY, alpha) {
  const meta = META[def.id];
  const bmp = bitmapOf(def.id);
  if (!meta || !bmp) return;

  const k = (BASE_H * scale) / meta.bodyH;
  const sx = (frame % meta.cols) * meta.slotW;
  const sy = Math.floor(frame / meta.cols) * meta.slotH;

  ctx.save();
  if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = alpha;
  ctx.translate(x, groundY - air + offY);
  ctx.scale(facing * k, k);
  // 整格左上角 = 锚点相对格子原点的负偏移；所有帧共用同一个锚点，所以不会互相错位
  ctx.save();
  // 个别帧绕锚点做水平镜像，只翻身体，头像位置由 heads.js 的镜像坐标保证
  if (MIRROR_FRAMES[def.id] && MIRROR_FRAMES[def.id].includes(frame)) ctx.scale(-1, 1);
  ctx.drawImage(bmp, sx, sy, meta.slotW, meta.slotH,
                -meta.anchorX, -meta.anchorY, meta.slotW, meta.slotH);
  ctx.restore();

  /* ---- 真实头像：按该身材该帧的头部中心坐标直接落位 ---- */
  const head = HEAD_POINTS[def.id];
  const face = faceOf(def.face);
  const pt = head && head[frame];
  if (face && pt) {
    const sk = HEAD_DRAW_H / face.crop.h;

    ctx.save();
    // 头部坐标是「帧格内坐标」，身体是按 -anchorX/-anchorY 贴的，这里同步减掉锚点
    ctx.translate(pt[0] - meta.anchorX, pt[1] - meta.anchorY);
    if (frame === KO_FRAME) ctx.rotate(-Math.PI / 2);
    if (def.faceRot) ctx.rotate(def.faceRot);
    ctx.scale(sk, sk);
    const f = face.crop;
    ctx.drawImage(face.bmp, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * 战斗单位渲染入口。
 * @param {object} f 战斗单位
 */
export function drawFighterSprite(f) {
  const def = f.def;
  const scale = (def.heightScale || 1) * (f.scale || 1);
  const air = f.airHeight || 0;
  const state = f.state;

  /* 影子：跳越高越小越淡 */
  const sh = clamp(1 - air / 300, .42, 1);
  ellipse(f.x, f.groundY + 4, 38 * scale * BODY_K * sh, 10 * scale * BODY_K * sh, '#000', .3 * sh);

  /* 帧与附加位移 */
  let frame = frameOf(f);
  let offY = 0;
  let alpha = 1;

  if (state === 'idle') {
    offY = Math.sin((f.animT || 0) * 2.2) * 1.6 * scale;
  } else if (state === 'hurt') {
    offY = -Math.sin(clamp(f.stateT / .18, 0, 1) * Math.PI) * 2 * scale;
  } else if (state === 'ko') {
    // 倒地：先快速下坠，再轻微下沉
    const k = clamp(f.stateT / .55, 0, 1);
    offY = (1 - k) * -26 * scale;
    alpha = .92 + .08 * k;
  } else if (state === 'win') {
    offY = Math.sin(game.t * 3) * 1.8 * scale;
  }

  paintFrame(def, frame, f.x, f.groundY, f.facing, scale, air, offY, alpha);

  /* ---- 特效（与图片无关，仍用代码绘制） ---- */
  ctx.save();
  ctx.translate(f.x, f.groundY - air);
  const s = scale * BODY_K;

  // 出拳速度线
  if (state === 'attack' && f.stateT > def.windup && f.stateT < def.windup + def.active + .06) {
    const a = 1 - Math.abs((f.stateT - def.windup - def.active * .5) / (def.active * .6));
    ctx.globalAlpha = clamp(a, 0, .7);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.6 * s;
    const fx = f.facing * (def.reach * .72) * s;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(fx - 8 * s, (-96 + i * 7 - 7) * s, (16 + i * 9) * s, -0.55, 0.55);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // 防御护盾：整组按朝向镜像，弧面永远挡在角色面向的一侧
  if (state === 'block') {
    const pulse = .5 + Math.sin(game.t * 9) * .15;
    const cx = 18 * s, cy = -88 * s, r = 46 * s;
    ctx.save();
    ctx.scale(f.facing || 1, 1);
    ctx.globalAlpha = .5;
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(cx, cy, r, -0.9, 0.9); ctx.stroke();
    ctx.globalAlpha = .18;
    ctx.fillStyle = '#7fe0ff';
    ctx.beginPath(); ctx.arc(cx, cy, r, -0.9, 0.9); ctx.lineTo(cx, cy); ctx.fill();
    ctx.globalAlpha = .8 * pulse;
    ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(cx, cy, r * .74, -0.75, 0.75); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 受击汗滴
  if (state === 'hurt') {
    ctx.fillStyle = '#bfeaff';
    ctx.globalAlpha = .85;
    ctx.beginPath();
    ctx.ellipse(-f.facing * 20 * s, -140 * s, 3 * s, 5 * s, .4, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 胜利星星
  if (state === 'win') {
    for (let i = 0; i < 5; i++) {
      const a = game.t * 1.4 + i * 1.26;
      const r = (62 + Math.sin(game.t * 3 + i) * 10) * s;
      ctx.save();
      ctx.globalAlpha = .55 + .35 * Math.sin(game.t * 4 + i);
      ctx.fillStyle = i % 2 ? '#ffe9a8' : '#8fe4ff';
      ctx.translate(Math.cos(a) * r, -110 * s + Math.sin(a) * r * .55);
      ctx.rotate(a);
      ctx.beginPath(); ctx.rect(-3 * s, -3 * s, 6 * s, 6 * s); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** 头像框（HUD / 选人卡片）：照片塞进圆里，大小只由半径决定 */
export function drawHeadIcon(x, y, r, def, flip) {
  const face = faceOf(def.face);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip || 1, 1);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832);
  ctx.fillStyle = '#dce9f8'; ctx.fill();
  ctx.clip();

  if (face) {
    const f = face.crop;
    const sc = (r * ICON_FILL) / Math.max(f.w, f.h);
    ctx.drawImage(face.bmp, f.x, f.y, f.w, f.h,
                  -f.w / 2 * sc, -f.h / 2 * sc, f.w * sc, f.h * sc);
  } else {
    ellipse(0, 0, r, r, '#c8dcf2', 1);
  }
  ctx.restore();
}

/**
 * 静态展示（菜单 / 选人 / 结算）。
 * @param {number} x
 * @param {number} groundY 脚底 y
 * @param {object} def
 * @param {object} opts { state, stateT, facing, scale, t, airHeight }
 */
export function drawSpriteCharAt(x, groundY, def, opts) {
  opts = opts || {};
  const state = opts.state || 'idle';
  const animT = opts.t !== undefined ? opts.t : game.t;
  const fake = {
    state, stateT: opts.stateT || 0, animT, def,
  };
  const frame = frameOf(fake);
  const scale = opts.scale || 1;

  ellipse(x, groundY + 4, 38 * scale * BODY_K, 10 * scale * BODY_K, '#000', .3);

  let offY = 0;
  if (state === 'idle') offY = Math.sin(animT * 2.2) * 1.6 * scale;
  else if (state === 'win') offY = Math.sin(game.t * 3) * 1.8 * scale;
  else if (state === 'ko') offY = 0;

  paintFrame(def, frame, x, groundY, opts.facing || 1, scale, opts.airHeight || 0, offY, 1);
}
