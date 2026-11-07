/**
 * 场景：主菜单
 * ------------------------------------------------------------
 * 左侧标题 + 右侧四项菜单（人机 / 双人 / 说明 / 音乐），
 * 两侧站着两个角色做展示位，背景是黄昏操场。
 */
import { ctx, screenBounds } from '../core/stage.js';
import { FONT } from '../core/constants.js';
import { clamp, easeOut, lerp } from '../core/math.js';
import { game, goScene } from '../core/state.js';
import { edge, hot, hitHotspot, pointInRect } from '../core/input.js';
import { txtO } from '../gfx/draw.js';
import { panelButton, drawIcon } from '../gfx/ui.js';
import { drawScene } from '../gfx/scenery.js';
import { drawSpriteCharAt } from '../gfx/sprite-render.js';
import { ROSTER } from '../data/roster.js';
import { Sound, toggleMusic } from '../audio/sound.js';
import { BGM } from '../audio/bgm.js';
import { startSelect } from './select.js';

/** 菜单项定义（只保留功能文案，不写英文副标题） */
export const MENU_ITEMS = [
  { id: 'pve', label: '人机对战', accent: '#ef5b4d' },
  { id: 'pvp', label: '双人对战', accent: '#159ad6' },
  { id: 'help', label: '操作说明', accent: '#d99a00' },
  { id: 'music', label: '音乐：开', accent: '#7b5cf0' }
];

/** 菜单面板布局 */
const MENU_X = 446, MENU_W = 388, MENU_Y = 368, MENU_H = 56, MENU_GAP = 70;

/** 第 i 项菜单按钮的矩形 */
export function menuRect(i) {
  return { x: MENU_X, y: MENU_Y + i * MENU_GAP, w: MENU_W, h: MENU_H };
}

export function drawMenu() {
  const t = game.t;
  drawScene();

  // 上下轻压暗，尽量保留照片亮度（盖满整块屏幕，含 16:9 之外的黑边区域）
  const b = screenBounds();
  const ov = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  ov.addColorStop(0, 'rgba(7,13,28,.62)');
  ov.addColorStop(.4, 'rgba(7,13,28,.30)');
  ov.addColorStop(1, 'rgba(7,13,28,.76)');
  ctx.fillStyle = ov; ctx.fillRect(b.x, b.y, b.w, b.h);

  // 两侧展示角色
  drawSpriteCharAt(224, 650, ROSTER[0], { facing: 1, t: t, scale: 1.45 });
  drawSpriteCharAt(1056, 650, ROSTER[1], { facing: -1, t: t, scale: 1.45 });
  txtO(ROSTER[0] ? ROSTER[0].name : '', 224, 682, 12, 'rgba(240,247,255,.95)', 'rgba(6,12,26,.85)', 3, 'center', 800, FONT, 1);
  txtO(ROSTER[1] ? ROSTER[1].name : '', 1056, 682, 12, 'rgba(240,247,255,.95)', 'rgba(6,12,26,.85)', 3, 'center', 800, FONT, 1);

  // 顶部校名
  txtO('广州市第一中学', 640, 46, 16, 'rgba(255,255,255,.96)', 'rgba(6,12,26,.85)', 3, 'center', 800, FONT, 3);

  // 主标题（入场时轻轻收回）
  const ts = lerp(1.06, 1, easeOut(clamp(game.enterT / .55, 0, 1)));
  ctx.save();
  ctx.translate(640, 190);
  ctx.scale(ts, ts);
  txtO('一中快打', 0, 0, 118, '#fff4d8', '#0b1226', 10, 'center', 900, FONT, 5);
  ctx.restore();

  // 标题下方的署名小字
  txtO('made by Eddie', 640, 262, 15, 'rgba(255,243,214,.88)', 'rgba(6,12,26,.85)', 3, 'center', 700, FONT, 3);

  // 菜单
  for (let i = 0; i < MENU_ITEMS.length; i++) {
    const it = MENU_ITEMS[i];
    const r = menuRect(i);
    const label = it.id === 'music' ? '音乐：' + (Sound.enabled ? '开' : '关') : it.label;

    panelButton(r.x, r.y, r.w, r.h, label, null, it.accent, game.menuIndex === i, 27);
    if (it.id === 'music') {
      drawIcon(Sound.enabled ? 'sound-on' : 'sound-off', r.x + r.w - 34, r.y + r.h / 2, 18, .85);
    }
    hot(r.x, r.y, r.w, r.h, 'menu:' + it.id);
  }

  // 底部提示
  // 校歌在后台加载：先显示「载入中」，成功后才是「原声」，失败回退「合成」
  const bgmLabel = BGM.status === 'ok' ? '原声'
    : BGM.status === 'fail' ? '合成'
      : '原声载入中';
  txtO('♪ 《奉献美好给未来》· ' + bgmLabel, 640, 664, 11, 'rgba(255,240,205,.9)', 'rgba(6,12,26,.85)', 2.5, 'center', 700, FONT, 1);
  txtO('W / S 选择    ENTER 确认    M 静音', 640, 692, 13, 'rgba(240,247,255,.96)', 'rgba(6,12,26,.85)', 3, 'center', 800, FONT, 2);
}

export function updateMenu() {
  const n = MENU_ITEMS.length;
  if (edge('ArrowUp', 'KeyW')) { game.menuIndex = (game.menuIndex + n - 1) % n; Sound.sfx('select'); }
  if (edge('ArrowDown', 'KeyS')) { game.menuIndex = (game.menuIndex + 1) % n; Sound.sfx('select'); }

  // 鼠标悬停跟随
  if (game.mouseActive) {
    for (let i = 0; i < n; i++) {
      if (pointInRect(game.mouse, menuRect(i)) && game.menuIndex !== i) game.menuIndex = i;
    }
  }

  if (edge('Enter', 'Space', 'KeyJ')) menuAction(MENU_ITEMS[game.menuIndex].id);
  if (game.click) {
    const act = hitHotspot(game.click);
    if (act && act.indexOf('menu:') === 0) menuAction(act.slice(5));
  }
}

/** 菜单项动作分发 */
export function menuAction(id) {
  if (id === 'music') { toggleMusic(); return; }

  Sound.unlock();
  Sound.sfx('confirm');

  if (id === 'help') {
    game.helpFrom = 'menu';
    goScene('help');
  } else {
    game.mode = id === 'pve' ? 'pve' : 'pvp';
    startSelect();
  }
}
