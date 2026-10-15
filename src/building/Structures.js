import { rectOf } from './geometry.js';

// Постройки со стенами и дверью (дом, загон). Дверь всегда с локальной стороны +z.
// Локальные прямоугольники — для постройки без поворота; rot поворачивает их на 90° * rot.
const WALL = 0.4;        // толщина стены дома
const DOOR_HALF = 0.7;   // половина ширины двери дома
const FENCE = 0.3;       // толщина забора загона
const GATE_HALF = 1.2;   // половина ширины ворот загона (как расстояние между столбами в модели)

// Стены с проёмом спереди: задняя, левая, правая и две части передней
function wallsWithGap(w, d, t, gapHalf) {
  const frontW = w / 2 - gapHalf;
  return [
    { x: 0, z: -d / 2 + t / 2, hw: w / 2, hd: t / 2 },
    { x: -w / 2 + t / 2, z: 0, hw: t / 2, hd: d / 2 },
    { x: w / 2 - t / 2, z: 0, hw: t / 2, hd: d / 2 },
    { x: -(gapHalf + frontW / 2), z: d / 2 - t / 2, hw: frontW / 2, hd: t / 2 },
    { x: gapHalf + frontW / 2, z: d / 2 - t / 2, hw: frontW / 2, hd: t / 2 },
  ];
}

export function localWalls(def) {
  const { w, d } = def.size;
  if (def.structure === 'house') return wallsWithGap(w, d, WALL, DOOR_HALF);
  if (def.structure === 'pen') return wallsWithGap(w, d, FENCE, GATE_HALF);
  return [];
}

// Поворот точки из локальных координат в мировые (rot = 0..3)
function toWorld(lx, lz, x, z, rot) {
  const c = [1, 0, -1, 0][rot % 4], s = [0, 1, 0, -1][rot % 4];
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

function rotateRect(r, x, z, rot) {
  const p = toWorld(r.x, r.z, x, z, rot);
  return rot % 2 ? { x: p.x, z: p.z, hw: r.hd, hd: r.hw } : { x: p.x, z: p.z, hw: r.hw, hd: r.hd };
}

// Твёрдые стены постройки в мире
export function structureRects(def, x, z, rot) {
  return localWalls(def).map(r => rotateRect(r, x, z, rot));
}

// Комната внутри дома (где можно спрятаться)
export function interiorRect(def, x, z, rot) {
  const { w, d } = def.size;
  return rotateRect({ x: 0, z: 0, hw: w / 2 - WALL, hd: d / 2 - WALL }, x, z, rot);
}

// Где стоит кровать (у задней стены)
export function bedPosition(def, x, z, rot) {
  const { d } = def.size;
  return toWorld(-0.7, -d / 2 + WALL + 0.55, x, z, rot);
}

export const HOUSE_WALL = WALL;
export { rectOf };
