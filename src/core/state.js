/**
 * 全局游戏状态
 * ------------------------------------------------------------
 * 只保存「数据」，不放绘制或逻辑函数，避免变成上帝对象。
 * 所有场景共享这一个 game 实例（模块单例）。
 */

export const game = {
  /** 当前场景：menu | help | select | battle | result */
  scene: 'menu',
  /** 进入当前场景后经过的时间（秒），用于入场动画 */
  enterT: 0,
  /** 场景切换黑场强度 0..1 */
  fade: 1,
  /** 全局时间（秒），驱动各种循环动画 */
  t: 0,

  /** 鼠标逻辑坐标与是否活跃 */
  mouse: { x: -999, y: -999 },
  mouseActive: false,
  /** 本帧的点击位置（消费一次即清空） */
  click: null,

  /** pvp | pve */
  mode: 'pvp',
  /** 主菜单当前选中项 */
  menuIndex: 0,
  /** 从哪个场景进入操作说明（用于返回） */
  helpFrom: 'menu',

  /** 选人阶段状态：p1/p2 是 ROSTER 下标，cur1/cur2 是学号座位光标（0..39） */
  sel: { phase: 1, p1: 0, p2: 1, cur1: 0, cur2: 1, cpuRoulette: 0, cpuPick: 0, rouletteTick: 0, confirmFx: 0, startTimer: 0 },

  /** 战斗会话数据（战斗场景专属），离开战斗时置 null */
  battle: null,
  /** 结算数据 */
  result: null,
  /** 战斗暂停 */
  paused: false,
  pauseIndex: 0,

  /** 结算界面选中项与计时 */
  resultIndex: 0,
  resultT: 0
};

/**
 * 切换场景：重置入场动画与黑场，并丢弃上一帧的点击，
 * 防止「点一下穿透到下一个场景」。
 */
export function goScene(name) {
  game.scene = name;
  game.enterT = 0;
  game.fade = 1;
  game.click = null;
}
