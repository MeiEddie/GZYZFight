/**
 * 资源清单
 * ------------------------------------------------------------
 * 所有静态资源都在这里登记，代码里只引用 key，不直接写路径。
 * 换素材 = 换文件 / 改这一行的 src，业务代码零改动。
 *
 * 字段说明：
 *   type   image | audio
 *   src    相对 index.html 的路径
 *   label  加载进度里展示的中文名
 *   group  boot = 启动时预加载（决定能不能进菜单，越小越快）
 *          music = 进游戏后台加载，不阻塞启动
 *          lazy = 用到时才加载（按需）
 *   loop   仅 audio：是否循环
 */

export const MANIFEST = {
  // 校歌 5.3MB，是全工程最大的单个文件。
  // 它不参与「能不能开打」，所以不进 boot 组：
  // 启动加载条只管画面与音效，进游戏后再在后台把它拉下来。
  'audio.school-anthem': {
    type: 'audio',
    src: 'assets/audio/school-anthem.mp3',
    label: '校歌《奉献美好给未来》',
    group: 'music',
    loop: true
  },

  // 击打音效：qubodupPunch（CC0，免署名）
  // 来源：https://opengameart.org/content/punch
  'audio.hit': {
    type: 'audio',
    src: 'assets/audio/hit.ogg',
    label: '音效 · 击打',
    group: 'boot'
  },

  // 胜利 / 失败音效（均 CC0，免署名）
  // 来源：https://opengameart.org/content/win-jingle
  'audio.win': {
    type: 'audio',
    src: 'assets/audio/win.ogg',
    label: '音效 · 胜利',
    group: 'boot'
  },
  // 来源：https://opengameart.org/content/game-over-trumpet-sfx
  'audio.lose': {
    type: 'audio',
    src: 'assets/audio/lose.mp3',
    label: '音效 · 失败',
    group: 'boot'
  },

  // 开场音效
  // 准备：pleasing-bell（CC0，免署名）
  // 来源：https://opengameart.org/content/pleasing-bell-sound-effect
  'audio.ready': {
    type: 'audio',
    src: 'assets/audio/ready.wav',
    label: '音效 · 准备',
    group: 'boot'
  },
  // 开打 / KO：DRAGON 播报包（CC-BY，署名 VoiceBosch / SoundBiter）
  // 两句取自同一个播报员，音色与语气完全一致
  // 来源：https://opengameart.org/content/dragon-announcer-audio-pack
  'audio.fight': {
    type: 'audio',
    src: 'assets/audio/fight.wav',
    label: '音效 · 开打',
    group: 'boot'
  },
  'audio.ko': {
    type: 'audio',
    src: 'assets/audio/ko.wav',
    label: '音效 · KO',
    group: 'boot'
  },

  // UI 与动作音：
  // 点击 / 光标移动 / 确认、跳跃 / 出拳挥空：Kenney Interface Sounds、Swishes Sound Pack（均 CC0）
  // https://opengameart.org/content/interface-sounds
  // https://opengameart.org/content/swishes-sound-pack
  'audio.ui-click': {
    type: 'audio',
    src: 'assets/audio/ui-click.ogg',
    label: '音效 · 点击',
    group: 'boot'
  },
  'audio.ui-select': {
    type: 'audio',
    src: 'assets/audio/ui-select.ogg',
    label: '音效 · 光标移动',
    group: 'boot'
  },
  'audio.ui-confirm': {
    type: 'audio',
    src: 'assets/audio/ui-confirm.ogg',
    label: '音效 · 确认',
    group: 'boot'
  },
  'audio.jump': {
    type: 'audio',
    src: 'assets/audio/jump.wav',
    label: '音效 · 跳跃',
    group: 'boot'
  },
  'audio.swing': {
    type: 'audio',
    src: 'assets/audio/swing.wav',
    label: '音效 · 挥拳',
    group: 'boot'
  },

  // 格挡：Metal Clang Sounds（CC0）
  // https://opengameart.org/content/metal-clang-sounds
  'audio.block': {
    type: 'audio',
    src: 'assets/audio/block.wav',
    label: '音效 · 格挡',
    group: 'boot'
  },

  // 读秒提示：Interface Beeps（CC0）
  // https://opengameart.org/content/interface-beeps
  'audio.time': {
    type: 'audio',
    src: 'assets/audio/time.wav',
    label: '音效 · 读秒',
    group: 'boot'
  },

  // 场景背景图：主界面 / 战斗界面
  'images.menu-bg': {
    type: 'image', src: 'assets/1.webp',
    label: '背景 · 主界面', group: 'boot'
  },
  'images.battle-bg': {
    type: 'image', src: 'assets/2.webp',
    label: '背景 · 战斗', group: 'boot'
  },

  // 身体底模帧动画：AI 生成的动作表经 tools/build-sprites.mjs 抠图拼版后的产物。
  // 这四个 id 只描述「身体形态」，不绑定任何人物 —— 角色身份全部来自 roster.js + 头像。
  'sprites.slim': {
    type: 'image', src: 'assets/images/sprites/slim.webp',
    label: '体型素材 · 偏瘦', group: 'boot'
  },
  'sprites.stout': {
    type: 'image', src: 'assets/images/sprites/stout.webp',
    label: '体型素材 · 壮实', group: 'boot'
  },
  'sprites.normal': {
    type: 'image', src: 'assets/images/sprites/normal.webp',
    label: '体型素材 · 匀称', group: 'boot'
  },
  'sprites.heavy': {
    type: 'image', src: 'assets/images/sprites/heavy.webp',
    label: '体型素材 · 偏胖', group: 'boot'
  },

  // 真实照片头像：assets/贴图/<学号>.webp（512px 长边、保留透明通道），运行时叠到对应的身体帧上
  'faces.1': { type: 'image', src: 'assets/贴图/1.webp', label: '头像 · 学号01', group: 'boot' },
  'faces.3': { type: 'image', src: 'assets/贴图/3.webp', label: '头像 · 学号03', group: 'boot' },
  'faces.6': { type: 'image', src: 'assets/贴图/6.webp', label: '头像 · 学号06', group: 'boot' },
  'faces.10': { type: 'image', src: 'assets/贴图/10.webp', label: '头像 · 学号10', group: 'boot' },
  'faces.11': { type: 'image', src: 'assets/贴图/11.webp', label: '头像 · 学号11', group: 'boot' },
  'faces.13': { type: 'image', src: 'assets/贴图/13.webp', label: '头像 · 学号13', group: 'boot' },
  'faces.18': { type: 'image', src: 'assets/贴图/18.webp', label: '头像 · 学号18', group: 'boot' },
  'faces.21': { type: 'image', src: 'assets/贴图/21.webp', label: '头像 · 学号21', group: 'boot' },
  'faces.23': { type: 'image', src: 'assets/贴图/23.webp', label: '头像 · 学号23', group: 'boot' },
  'faces.26': { type: 'image', src: 'assets/贴图/26.webp', label: '头像 · 学号26', group: 'boot' },
  'faces.28': { type: 'image', src: 'assets/贴图/28.webp', label: '头像 · 学号28', group: 'boot' },
  'faces.31': { type: 'image', src: 'assets/贴图/31.webp', label: '头像 · 学号31', group: 'boot' },
  'faces.32': { type: 'image', src: 'assets/贴图/32.webp', label: '头像 · 学号32', group: 'boot' },
  'faces.33': { type: 'image', src: 'assets/贴图/33.webp', label: '头像 · 学号33', group: 'boot' },
  'faces.39': { type: 'image', src: 'assets/贴图/39.webp', label: '头像 · 学号39', group: 'boot' },

  // UI 组件：tools/build-ui-assets.mjs 生成的独立 PNG（按钮 / 底板 / 血条 / 图标）
  'ui.btn-normal': {
    type: 'image', src: 'assets/images/ui/btn-normal.png',
    label: '界面素材 · 按钮常态', group: 'boot'
  },
  'ui.btn-hover': {
    type: 'image', src: 'assets/images/ui/btn-hover.png',
    label: '界面素材 · 按钮悬停', group: 'boot'
  },
  'ui.btn-disabled': {
    type: 'image', src: 'assets/images/ui/btn-disabled.png',
    label: '界面素材 · 按钮禁用', group: 'boot'
  },
  'ui.panel': {
    type: 'image', src: 'assets/images/ui/panel.png',
    label: '界面素材 · 弹窗底板', group: 'boot'
  },
  'ui.bar-track': {
    type: 'image', src: 'assets/images/ui/bar-track.png',
    label: '界面素材 · 血条底槽', group: 'boot'
  },
  'ui.bar-fill-blue': {
    type: 'image', src: 'assets/images/ui/bar-fill-blue.png',
    label: '界面素材 · 血条蓝', group: 'boot'
  },
  'ui.bar-fill-red': {
    type: 'image', src: 'assets/images/ui/bar-fill-red.png',
    label: '界面素材 · 血条红', group: 'boot'
  },
  'ui.bar-ticks': {
    type: 'image', src: 'assets/images/ui/bar-ticks.png',
    label: '界面素材 · 血条刻度', group: 'boot'
  },
  'ui.icon-move': {
    type: 'image', src: 'assets/images/ui/icon-move.png',
    label: '图标 · 移动', group: 'boot'
  },
  'ui.icon-jump': {
    type: 'image', src: 'assets/images/ui/icon-jump.png',
    label: '图标 · 跳跃', group: 'boot'
  },
  'ui.icon-attack': {
    type: 'image', src: 'assets/images/ui/icon-attack.png',
    label: '图标 · 攻击', group: 'boot'
  },
  'ui.icon-block': {
    type: 'image', src: 'assets/images/ui/icon-block.png',
    label: '图标 · 防御', group: 'boot'
  },
  'ui.icon-sound-on': {
    type: 'image', src: 'assets/images/ui/icon-sound-on.png',
    label: '图标 · 声音开', group: 'boot'
  },
  'ui.icon-sound-off': {
    type: 'image', src: 'assets/images/ui/icon-sound-off.png',
    label: '图标 · 声音关', group: 'boot'
  },
  'ui.icon-back': {
    type: 'image', src: 'assets/images/ui/icon-back.png',
    label: '图标 · 返回', group: 'boot'
  }
};

/** 取某个分组的全部 key */
export function keysOfGroup(group) {
  return Object.keys(MANIFEST).filter(k => MANIFEST[k].group === group);
}
