// Простая геометрия для строительства. Прямоугольник: { x, z, hw, hd } — центр и половины сторон.

// Прямоугольник постройки с учётом поворота (rot = 0..3, каждый шаг — 90°)
export const rectOf = (x, z, w, d, rot) =>
  rot % 2 ? { x, z, hw: d / 2, hd: w / 2 } : { x, z, hw: w / 2, hd: d / 2 };

// Пересекаются ли два прямоугольника (касание допускается)
export function rectsOverlap(a, b, eps = 0.01) {
  return Math.abs(a.x - b.x) < a.hw + b.hw - eps && Math.abs(a.z - b.z) < a.hd + b.hd - eps;
}

export function circleRectOverlap(cx, cz, r, rect) {
  const nx = Math.max(rect.x - rect.hw, Math.min(rect.x + rect.hw, cx));
  const nz = Math.max(rect.z - rect.hd, Math.min(rect.z + rect.hd, cz));
  return Math.hypot(cx - nx, cz - nz) < r;
}

// Контрольные точки прямоугольника: центр, углы и середины сторон
export function samplePoints(r) {
  const pts = [];
  for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) pts.push({ x: r.x + dx * r.hw, z: r.z + dz * r.hd });
  return pts;
}
