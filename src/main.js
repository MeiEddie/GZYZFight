/**
 * 应用入口
 * ------------------------------------------------------------
 * 启动顺序（首屏严格门禁）：
 *   1. 适配画布（DPR）
 *   2. 预加载 boot 分组（全部图像与音效），下载 + 解码都完成才继续
 *   3. 逐项复核缓存，确认一件不缺
 *   4. 启动主循环、淡出加载层
 *   5. 首屏出现后，再后台加载校歌原声（不阻塞菜单）
 *
 * boot 组任一资源失败都会在加载层内持续重试，绝不显示残缺菜单。
 * 校歌加载失败时保持安静，不做合成音兜底。
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
import { MENU_ITEMS } from './scenes/menu.js';

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

  const bootKeys = keysOfGroup('boot');   // 全部图像与音效，只不含校歌
  const labelOf = key => (MANIFEST[key] ? MANIFEST[key].label : '资源');
  let decodeNotified = false;

  try {
    await assets.preload(bootKeys, (ratio, total, key, phase, info) => {
      setProgress(ratio);

      // 下载完成、尚在解码：这时资源还不能画，进度条不能算它已就绪
      if (phase === 'decode') {
        if (!decodeNotified) {
          decodeNotified = true;
          setStatus('正在准备画面…');
        }
        return;
      }
      if (phase === 'retry') {
        const n = info && info.attempt ? info.attempt : 1;
        setStatus('网络不稳，正在重试 ' + labelOf(key) + '（第 ' + n + ' 次）');
        return;
      }
      if (phase === 'download') {
        setStatus('正在加载 ' + labelOf(key) + ' · ' + Math.round(ratio * 100) + '%');
      }
    });
  } catch (e) {
    // 严格门禁：异常一律停在加载层，绝不淡出、绝不进游戏
    console.error('[boot] 资源未能全部就绪：', e && e.message);
    setStatus('加载未完成，请检查网络后刷新页面');
    return;
  }

  // 双重校验：以缓存为准，下载成功但解码失败同样算缺失
  const missing = bootKeys.filter(k => !assets.has(k));
  if (missing.length) {
    console.error('[boot] 仍有素材缺失，保持加载层：', missing);
    setStatus('有 ' + missing.length + ' 个素材未就绪，请检查网络后刷新页面');
    return;
  }

  // 音效在启动阶段就解码完毕：AudioContext 先建好但保持挂起（浏览器策略），
  // 首次交互只负责 resume，进游戏后不会出现「前几声没响」的空窗。
  Sound.init();
  await Sound.loadSamples();

  // 校歌不再卡首屏：等菜单显示后再后台加载；
  // 真正出声仍要等第一次交互（Sound.unlock 会在已就绪时开始播放）

  setProgress(1);
  setStatus('准备开打…');

  // 等进度条这一帧真正画出来再淡出，避免「100% 没看见就进游戏」
  await new Promise(resolve => {
    const done = () => resolve();
    requestAnimationFrame(() => requestAnimationFrame(done));
    setTimeout(done, 200); // 后台标签页 rAF 不跑时兜底
  });

  // 一切就绪，才启动并显示游戏
  startLoop();
  hideBoot();

  // 图像与音效已在启动阶段全部加载完成，这里只让校歌在首屏后安静地后台加载。
  setTimeout(() => {
    BGM.init().then(ok => {
      if (ok && Sound.enabled && Sound.unlocked) BGM.play();
    });
  }, 1200);
}

/* 首次交互解锁音频（键盘 / 点击 / 触摸任意一种） */
['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
  addEventListener(ev, () => Sound.unlock(), { once: true });
});

/* 调试用：控制台可直接访问 window.GZYZ */
window.GZYZ = { game, assets, Sound, BGM, cvs, MENU_ITEMS };

bootGame();
