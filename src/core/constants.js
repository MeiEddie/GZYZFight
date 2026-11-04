/**
 * 全局常量
 * ------------------------------------------------------------
 * 这里是整个工程的「魔法数字」出口：画布逻辑分辨率、字体栈、
 * 地面基线。改数值只改这里，不要在绘制代码里写死。
 */

/** 画布逻辑分辨率（CSS 像素），所有坐标都以这个尺寸为基准 */
export const W = 1280;
export const H = 720;

/** 操场地面基线 y，角色脚底站在这条线上 */
export const GROUND_Y = 656;

/** 正文字体栈（中文优先 Microsoft YaHei） */
export const FONT = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif';
/** 标题/数字用的粗体展示字体栈 */
export const DISPLAY = '"Arial Black","Microsoft YaHei","PingFang SC",sans-serif';
