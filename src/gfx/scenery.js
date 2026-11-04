/**
 * 场景背景：校园实拍图
 * ------------------------------------------------------------
 * 主界面用 assets/1.webp，战斗/结算用 assets/2.webp。
 * 两张图都按「等比放大、水平居中、底边贴屏幕底」铺满整个窗口：
 * 16:9 之外多出来的区域也由背景图补满，不再露出黑边。
 */
import { ctx, screenBounds } from '../core/stage.js';
import { game } from '../core/state.js';
import { assets } from '../resources/loader.js';

const MENU_BG = 'images.menu-bg';
const BATTLE_BG = 'images.battle-bg';

export function drawScene() {
  const key = game.scene === 'battle' || game.scene === 'result' ? BATTLE_BG : MENU_BG;
  const img = assets.get(key);

  // 整块屏幕在逻辑坐标里的矩形（可能超出 0..1280 / 0..720）
  const b = screenBounds();

  if (!img) {
    ctx.fillStyle = '#10203a';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    return;
  }

  // 等比放大到盖满整块屏幕，水平居中、底边对齐屏幕底
  const s = Math.max(b.w / img.width, b.h / img.height);
  const dw = Math.round(img.width * s);
  const dh = Math.round(img.height * s);
  ctx.drawImage(img,
    Math.round(b.x + (b.w - dw) / 2),
    Math.round(b.y + b.h - dh),
    dw, dh);
}
