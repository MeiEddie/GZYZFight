/**
 * 校歌《奉献美好给未来》的音乐数据
 * ------------------------------------------------------------
 * 这里只放「数据 + 解析」，不含播放逻辑（播放见 src/audio/sound.js）。
 *
 * 两种使用方式：
 *   1) 有真实录音 —— assets/audio/school-anthem.mp3 会被自动优先播放，
 *      下面的合成数据不会发声（作为兜底保留）。
 *   2) 没有录音 —— 用这些数据实时合成一段按校歌词格写的原创编曲。
 *
 * 注意：下面这条旋律是按歌词格律原创的，**不是官方原曲**。
 * 如果你有一中校歌的简谱，直接把数字换进 ANTHEM_BARS 即可复刻原曲，
 * 格式：[音名, 拍数]，每小节 4 拍、共 16 小节。
 */

/** 音名 → 半音偏移 */
const NOTE_NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'D4' / 'F#4' / 'Bb3' → MIDI 音高（A4 = 69） */
export function noteToMidi(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return 0;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return NOTE_NAMES[m[1]] + acc + (parseInt(m[3], 10) + 1) * 12;
}

/**
 * 主旋律，每行一小节（4 拍）。
 * A 段 8 小节、B 段 8 小节，按校歌格律排列。
 */
export const ANTHEM_BARS = [
  [['D4', 1], ['F#4', 1], ['A4', 1], ['A4', 1]],
  [['B4', 1], ['A4', 1], ['G4', 1], ['F#4', 1]],
  [['E4', 1], ['F#4', 1], ['G4', 1], ['A4', 1]],
  [['B4', 1], ['B4', 1], ['A4', 2]],
  [['D5', 1], ['D5', 1], ['C#5', 1], ['B4', 1]],
  [['A4', 1], ['A4', 1], ['F#4', 2]],
  [['G4', 1], ['A4', 1], ['B4', 2]],
  [['C#5', 2], ['A4', 2]],
  [['F#4', 1], ['F#4', 1], ['A4', 2]],
  [['B4', 1], ['B4', 1], ['C#5', 2]],
  [['D5', 1], ['C#5', 1], ['B4', 2]],
  [['B4', 1], ['A4', 1], ['F#4', 2]],
  [['G4', 1], ['A4', 1], ['B4', 2]],
  [['C#5', 1], ['B4', 1], ['A4', 2]],
  [['F#4', 1], ['G4', 1], ['A4', 2]],
  [['B4', 1], ['A4', 1], ['D5', 2]]
];

/** 每小节铺底和弦（三音） */
export const ANTHEM_CHORDS = [
  ['D3', 'A3', 'D4'], ['A2', 'E3', 'A3'], ['G2', 'D3', 'G3'], ['D3', 'A3', 'F#4'],
  ['G2', 'D3', 'B3'], ['D3', 'A3', 'F#4'], ['A2', 'E3', 'A3'], ['A2', 'E3', 'A3'],
  ['D3', 'A3', 'D4'], ['G2', 'D3', 'B3'], ['D3', 'A3', 'F#4'], ['D3', 'A3', 'F#4'],
  ['G2', 'D3', 'B3'], ['A2', 'E3', 'A3'], ['G2', 'D3', 'B3'], ['D3', 'A3', 'D4']
];

/**
 * 把「小节 + 拍」摊平成 16 分音符步进表，供音频调度器逐帧推进。
 * @returns {{start:Int16Array,hold:Uint8Array,total:number}}
 *          start[i] = 该步起始音的 MIDI（-1 表示休止），hold[i] = 持续多少步
 */
export function buildTimeline(bars) {
  const STEP_PER_BAR = 16; // 4 拍 × 每拍 4 个 16 分
  const total = bars.length * STEP_PER_BAR;
  const start = new Int16Array(total).fill(-1);
  const hold = new Uint8Array(total);

  for (let b = 0; b < bars.length; b++) {
    let beat = 0;
    for (const [name, beats] of bars[b]) {
      const at = b * STEP_PER_BAR + Math.round(beat * 4);
      const midi = noteToMidi(name);
      if (midi > 0 && at < total) {
        start[at] = midi;
        hold[at] = Math.max(1, Math.round(beats * 4));
      }
      beat += beats;
    }
  }
  return { start, hold, total };
}

/** 编译好的时间轴（模块加载时算一次） */
export const ANTHEM = buildTimeline(ANTHEM_BARS);
