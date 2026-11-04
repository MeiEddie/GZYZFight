/**
 * 角色资料表（人物管理）
 * ------------------------------------------------------------
 * 想改人物 / 换学号座位，直接改这个文件，保存后刷新网页即可。
 * 网页运行时不会修改这里的数据，所有调整都以本地文件为准。
 *
 *   no       学号（1-40），对应选人界面 10 列 × 4 行的座位：
 *            从左到右、从上到下依次是 01…40。
 *            学号必须唯一；留空的学号会显示为「空位」，不能被选中开打。
 *   name     角色名（选人、HUD、结算都会同步显示）
 *   role     班级 / 身份，显示在选人界面信息条与结算副标题
 *   tag      类型标签：速度型 / 均衡型 / 力量型 / 防御型
 *            —— 数值不再逐个写，而是查下面的 FIGHTER_TYPES 自动套用：
 *               改 tag 就等于换整套数值（hp/move/dmg/前摇/判定/收招/距离/属性条/颜色）。
 *            —— 身体外观也跟着类型走（TYPE_BODY 见下方）：
 *               速度型 = 偏瘦（slim）、均衡型 = 匀称（normal）、
 *               力量型 = 偏胖（heavy）、防御型 = 壮实（stout）。
 *               这四个 id 只是「身体素材」，本身不带任何人物信息：
 *               名字、班级、头像、数值全部在本文件里定义，与底模无关。
 *               改完 tag 保存刷新即可，头像与身体都是运行时合成，无需重新构建。
 *   intro    胜利结算时显示的一段介绍（自己写，长度建议不超过 3 行）
 *   faceRot  可选：头像额外旋转（弧度，顺时针为正）
 *
 * 想单独微调某人：在它的条目里再写一次同名字段即可覆盖类型默认值，例如
 *   { no: 7, name: '…', tag: '速度型', hp: 120 }
 * 其余字段仍从「速度型」里取。
 *
 * 说明：身体 id 与头像都由学号自动推导：
 *   身体 = TYPE_BODY[tag]，头像 = assets/贴图/<no>.png（通过 manifest 的 faces.<no> 加载）。
 *   运行时把照片叠到 src/data/heads.js 记录的头部坐标上，位置可在那里调；
 *   头像大小只由 sprite-render.js 里的战斗 / 头像框两个常数控制。
 */

/** 四种类型的统一数值（改这里 = 全类型角色同步生效） */
export const FIGHTER_TYPES = {
  速度型: {
    tagColor: '#0f9fd8',
    hp: 106, move: 214, dmg: 9.2, windup: .09, active: .09, dur: .36, reach: 94,
    stats: { speed: 5, power: 3, guard: 2 }
  },
  均衡型: {
    tagColor: '#7a5cf0',
    hp: 116, move: 192, dmg: 10.6, windup: .11, active: .1, dur: .41, reach: 98,
    stats: { speed: 4, power: 4, guard: 3 }
  },
  力量型: {
    tagColor: '#d99100',
    hp: 124, move: 168, dmg: 13, windup: .14, active: .1, dur: .47, reach: 102,
    stats: { speed: 2, power: 5, guard: 3 }
  },
  防御型: {
    tagColor: '#e2632f',
    hp: 136, move: 152, dmg: 10.2, windup: .16, active: .11, dur: .51, reach: 96,
    stats: { speed: 2, power: 3, guard: 5 }
  }
};

/**
 * 类型 → 身体底模（精灵表）。
 * 左侧是玩法类型，右侧是 src/data/sprites.js 里的体型 id，只表达身体形态，
 * 不指向任何具体人物；头像始终是 assets/贴图/<学号>.png。
 */
export const TYPE_BODY = {
  速度型: 'slim',
  均衡型: 'normal',
  力量型: 'heavy',
  防御型: 'stout'
};

/** 条目里只写「身份 + 类型 + 介绍」，数值由类型自动补全 */
export const ROSTER = [
  {
    no: 1, name: '梅圣尧', role: '23届16班', tag: '速度型',
    intro: '高一（3）班短跑主力。出手快、收招快，抢节奏的一把好手。'
  },
  {
    no: 3, name: '陈相宇', role: '23届16班', tag: '速度型',
    intro: '校队队长，一身紫白校服。速度力量都不吃亏的全能选手。'
  },
  {
    no: 6, name: '陈子奕', role: '23届16班', tag: '力量型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 10, name: '房彬彬', role: '23届16班', tag: '速度型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 11, name: '郭梓熙', role: '23届16班', tag: '速度型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 13, name: '黄子桓', role: '23届16班', tag: '力量型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 18, name: '刘睿哲', role: '23届16班', tag: '速度型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 21, name: '隆子涵', role: '23届16班', tag: '速度型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 23, name: '乔巧', role: '23届16班', tag: '均衡型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 26, name: '陶明泽', role: '23届16班', tag: '防御型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 28, name: '徐柏轩', role: '23届16班', tag: '防御型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 31, name: '杨紫仁', role: '23届16班', tag: '速度型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 32, name: '叶天蓝', role: '23届16班', tag: '防御型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 33, name: '余天睿', role: '23届16班', tag: '防御型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  },
  {
    no: 39, name: '钟瀚林', role: '23届16班', tag: '速度型',
    intro: '真实照片换脸角色。想改名字 / 班级 / 数值，直接改 roster.js。'
  }
].map(def => ({
  ...(FIGHTER_TYPES[def.tag] || FIGHTER_TYPES['均衡型']),
  ...def,
  id: TYPE_BODY[def.tag] || 'normal',   // 身体底模（体型 id）
  face: def.no                      // 头像 = assets/贴图/<学号>.png
}));
