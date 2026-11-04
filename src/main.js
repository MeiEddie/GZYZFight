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
  const labelOf = key => (MANIFEST[key] ? MANIFEST[key].label : '资源');
  let decodeNotified = false;

  try {
    await assets.preload(bootKeys, (ratio, total, key, phase) => {
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
        setStatus('正在重试 ' + labelOf(key) + '…');
        return;
      }
      if (phase === 'download') {
        setStatus('正在加载 ' + labelOf(key) + ' · ' + Math.round(ratio * 100) + '%');
      }
    });
  } catch (e) {
    // 预加载失败不阻断启动：游戏会退回合成音乐继续跑
    console.warn('[boot] 预加载异常：', e && e.message);
  }

  // 以缓存为准判断「真的可用」：下载成功但解码失败同样算缺失，
  // 这里不静默略过，否则就会出现「画面先缺一块、过一会儿才补上」。
  const missing = bootKeys.filter(k => !assets.has(k));
  if (missing.length) {
    console.warn('[boot] 以下素材未能就绪，已降级启动：', missing);
    setStatus('有 ' + missing.length + ' 个素材没加载成功，先开打');
    await new Promise(resolve => setTimeout(resolve, 900));
  }

  setProgress(1);
  setStatus('准备开打…');

  // 等进度条这一帧真正画出来再淡出，避免「100% 没看见就进游戏」
  await new Promise(resolve => {
    const done = () => resolve();
    requestAnimationFrame(() => requestAnimationFrame(done));
    setTimeout(done, 200); // 后台标签页 rAF 不跑时兜底
  });

  // 进入游戏
  startLoop();
  hideBoot();

  // 校歌不参与启动（5.3MB），进游戏后再后台拉；
  // 首次交互时 Sound.unlock() 会共享同一个 Promise，加载完自动接上。
  BGM.init();
}

/* 首次交互解锁音频（键盘 / 点击 / 触摸任意一种） */
['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
  addEventListener(ev, () => Sound.unlock(), { once: true });
});

/* 调试用：控制台可直接访问 window.GZYZ */
window.GZYZ = { game, assets, Sound, BGM, cvs };

bootGame();
