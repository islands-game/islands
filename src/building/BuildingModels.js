import * as THREE from 'three';

// Модели построек из простых фигур. Начало координат — центр основания, ширина вдоль x, глубина вдоль z.
const lambert = color => new THREE.MeshLambertMaterial({ color, flatShading: true });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Верх платформ и мостов находится на высоте 0.1 (WALK_Y в World.js)
function platform({ w, d }, color) {
  const g = new THREE.Group();
  g.add(box(w, 0.3, d, lambert(color), 0, -0.05, 0));
  g.add(box(w - 0.4, 0.04, d - 0.4, lambert(0xd9b88a), 0, 0.1, 0)); // светлый настил
  return g;
}

function wall({ w, d }, color) {
  const g = new THREE.Group();
  const stone = lambert(color);
  g.add(box(w, 2, d, stone, 0, 1, 0));
  const n = Math.max(2, Math.round(w / 1));
  for (let i = 0; i < n; i += 2) {
    g.add(box(w / n, 0.3, d, stone, -w / 2 + (i + 0.5) * (w / n), 2.15, 0));
  }
  return g;
}

function bridge({ w, d }, color) {
  const g = new THREE.Group();
  const planks = lambert(color), rail = lambert(0x7a4e2d);
  const n = Math.floor(d / 0.6);
  for (let i = 0; i < n; i++) g.add(box(w, 0.12, 0.5, planks, 0, 0.04, -d / 2 + (i + 0.5) * (d / n)));
  for (const sx of [-1, 1]) {
    g.add(box(0.1, 0.1, d, rail, sx * (w / 2 - 0.05), 0.7, 0));
    for (const sz of [-1, 1]) g.add(box(0.14, 0.8, 0.14, rail, sx * (w / 2 - 0.05), 0.4, sz * (d / 2 - 0.1)));
  }
  return g;
}

function house({ w, d }, color) {
  const g = new THREE.Group();
  g.add(box(w - 0.4, 2.4, d - 0.4, lambert(color), 0, 1.2, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry((Math.max(w, d) - 0.4) * 0.9, 1.8, 4), lambert(0x5b8def));
  roof.position.y = 3.3;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.add(box(0.9, 1.6, 0.1, lambert(0x6b4423), 0, 0.8, d / 2 - 0.2));
  return g;
}

// Загон: забор по краю с проходом спереди (по оси +z)
function pen({ w, d }, color) {
  const g = new THREE.Group();
  const wood = lambert(color);
  g.add(box(w, 0.04, d, lambert(0xb8d98a), 0, 0.02, 0));
  const post = (x, z) => g.add(box(0.2, 1, 0.2, wood, x, 0.5, z));
  const rails = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    for (const y of [0.4, 0.8]) {
      const r = box(len, 0.08, 0.08, wood, (x1 + x2) / 2, y, (z1 + z2) / 2);
      r.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      g.add(r);
    }
  };
  const hw = w / 2 - 0.1, hd = d / 2 - 0.1, gap = 1.2;
  rails(-hw, -hd, hw, -hd);      // задняя сторона
  rails(-hw, -hd, -hw, hd);      // левая
  rails(hw, -hd, hw, hd);        // правая
  rails(-hw, hd, -gap, hd);      // передняя слева от прохода
  rails(gap, hd, hw, hd);        // передняя справа от прохода
  for (let x = -hw; x <= hw + 0.01; x += (2 * hw) / Math.round(w)) { post(x, -hd); }
  for (let z = -hd; z <= hd + 0.01; z += (2 * hd) / Math.round(d)) { post(-hw, z); post(hw, z); }
  post(-gap, hd); post(gap, hd);
  return g;
}

const BUILDERS = { platform, wall, bridge, house, pen };

export function buildModel(def) {
  return (BUILDERS[def.model] ?? platform)(def.size, def.color);
}

// Освобождает память модели
export function disposeModel(group) {
  group.traverse(o => {
    if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
  });
}
