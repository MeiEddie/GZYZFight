/**
 * 校歌原始录音（BGM 主轨）
 * ------------------------------------------------------------
 * 与合成器解耦：本模块不依赖 Sound，只对外暴露 init / play / mute。
 * 由 Sound.unlock() 触发加载与播放，加载失败时 Sound 自动回退到合成编曲。
 *
 * 音频元素来自资源管理器（src/resources/loader.js），因此
 * 「换校歌」只需要替换 assets/audio/school-anthem.mp3，代码不用改。
 */
import { assets } from '../resources/loader.js';

/** 校歌音频在 manifest 里的 key */
export const ANTHEM_KEY = 'audio.school-anthem';

export const BGM = {
  /** @type {HTMLAudioElement|null} */
  el: null,
  /** 原声是否可用（决定菜单显示「原声」还是「合成」，也决定是否静音合成器） */
  ok: false,
  /** 加载 Promise（幂等，多次调用共享） */
  promise: null,
  /** 音量 */
  vol: .4,
  /** 静音状态 */
  muted: false,

  /**
   * 加载并接管校歌。多次调用共享同一个 Promise。
   * @returns {Promise<boolean>} 是否成功
   */
  init() {
    if (!this.promise) this.promise = this._load();
    return this.promise;
  },

  async _load() {
    try {
      this.el = await assets.audio(ANTHEM_KEY);
      this.el.loop = true;
      this.el.volume = this.muted ? 0 : this.vol;
      this.ok = true;
    } catch (e) {
      console.warn('[bgm] 校歌原声不可用，回退到合成编曲：' + e.message);
      this.ok = false;
    }
    return this.ok;
  },

  /** 开始 / 继续播放（浏览器的自动播放策略要求先有用户手势） */
  play() {
    if (!this.el || this.muted) return;
    const p = this.el.play();
    if (p && p.catch) p.catch(() => { /* 被自动播放策略拦截，等下一次手势 */ });
  },

  /** 暂停 */
  pause() {
    if (this.el) this.el.pause();
  },

  /** 静音开关（由 Sound.toggle 调用） */
  mute(on) {
    this.muted = on;
    if (this.el) this.el.volume = on ? 0 : this.vol;
    if (!on) this.play();
  },

  /** 单独调节音量 0..1 */
  setVolume(v) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.el) this.el.volume = this.muted ? 0 : this.vol;
  }
};
