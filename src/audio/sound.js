/**
 * 音频系统
 * ------------------------------------------------------------
 * 两条轨：
 *   1. 原声轨 —— assets/audio/school-anthem.mp3，加载成功就由 BGM 播放，
 *      此时合成器自动停摆（Sound.tick 直接 return），避免两首曲子打架；
 *   2. 合成轨 —— WebAudio 实时合成的校歌编曲（慢版菜单 / 快版战斗）+ 全部音效。
 *
 * 所有声音都挂在两个 Gain 总线上：
 *   master ─┬─ musicBus（BGM / 合成曲，可整体压低）
 *           └─ sfxBus  （打击、跳跃、UI 音效）
 * 这样 M 键静音只需要把 master 拉平，不必逐个节点处理。
 */
import { BGM } from './bgm.js';
import { assets } from '../resources/loader.js';
import { ANTHEM, ANTHEM_CHORDS, noteToMidi } from '../data/anthem.js';

/** 曲目表：同一套旋律，两种速度 */
export const SONGS = {
  menu: { tempo: 78 },    // 校歌 · 慢速版（菜单 / 选人 / 结算 / 说明）
  battle: { tempo: 132 }  // 校歌 · 战斗版（加鼓组）
};

export const Sound = {
  ctx: null,
  master: null,
  musicBus: null,
  sfxBus: null,
  sfxLimit: null,
  noiseBuf: null,

  /** 是否开启声音（M 键切换） */
  enabled: true,
  /** 当前曲目：menu | battle */
  song: 'menu',
  /** 合成器步进位置（16 分音符） */
  step: 0,
  /** 下一个待调度的绝对时间 */
  next: 0,
  /** 是否已被用户手势解锁 */
  unlocked: false,
  /**
  * 上网找的真实采样：击打 / 胜利 / 失败 / 准备 / 开打 / KO / 全部 UI 与动作音。
  * 解码后记录起始静音偏移与响度归一化系数，拿不到时回退到合成音。
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
      this.musicBus = c.createGain(); this.musicBus.gain.value = .24; this.musicBus.connect(this.master);
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

      // 预生成一段白噪声，供打击/挥空/鼓组复用（比每次 new 便宜）
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * 1.5), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * .9;
      this.noiseBuf = buf;

      this.next = c.currentTime + .1;
      this.step = 0;
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
   * 预解码上网找的真实采样（均为 CC0）：击打、胜利、失败。
   * 用 AudioBuffer 而不是直接 play() <audio>，是为了连续命中时能叠着响。
   */
  loadSamples() {
    if (!this.ctx || this.sampleLoading || this.samplesLoaded) return;
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
    Promise.all(jobs.map(([name, key]) =>
      assets.audio(key)
        .then(el => fetch(el.src))
        .then(res => res.arrayBuffer())
        .then(data => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
        .then(buf => { this.samples[name] = this.prepare(buf, name === 'hit'); })
        .catch(e => { console.warn('[sound] ' + key + ' 采样不可用，回退到合成音：' + (e && e.message)); })
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
   * @param {string} name hit | win | lose
   * @param {number} t    起始时间
   * @param {object} [opts] { rate, gain, maxDur }
   * @returns {boolean} 采样不可用时返回 false，让调用方回退合成音
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

  /** 切曲：同名不重启，保证菜单↔选人时音乐连续 */
  setSong(name) {
    if (this.song === name) return;
    this.song = name;
    this.step = 0;
    if (this.ctx) this.next = this.ctx.currentTime + .06;
  },

  /* ---------------- 合成原语 ---------------- */
  /**
   * 一个带包络的振荡器音符。
   * @param {number} midi    MIDI 音高（0 = 用 slideTo 做滑音，从极低开始）
   * @param {number} t       起始时间
   * @param {number} dur     时长（秒）
   * @param {string} type    sine | triangle | square | sawtooth
   * @param {number} gain    峰值音量
   * @param {AudioNode} bus  目标总线
   * @param {number} [slideTo] 频率滑到的终点（Hz）
   */
  oscNote(midi, t, dur, type, gain, bus, slideTo) {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'triangle';
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + .03);
  },

  /** 一段滤波后的噪声（打击、挥空、鼓的基础） */
  noiseBurst(t, dur, gain, filterType, freq, bus) {
    const c = this.ctx;
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(freq || 900, t);
    f.Q.value = .9;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
    src.start(t); src.stop(t + dur + .02);
  },

  /** 底鼓 */
  kick(t) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + .18);
    g.gain.setValueAtTime(.24, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .2);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + .22);
  },

  /** 军鼓 */
  snare(t) {
    this.noiseBurst(t, .12, .1, 'highpass', 1600, this.musicBus);
  },

  /** 踩镲 */
  hat(t) {
    this.noiseBurst(t, .055, .05, 'highpass', 5200, this.musicBus);
  },

  /** 定音鼓：校歌慢版的骨架重音 */
  timpani(t, gain) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(54, t + .48);
    g.gain.setValueAtTime(gain || .16, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + .55);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + .6);
  },

  /* ---------------- 音效 ---------------- */
  sfx(name, delay) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + (delay || 0);
    switch (name) {
      case 'ui': {
        if (this.playSample('uiClick', t, { gain: .85 })) break;
        this.oscNote(84, t, .09, 'square', .05, this.sfxBus); break;
      }
      case 'confirm': {
        if (this.playSample('uiConfirm', t, { gain: .9 })) break;
        this.oscNote(76, t, .08, 'square', .07, this.sfxBus);
        this.oscNote(88, t + .09, .1, 'square', .06, this.sfxBus); break;
      }
      case 'jump': {
        if (this.playSample('jump', t, { gain: .85, rate: 1.08 })) break;
        this.oscNote(0, t, .16, 'sine', .04, this.sfxBus, 520); break;
      }
      case 'swing': {
        if (this.playSample('swing', t, { gain: .8, rate: .96 + Math.random() * .1 })) break;
        this.noiseBurst(t, .17, .08, 'bandpass', 700, this.sfxBus); break;
      }
      case 'hit': {
        // 真实拳击采样；音高轻微随机，连击时听感不呆板
        if (this.playSample('hit', t, { rate: .94 + Math.random() * .12 })) break;
        // 采样尚未解码成功时的兜底合成音
        this.noiseBurst(t, .1, .55, 'lowpass', 1100, this.sfxBus);
        const o = c.createOscillator(); const g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(48, t + .16);
        g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
        o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + .2);
        break;
      }
      case 'block': {
        // 金属撞击采样；音高轻微随机，连续格挡不呆板
        if (this.playSample('block', t, { gain: .85, rate: .94 + Math.random() * .12 })) break;
        this.noiseBurst(t, .09, .24, 'highpass', 2600, this.sfxBus);
        this.oscNote(96, t, .08, 'square', .08, this.sfxBus);
        break;
      }
      case 'ko': {
        if (this.playSample('ko', t, { gain: .9 })) break;
        this.oscNote(0, t, .9, 'sawtooth', .9, this.sfxBus, 40);
        this.noiseBurst(t, .7, .35, 'lowpass', 500, this.sfxBus); break;
      }
      case 'win': {
        if (this.playSample('win', t, { gain: .8 })) break;
        const notes = [72, 76, 79, 84, 79, 86];
        notes.forEach((n, i) => this.oscNote(n, t + i * .12, .3, 'triangle', .12, this.sfxBus));
        break;
      }
      case 'lose': {
        if (this.playSample('lose', t, { gain: .8 })) break;
        const notes = [64, 60, 57, 53];
        notes.forEach((n, i) => this.oscNote(n, t + i * .18, .36, 'triangle', .11, this.sfxBus));
        break;
      }
      case 'ready': {
        if (this.playSample('ready', t, { gain: .85 })) break;
        this.oscNote(88, t, .5, 'triangle', .1, this.sfxBus);
        this.oscNote(100, t + .02, .4, 'triangle', .06, this.sfxBus);
        break;
      }
      case 'fight': {
        if (this.playSample('fight', t)) break;
        this.noiseBurst(t, .3, .4, 'bandpass', 900, this.sfxBus);
        this.oscNote(52, t, .4, 'square', .12, this.sfxBus);
        break;
      }
      case 'time': {
        if (this.playSample('time', t, { gain: .6, maxDur: .45 })) break;
        this.oscNote(0, t, .5, 'sine', .2, this.sfxBus, 260);
        break;
      }
      case 'select': {
        if (this.playSample('uiSelect', t, { gain: .8 })) break;
        this.oscNote(84, t, .07, 'square', .05, this.sfxBus); break;
      }
    }
  },

  /* ---------------- 校歌编曲 ---------------- */
  /**
   * 按步进位置排一个 16 分音符。
   * @param {string} song 曲目名
   * @param {number} step 全局步进（会按 16 小节循环取模）
   * @param {number} sd   每步时长（秒）
   */
  play(song, step, sd) {
    const fast = song === 'battle';
    const i = step % ANTHEM.total;
    const inBar = i % 16;
    const bar = (i / 16) | 0;

    /* 主旋律 */
    const midi = ANTHEM.start[i];
    if (midi > 0) {
      const dur = sd * ANTHEM.hold[i] * .94;
      if (fast) {
        this.oscNote(midi, this.next, dur, 'square', .05, this.musicBus);
        this.oscNote(midi + 12, this.next, dur * .7, 'triangle', .016, this.musicBus);
      } else {
        this.oscNote(midi, this.next, dur, 'triangle', .105, this.musicBus);
        this.oscNote(midi - 12, this.next, dur, 'sine', .048, this.musicBus);
      }
    }

    /* 每小节：铺底和弦 + 低音 */
    if (inBar === 0) {
      const ch = ANTHEM_CHORDS[bar];
      if (ch) {
        ch.forEach(n => this.oscNote(noteToMidi(n), this.next, sd * 15, 'sine', fast ? .026 : .05, this.musicBus));
        this.oscNote(noteToMidi(ch[0]) - 12, this.next, sd * (fast ? 6 : 15), fast ? 'triangle' : 'sine', .07, this.musicBus);
      }
    }

    /* 节奏组 */
    if (fast) {
      if (inBar === 0 || inBar === 6 || inBar === 8 || inBar === 14) this.kick(this.next);
      if (inBar === 4 || inBar === 12) this.snare(this.next);
      if (inBar % 2 === 1) this.hat(this.next);
      if (inBar === 0) this.noiseBurst(this.next, .22, .06, 'highpass', 3200, this.musicBus);
    } else {
      if (inBar === 0) this.timpani(this.next, .16);
      if (inBar === 8) this.timpani(this.next, .08);
    }
  },

  /**
   * 每帧调用：提前 220ms 排好后面的音符（lookahead 调度，避免掉帧导致的抖动）。
   * 若原声轨已接管，则合成器完全让位。
   */
  tick() {
    if (!this.ctx || !this.enabled || !this.unlocked) return;
    if (BGM.ok) return;

    const sd = 60 / SONGS[this.song].tempo / 4;
    const now = this.ctx.currentTime;
    // 静音 / 切后台 / 原声接管期间 next 会停在过去，
    // 直接续排会让积压的音符在同一刻全部爆出来，所以先对齐到当前时间。
    if (this.next < now - .1) this.next = now + .06;
    const ahead = now + .22;
    let guard = 0;
    while (this.next < ahead && guard++ < 24) {
      this.play(this.song, this.step, sd);
      this.next += sd;
      this.step++;
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
