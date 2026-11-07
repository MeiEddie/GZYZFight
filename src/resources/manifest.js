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
 *   group  boot   = 首屏必需，全部加载完成才显示菜单
 *          battle = 战斗 / 结算必需，菜单出现后在后台预载，进战斗前校验
 *          bgm    = 校歌原声，首屏出现后再加载，不参与启动门禁
 *   loop   仅 audio：是否循环
 */

export const MANIFEST = {
  // 校歌原件 5.3MB（192k 立体声），压缩后约 1.3MB（VBR 单声道 32kHz）。
  // 原件在 assets_origin/pre-compress-20261104/audio/，重编码参数见 tools/compress-assets.mjs。
  // 不参与启动门禁：首屏出现后由 main.js 后台加载，菜单不会为它空等。
  'audio.school-anthem': {
    type: 'audio',
    src: 'assets/audio/school-anthem.mp3',
    label: '校歌《奉献美好给未来》',
    group: 'bgm',
    loop: true
  },

  // 击打音效：qubodupPunch（CC0，免署名）
  // 来源：https://opengameart.org/content/punch
  'audio.hit': {
    type: 'audio',
    src: 'assets/audio/hit.ogg',
    label: '音效 · 击打',
    group: 'battle'
  },

  // 胜利 / 失败音效（均 CC0，免署名）
  // 来源：https://opengameart.org/content/win-jingle
  'audio.win': {
    type: 'audio',
    src: 'assets/audio/win.ogg',
    label: '音效 · 胜利',
    group: 'battle'
  },
  // 来源：https://opengameart.org/content/game-over-trumpet-sfx
  'audio.lose': {
    type: 'audio',
    src: 'assets/audio/lose.mp3',
    label: '音效 · 失败',
    group: 'battle'
  },

  // 开场音效
  // 准备：pleasing-bell（CC0，免署名）
  // 来源：https://opengameart.org/content/pleasing-bell-sound-effect
  'audio.ready': {
    type: 'audio',
    src: 'assets/audio/ready.mp3',
    label: '音效 · 准备',
    group: 'battle'
  },
  // 开打 / KO：DRAGON 播报包（CC-BY，署名 VoiceBosch / SoundBiter）
  // 两句取自同一个播报员，音色与语气完全一致
  // 来源：https://opengameart.org/content/dragon-announcer-audio-pack
  'audio.fight': {
    type: 'audio',
    src: 'assets/audio/fight.mp3',
    label: '音效 · 开打',
    group: 'battle'
  },
  'audio.ko': {
    type: 'audio',
    src: 'assets/audio/ko.mp3',
    label: '音效 · KO',
    group: 'battle'
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
    src: 'assets/audio/jump.mp3',
    label: '音效 · 跳跃',
    group: 'battle'
  },
  'audio.swing': {
    type: 'audio',
    src: 'assets/audio/swing.mp3',
    label: '音效 · 挥拳',
    group: 'battle'
  },

  // 格挡：Metal Clang Sounds（CC0）
  // https://opengameart.org/content/metal-clang-sounds
  'audio.block': {
    type: 'audio',
    src: 'assets/audio/block.mp3',
    label: '音效 · 格挡',
    group: 'battle'
  },

  // 读秒提示：Interface Beeps（CC0）
  // https://opengameart.org/content/interface-beeps
  'audio.time': {
    type: 'audio',
    src: 'assets/audio/time.mp3',
    label: '音效 · 读秒',
    group: 'battle'
  },

  // 场景背景图：主界面 / 战斗界面
  'images.menu-bg': {
    type: 'image', src: 'assets/1.webp',
    label: '背景 · 主界面', group: 'boot'
  },
  'images.battle-bg': {
    type: 'image', src: 'assets/2.webp',
    label: '背景 · 战斗', group: 'battle'
  },

  // 身体底模帧动画：AI 生成的动作表经 tools/build-sprites.mjs 抠图拼版后的产物。
  // 这四个 id 只描述「身体形态」，不绑定任何人物 —— 角色身份全部来自 roster.js + 头像。
  //
  // 只有 slim 属于 boot：主菜单两侧展示的角色是 ROSTER[0] 与 ROSTER[1]，
  // 两位都是「速度型」→ slim。选人界面只画头像，不画身体，所以其余三种体型
  // 等到进战斗前再校验即可。若改动了菜单展示角色 / 其类型，记得把对应体型挪回 boot。
  'sprites.slim': {
    type: 'image', src: 'assets/images/sprites/slim.webp',
    label: '体型素材 · 偏瘦', group: 'boot'
  },
  'sprites.stout': {
    type: 'image', src: 'assets/images/sprites/stout.webp',
    label: '体型素材 · 壮实', group: 'battle'
  },
  'sprites.normal': {
    type: 'image', src: 'assets/images/sprites/normal.webp',
    label: '体型素材 · 匀称', group: 'battle'
  },
  'sprites.heavy': {
    type: 'image', src: 'assets/images/sprites/heavy.webp',
    label: '体型素材 · 偏胖', group: 'battle'
  },

  // 真实照片头像：assets/贴图/<学号>.webp（160px 长边、保留透明通道），运行时叠到对应的身体帧上。
  // 运行时最大只画 81px，因此 160px 仍有约 2 倍余量；原件是 512px，存在上述备份目录。
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
