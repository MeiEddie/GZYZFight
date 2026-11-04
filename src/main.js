/**
 * 应用入口
 * ------------------------------------------------------------
 * 启动顺序：
 *   1. 适配画布（DPR）
 *   2. 预加载 boot 分组的资源，驱动加载进度条
 *   3. 启动主循环
 *   4. 淡出加载层
 *
 * 首次点击 / 按键时才真正出声（浏览器自动播放策略）。
 */
import { fitCanvas, cvs } from './core/stage.js';
import { startLoop } from './core/loop.js';
import { game } from './core/state.js';
import { Sound } from './audio/sound.js';
import { BGM } from './audio/bgm.js';
import { assets } from './resources/loader.js';
import { keysOfGroup, MANIFEST } from './resources/manifest.js';

/* ---------------- 加载层 DOM ---------------- */
const bootEl = document.getElementById('boot');
const bootBar = document.getElementById('boot-progress');
const bootStatus = document.getElementById('boot-status');

let bootHidden = false;

/** 更新进度条（0..1），用 CSS 变量驱动，不写内联样式 */
function setProgress(ratio) {
  if (bootBar) bootBar.style.setProperty('--progress', String(Math.max(0, Math.min(1, ratio))));
}

/** 更新状态文字 */
function setStatus(text) {
  if (bootStatus) bootStatus.textContent = text;
}

/** 淡出并移除加载层 */
function hideBoot() {
  if (bootHidden || !bootEl) return;
  bootHidden = true;
  bootEl.classList.add('is-done');
  setTimeout(() => { bootEl.style.display = 'none'; }, 480);
}

/* ---------------- 启动 ---------------- */
async function bootGame() {
  fitCanvas();
  setProgress(0);
  setStatus('正在加载资源…');

  const bootKeys = keysOfGroup('boot');
  const totalLabel = bootKeys.length;

  try {
    await assets.preload(bootKeys, (ratio, total, key) => {
      setProgress(ratio);
      const spec = MANIFEST[key];
      const label = spec ? spec.label : '资源';
      if (total > 0) {
        setStatus('正在加载 ' + label + ' · ' + Math.round(ratio * 100) + '%');
      } else if (totalLabel > 0) {
        setStatus('正在加载 ' + label);
      }
    });
  } catch (e) {
    // 预加载失败不阻断启动：游戏会退回合成音乐继续跑
    console.warn('[boot] 预加载异常：', e && e.message);
  }

  setProgress(1);
  setStatus('准备开打…');

  // 进入游戏
  startLoop();
  hideBoot();

  // 预加载完成后顺便初始化原声轨（真正出声仍要等第一次交互）
  BGM.init();
}

/* 首次交互解锁音频（键盘 / 点击 / 触摸任意一种） */
['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
  addEventListener(ev, () => Sound.unlock(), { once: true });
});

/* 调试用：控制台可直接访问 window.GZYZ */
window.GZYZ = { game, assets, Sound, BGM, cvs };

bootGame();
