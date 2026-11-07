/**
 * 音频系统
 * ------------------------------------------------------------
 * 只使用真实素材，不做任何合成音：
 *   BGM  —— 校歌原声，由 bgm.js 在首屏出现后后台加载；
 *   音效 —— 击打 / 胜利 / 失败 / 准备 / 开打 / KO / UI / 动作音，
 *           全部属于 boot 组，在启动阶段就随图像一起加载完毕。
 *
 * 采样未就绪或解码失败时保持安静，绝不回退到振荡器合成音。
 *
 * 音效挂在一条 Gain 总线上：
 *   master → sfxBus（音效）
 * M 键静音时把 master 拉平，同时通知 BGM 静音。
 */
import { BGM } from './bgm.js';
import { assets } from '../resources/loader.js';

export const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  sfxLimit: null,

  /** 是否开启声音（M 键切换） */
  enabled: true,
  /** 是否已被用户手势解锁 */
  unlocked: false,
  /**
   * 真实采样：击打 / 胜利 / 失败 / 准备 / 开打 / KO / 全部 UI 与动作音。
   * 解码后记录起始静音偏移与响度归一化系数。
   */
  samples: {
    hit: null, win: null, lose: null, ready: null, fight: null, ko: null,
    uiClick: null, uiSelect: null, uiConfirm: null,
    jump: null, swing: null, block: null, time: null
  },
  sampleLoading: false,
  /** 采样已全部解码（失败也置 true，避免每次按键都重新拉取+解码 13 个文件） */
  samplesLoaded: false,

  /* ---------------- 初始化 ---------------- */
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      this.ctx = c;
      this.master = c.createGain(); this.master.gain.value = 1; this.master.connect(c.destination);
      // 音效整体 ×5。增益拉高后瞬态会超过 0dB，串一个限幅器压住峰值，
      // 否则打击/破防这类大音量音效会被硬削顶成破音。
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 5;
      this.sfxLimit = c.createDynamicsCompressor();
      this.sfxLimit.threshold.value = -2;
      this.sfxLimit.knee.value = 3;
      this.sfxLimit.ratio.value = 12;
      this.sfxLimit.attack.value = .001;
      this.sfxLimit.release.value = .12;
      this.sfxBus.connect(this.sfxLimit); this.sfxLimit.connect(this.master);
    } catch (e) {
      this.ctx = null;
    }
  },

  /**
   * 用户第一次交互时解锁音频（键盘、点击、触摸都会调）。
   * 校歌由 main.js 在首屏后预热；这里只负责「已就绪则开始播放」。
   */
  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;

    this.loadSamples();

    if (BGM.ok) BGM.play();
  },

  /**
   * 预解码真实采样（均为 CC0）：击打、胜利、失败、UI 与动作音。
   * 用 AudioBuffer 而不是直接 play() <audio>，是为了连续命中时能叠着响。
   */
  loadSamples() {
    if (!this.ctx || this.sampleLoading || this.samplesLoaded) return Promise.resolve();
    this.sampleLoading = true;
    const jobs = [
      ['hit', 'audio.hit'],
      ['win', 'audio.win'],
      ['lose', 'audio.lose'],
      ['ready', 'audio.ready'],
      ['fight', 'audio.fight'],
      ['ko', 'audio.ko'],
      ['uiClick', 'audio.ui-click'],
      ['uiSelect', 'audio.ui-select'],
      ['uiConfirm', 'audio.ui-confirm'],
      ['jump', 'audio.jump'],
      ['swing', 'audio.swing'],
      ['block', 'audio.block'],
      ['time', 'audio.time']
    ];
    return Promise.all(jobs.map(([name, key]) =>
      assets.audio(key)
        .then(el => fetch(el.src))
        .then(res => res.arrayBuffer())
        .then(data => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
        .then(buf => { this.samples[name] = this.prepare(buf, name === 'hit'); })
        .catch(e => { console.warn('[sound] ' + key + ' 采样不可用，将保持静音：' + (e && e.message)); })
    )).finally(() => {
      this.sampleLoading = false;
      this.samplesLoaded = true;
    });
  },

  /**
   * 解码后统一处理：跳过素材开头的静音，并按峰值归一化响度。
   * 不同来源的素材原始音量差别很大，归一化后才能「一次调大就全部变响」。
   */
  prepare(buf, fastAttack) {
    const d = buf.getChannelData(0);
    let i = 0;
    while (i < d.length && Math.abs(d[i]) < .02) i++;
    let peak = 0;
    for (let k = i; k < d.length; k++) peak = Math.max(peak, Math.abs(d[k]));

    // 击打采样起音有一段渐强的“蓄力”，听感上会比画面慢半拍。
    // 在开头 150ms 内找到最强冲击的采样点，从它前 2ms 起播：
    // 裁掉前面的起音缓坡，让“打中”声一响就是最重的那一下。
    if (fastAttack) {
      const limit = Math.min(d.length, i + Math.round(buf.sampleRate * .15));
      let pi = i, pv = 0;
      for (let k = i; k < limit; k++) {
        const a = Math.abs(d[k]);
        if (a > pv) { pv = a; pi = k; }
      }
      if (pv > 0) i = Math.max(0, pi - Math.round(buf.sampleRate * .002));
    }

    return {
      buf,
      offset: i / buf.sampleRate,
      // 目标峰值 0.98；原始素材太轻时最多放大 6 倍，避免底噪被拉爆
      gain: peak > 0 ? Math.min(6, .98 / peak) : 1
    };
  },

  /**
   * 播放一个已解码采样。
   * @param {string} name hit | win | lose | ...
   * @param {number} t    起始时间
   * @param {object} [opts] { rate, gain, maxDur }
   * @returns {boolean} 采样不可用时返回 false（保持静音，不做合成音兜底）
   */
  playSample(name, t, opts) {
    const rec = this.samples[name];
    if (!rec) return false;
    opts = opts || {};
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = rec.buf;
    src.playbackRate.value = opts.rate || 1;

    const offset = rec.offset;
    const left = rec.buf.duration - offset;
    const dur = Math.min(opts.maxDur || left, left);
    const vol = rec.gain * (opts.gain === undefined ? 1 : opts.gain);

    const g = c.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + .004);
    if (dur > .12) g.gain.setValueAtTime(vol, t + dur - .03);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(g); g.connect(this.sfxBus);
    src.start(t, offset); src.stop(t + dur + .02);
    return true;
  },

  /** 静音开关，返回切换后的状态 */
  toggle() {
    this.enabled = !this.enabled;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, this.ctx.currentTime, .08);
    }
    BGM.mute(!this.enabled);
    return this.enabled;
  },

  /* ---------------- 音效 ---------------- */
  sfx(name, delay) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + (delay || 0);
    switch (name) {
      case 'ui':
        this.playSample('uiClick', t, { gain: .85 }); break;
      case 'confirm':
        this.playSample('uiConfirm', t, { gain: .9 }); break;
      case 'jump':
        this.playSample('jump', t, { gain: .85, rate: 1.08 }); break;
      case 'swing':
        this.playSample('swing', t, { gain: .8, rate: .96 + Math.random() * .1 }); break;
      case 'hit':
        // 真实拳击采样；音高轻微随机，连击时听感不呆板
        this.playSample('hit', t, { rate: .94 + Math.random() * .12 }); break;
      case 'block':
        // 金属撞击采样；音高轻微随机，连续格挡不呆板
        this.playSample('block', t, { gain: .85, rate: .94 + Math.random() * .12 }); break;
      case 'ko':
        this.playSample('ko', t, { gain: .9 }); break;
      case 'win':
        this.playSample('win', t, { gain: .8 }); break;
      case 'lose':
        this.playSample('lose', t, { gain: .8 }); break;
      case 'ready':
        this.playSample('ready', t, { gain: .85 }); break;
      case 'fight':
        this.playSample('fight', t); break;
      case 'time':
        this.playSample('time', t, { gain: .6, maxDur: .45 }); break;
      case 'select':
        this.playSample('uiSelect', t, { gain: .8 }); break;
    }
  }
};

/** 输入模块用的语义化别名 */
export const unlockAudio = () => Sound.unlock();

/** M 键 / 菜单「音乐」项共用：切换静音并给一点按键反馈 */
export function toggleMusic() {
  Sound.unlock();
  Sound.toggle();
  Sound.sfx('ui');
}
