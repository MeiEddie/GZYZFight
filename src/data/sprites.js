/**
 * 身体底模元数据（由 tools/build-sprites.mjs 自动生成，不要手改）
 * ------------------------------------------------------------
 * 每个体型一张 5 列 × 2 行的帧表：idle / walkA / walkB / jump / windup /
 * punch / block / hurt / ko / win，所有帧共用同一锚点（脚底）。
 * id 只描述身体形态，不携带任何人物身份：
 *   slim 偏瘦 / normal 匀称 / heavy 偏胖 / stout 壮实。
 * 角色名字与数值一律在 src/data/roster.js，头部贴图坐标在 src/data/heads.js。
 */
export const SPRITES = [
  {
    "id": "slim",
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
    "id": "stout",
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
    "id": "normal",
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
    "id": "heavy",
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
