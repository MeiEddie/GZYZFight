/**
 * 角色精灵图元数据（由 tools/build-sprites.mjs 自动生成，不要手改）
 * ------------------------------------------------------------
 * 每个身材一张 5 列 × 2 行的帧表：idle / walkA / walkB / jump / windup /
 * punch / block / hurt / ko / win，所有帧共用同一锚点（脚底）。
 * 头部贴图坐标不在这里，统一放在 src/data/heads.js。
 */
export const SPRITES = [
  {
    "id": "lan",
    "w": 1890,
    "h": 908,
    "slotW": 378,
    "slotH": 454,
    "cols": 5,
    "anchorX": 189,
    "anchorY": 437,
    "bodyH": 420
  },
  {
    "id": "zang",
    "w": 1845,
    "h": 930,
    "slotW": 369,
    "slotH": 465,
    "cols": 5,
    "anchorX": 184.5,
    "anchorY": 448,
    "bodyH": 420
  },
  {
    "id": "man",
    "w": 1930,
    "h": 912,
    "slotW": 386,
    "slotH": 456,
    "cols": 5,
    "anchorX": 193,
    "anchorY": 439,
    "bodyH": 420
  },
  {
    "id": "zhuang",
    "w": 1840,
    "h": 956,
    "slotW": 368,
    "slotH": 478,
    "cols": 5,
    "anchorX": 184,
    "anchorY": 461,
    "bodyH": 420
  }
];
